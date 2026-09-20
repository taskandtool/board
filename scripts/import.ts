// CSV in: the spreadsheet the business runs on today becomes cards.
// `node scripts/import.mjs file.csv --dry-run` first, always.
import { readFileSync } from "node:fs";
import { parseArgs, flag, has, withDb, who, resolveBoard, resolveStatus, fail } from "./lib";
import { guessMap, parseCsv, parseDate, parsePriority } from "./csv";
import * as Q from "../src/db/queries";

const HELP = `import.mjs <file.csv> [--board key] [--map title=Task,due_on=Due,...] [--status key] [--dry-run]

Reads a CSV with a header row. Columns are matched to card fields by name
(title, status, assignee, due_on, priority, tags, notes, customer_ref, and
any custom field key from board.config.json); --map overrides a match as
field=Header. A status value that names no column falls back to --status
(default: the first column). --dry-run prints the mapping and the first
rows and writes nothing.`;

const a = parseArgs(process.argv.slice(2));
const [file] = a._;
if (!file || has(a, "help")) { console.log(HELP); process.exit(file ? 0 : 1); }

const rows = parseCsv(readFileSync(file, "utf8"));
if (rows.length < 2) fail("the file has no data rows");
const headers = rows[0].map((h) => h.trim());
const map = guessMap(headers);
for (const kv of (flag(a, "map") ?? "").split(",").filter(Boolean)) {
  const [field, header] = kv.split("=");
  if (field && header) map[field.trim()] = header.trim();
}
for (const [field, header] of Object.entries(map)) if (!headers.includes(header)) fail(`--map ${field}=${header}: no such header; headers are ${headers.join(", ")}`);
if (!map.title) fail(`no title column found; pass --map title=<Header> (headers: ${headers.join(", ")})`);

const cfg = JSON.parse(readFileSync("board.config.json", "utf8"));
const customKeys: string[] = (cfg.card?.custom ?? []).map((f: { key: string }) => f.key);
for (const k of customKeys) if (!map[k]) { const h = headers.find((x) => x.toLowerCase() === k.toLowerCase()); if (h) map[k] = h; }
const col = (r: string[], field: string) => { const h = map[field]; return h ? (r[headers.indexOf(h)] ?? "").trim() : ""; };

await withDb(async (pool) => {
  const board = await resolveBoard(pool, flag(a, "board"));
  const cols = await Q.statuses(pool, board.id);
  const fallback = await resolveStatus(pool, board, flag(a, "status"));
  const statusFor = (v: string) => cols.find((c) => c.key === v.toLowerCase() || c.label.toLowerCase() === v.toLowerCase()) ?? fallback;
  const plan = rows.slice(1).map((r) => ({
    title: col(r, "title"), status: statusFor(col(r, "status")), assignee: col(r, "assignee") || null, due_on: parseDate(col(r, "due_on")),
    priority: parsePriority(col(r, "priority")), tags: col(r, "tags").split(/[;,]/).map((t) => t.trim()).filter(Boolean), notes: col(r, "notes"),
    customer_ref: col(r, "customer_ref") || null, fields: Object.fromEntries(customKeys.map((k) => [k, col(r, k)]).filter(([, v]) => v)),
  })).filter((p) => p.title);
  console.log("mapping: " + Object.entries(map).map(([f, h]) => `${f} <- "${h}"`).join(", "));
  console.log(`${plan.length} rows with a title, into ${board.name}`);
  const unknownStatus = rows.slice(1).map((r) => col(r, "status")).filter((v) => v && !cols.some((c) => c.key === v.toLowerCase() || c.label.toLowerCase() === v.toLowerCase()));
  if (unknownStatus.length) console.log(`status values with no column (fall back to ${fallback.label}): ${[...new Set(unknownStatus)].join(", ")}`);
  if (has(a, "dry-run")) {
    for (const p of plan.slice(0, 10)) console.log(`  ${p.title}  [${p.status.label}]${p.assignee ? " @" + p.assignee : ""}${p.due_on ? " due " + p.due_on : ""}${p.tags.length ? " #" + p.tags.join(" #") : ""}`);
    if (plan.length > 10) console.log(`  ... and ${plan.length - 10} more`);
    console.log("dry run: nothing written");
    return;
  }
  let n = 0;
  for (const p of plan) {
    await Q.createItem(pool, board.id, { title: p.title, status_id: p.status.id, assignee: p.assignee, due_on: p.due_on, priority: p.priority, tags: p.tags, notes: p.notes, customer_ref: p.customer_ref, fields: p.fields }, who());
    n++;
  }
  console.log(`imported ${n} cards into ${board.name}`);
});
