// CSV or .xlsx in: the spreadsheet the business runs on today becomes cards.
// `node scripts/import.mjs file.csv --dry-run` first, always.
import { readFileSync } from "node:fs";
import type pg from "pg";
import { resolve } from "node:path";
import { flag, flags, has, misused, done, fail } from "../src/data/cli.mjs";
import { args, plain, withDb, who, resolveBoard, resolveStatus, rerunWith } from "./lib";
import { cfg } from "../src/config";
import { guessMap, parseCsv, parseDate, parsePriority } from "./csv";
import { readXlsx } from "./xlsx";
import * as Q from "../src/db/queries";

const HELP = `import.mjs <file.csv|file.xlsx> [--board key] [--map title=Task,due_on=Due,...] [--status key] [--dry-run]

Reads a CSV, or the first sheet of an .xlsx, with a header row. Columns
are matched to card fields by name (title, status, assignee, due_on,
priority, tags, notes, customer_ref, and any custom field key from
board.config.json); --map overrides a match as
field=Header. A status value that names no column falls back to --status
(default: the first column). A relative path is read from where you ran it.

Safe to run twice: a row whose title and customer_ref match a card already
on the board (archived ones too) is left alone, and the rest go in all at
once or not at all. Prints "import: N new cards on <board>, M already
there, left alone". --dry-run prints the mapping, those two counts and the
first ten rows, and writes nothing.`;

const a = args(["dry-run"]);
plain(a, HELP, ["board", "map", "status", "dry-run"], true);
if (a._.length !== 1) misused(`import: ${a._.length ? `takes one CSV file, got ${a._.join(" ")}` : "name the CSV file to read"}`, "node scripts/import.mjs --help");
const [file] = a._;

const path = resolve(process.env.CALLER_CWD ?? ".", file);
let bytes!: Buffer;
try {
  bytes = readFileSync(path);
} catch (e) {
  const err = e as NodeJS.ErrnoException;
  misused(`import: cannot read ${path}: ${err.code === "ENOENT" ? "no such file" : err.code === "EISDIR" ? "it is a folder" : err.message}`, `ls ${resolve(path, "..")}`);
}
let rows: string[][] = [];
try {
  rows = /\.xlsx$/i.test(file) ? readXlsx(bytes) : parseCsv(bytes.toString("utf8"));
} catch (e) {
  fail(`import: ${file}: ${(e as Error).message}; save it from the spreadsheet as CSV and import that`, `node scripts/import.mjs ${file.replace(/\.xlsx$/i, ".csv")} --dry-run`);
}
const again = rerunWith().replace(/ --dry-run\b/, "");
const dry = `${again} --dry-run`;
if (rows.length < 2) misused(`import: ${path} has no data rows under its header`, `head -3 ${path}`);
const headers = rows[0].map((h) => h.trim());
const map = guessMap(headers);
for (const kv of flags(a, "map").flatMap((m) => m.split(",")).filter(Boolean)) {
  const [field, header] = kv.split("=");
  if (field && header) map[field.trim()] = header.trim();
}
for (const [field, header] of Object.entries(map)) if (!headers.includes(header)) misused(`import: --map ${field}=${header}: no such header; headers are ${headers.join(", ")}`, dry);
if (!map.title) misused(`import: no title column found; headers are ${headers.join(", ")}`, `node scripts/import.mjs ${file} --map title=<Header> --dry-run`);

const customKeys = cfg.card.custom.map((f) => f.key);
for (const k of customKeys) if (!map[k]) { const h = headers.find((x) => x.toLowerCase() === k.toLowerCase()); if (h) map[k] = h; }
const col = (r: string[], field: string) => { const h = map[field]; return h ? (r[headers.indexOf(h)] ?? "").trim() : ""; };

// A row is already on the board when a card there has its title and customer_ref.
const keyOf = (title: string, ref: string | null) => `${Q.cleanTitle(title).toLowerCase()}\u0000${(ref ?? "").trim().toLowerCase()}`;

await withDb(async (pool) => {
  const board = await resolveBoard(pool, flag(a, "board"));
  const cols = await Q.statuses(pool, board.id);
  const fallback = await resolveStatus(pool, board, flag(a, "status"));
  const statusFor = (v: string) => cols.find((c) => c.key === v.toLowerCase() || c.label.toLowerCase() === v.toLowerCase()) ?? fallback;
  const plan = rows.slice(1).map((r) => ({
    title: col(r, "title"), status: statusFor(col(r, "status")), assignee: col(r, "assignee") || null, due_on: parseDate(col(r, "due_on")),
    priority: parsePriority(col(r, "priority")), tags: col(r, "tags").split(/[;,]/).map((t) => t.trim()).filter(Boolean), notes: col(r, "notes"),
    customer_ref: col(r, "customer_ref") || null, fields: Object.fromEntries(customKeys.map((k) => [k, col(r, k)]).filter(([, v]) => v)),
  })).filter((p) => Q.cleanTitle(p.title));

  // Which rows are new: each card already there matches one row, so a sheet
  // that lists the same job twice keeps both.
  const split = async (q: pg.Pool | pg.PoolClient) => {
    const there = new Map<string, number>();
    for (const r of (await q.query<{ title: string; customer_ref: string | null }>("select title, customer_ref from items where board_id = $1", [board.id])).rows) {
      const k = keyOf(r.title, r.customer_ref);
      there.set(k, (there.get(k) ?? 0) + 1);
    }
    const fresh = plan.filter((p) => {
      const k = keyOf(p.title, p.customer_ref);
      const n = there.get(k) ?? 0;
      if (n) there.set(k, n - 1);
      return !n;
    });
    return { fresh, kept: plan.length - fresh.length };
  };

  const unknown = [...new Set(rows.slice(1).map((r) => col(r, "status")).filter((v) => v && !cols.some((c) => c.key === v.toLowerCase() || c.label.toLowerCase() === v.toLowerCase())))];
  const lines = [
    "mapping: " + Object.entries(map).map(([f, h]) => `${f} <- "${h}"`).join(", "),
    ...(unknown.length ? [`status values with no column, put in ${fallback.label}: ${unknown.join(", ")}`] : []),
  ];

  if (has(a, "dry-run")) {
    const { fresh, kept } = await split(pool);
    const shown = fresh.slice(0, 10).map((p) => `  ${p.title}  [${p.status.label}]${p.assignee ? " @" + p.assignee : ""}${p.due_on ? " due " + p.due_on : ""}${p.tags.length ? " #" + p.tags.join(" #") : ""}`);
    if (fresh.length > 10) shown.push(`  ... and ${fresh.length - 10} more`);
    done("import", `dry run, nothing written: ${fresh.length} new card${fresh.length === 1 ? "" : "s"} for ${board.name}, ${kept} already there`, { lines: [...lines, ...(shown.length ? ["new:", ...shown] : [])], next: again });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("begin");
    // One import per board at a time, so two runs cannot both find a row new.
    await client.query("select id from boards where id = $1 for update", [board.id]);
    const { fresh, kept } = await split(client);
    for (const p of fresh) {
      await Q.createItem(client, board.id, { title: p.title, status_id: p.status.id, assignee: p.assignee, due_on: p.due_on, priority: p.priority, tags: p.tags, notes: p.notes, customer_ref: p.customer_ref, fields: p.fields }, who());
    }
    await client.query("commit");
    done("import", `${fresh.length} new card${fresh.length === 1 ? "" : "s"} on ${board.name}, ${kept} already there, left alone`, { lines, next: `node scripts/items.mjs list --board ${board.key}` });
  } catch (e) {
    await client.query("rollback").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
});
