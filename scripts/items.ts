// The AI's hands on the board. `node scripts/items.mjs --help`.
import { existsSync, readFileSync } from "node:fs";
import { basename, extname, resolve } from "node:path";
import { flag, flags, has, usage, misused, fail, out, localTime } from "../src/data/cli.mjs";
import { args, withDb, who, resolveBoard, boardsFor, resolveStatus, fmtItem, report, at, rerunWith } from "./lib";
import * as Q from "../src/db/queries";
import { STALE_DAYS } from "../src/db/queries";
import { cfg } from "../src/config";

const HELP = `items.mjs: read and change the board's cards from the command line.

  list [--board key] [--status key] [--assignee email] [--tag t]... [--overdue] [--stale 3d] [--over-limit] [--archived]
  add "title" [--board key] [--status key] [--due YYYY-MM-DD] [--assignee email] [--priority p] [--tag t]... [--field k=v]... [--notes "text"] [--customer "ref"] [--top]
  show <id>
  move <id> <status-key> [--to-top]
  edit <id> [--title t] [--due d|none] [--assignee e|none] [--priority p] [--tag t]... [--notes "text"] [--customer "ref"] [--field k=v]...
  tag <id> +tag -tag ...
  note <id> "text"                   a comment on the card
  check <id> "step" [--done]         add a checklist step (or mark one done by its text)
  attach <id> <file>...              photos or files onto the card, ${Q.formatSize(Q.MAX_FILE_BYTES)} each at most
  find "words" [--board key]
  archive <id> | restore <id>
  archive-done [--board key] [--older 14]
  attention [--board key]            what needs attention, and why
  summary [--board key]

  --priority is normal, high or urgent (or 0, 1, 2).
  --field takes a custom field from board.config.json: ${cfg.card.custom.map((f) => f.key).join(", ") || "none declared"}.
  --tag on list keeps cards carrying every tag given.
  --board: list, find, attention and summary cover every board without it; add and
  archive-done need it once there is more than one board. A card id names its own board.
  --json on any command prints JSON instead of text: list, find, attention and summary
  print the result itself with --board, and [{ "board": key, "result": ... }] without it.
  --as email records who acted (default: BOARD_USER or "AI").
  A change prints what it did to which card, then Next: the command to look at it.
Boards and columns: node scripts/board.mjs --help.`;

// Each command and the flags it takes; any other flag is a misuse.
const ALLOWED: Record<string, string[]> = {
  list: ["board", "status", "assignee", "tag", "overdue", "stale", "over-limit", "archived"],
  add: ["board", "status", "due", "assignee", "priority", "tag", "field", "notes", "customer", "top", "as"],
  show: [],
  move: ["to-top", "as"],
  edit: ["title", "due", "assignee", "priority", "tag", "notes", "customer", "field", "as"],
  tag: ["as"],
  note: ["as"],
  check: ["done", "as"],
  attach: ["as"],
  find: ["board"],
  archive: ["as"],
  restore: ["as"],
  "archive-done": ["board", "older", "as"],
  attention: ["board"],
  summary: ["board"],
};
// Commands that name a card by its id, first.
const BY_ID = ["show", "move", "edit", "tag", "note", "check", "attach", "archive", "restore"];
const PRIORITY_NAMES = Q.PRIORITIES.map((p) => p.toLowerCase());

const a = args(["overdue", "over-limit", "archived", "top", "to-top", "done"]);
const json = has(a, "json");
const actor = flag(a, "as") ?? who();
const [cmd, ...rest] = a._;
usage(a, cmd, Object.keys(ALLOWED), HELP, "items", ALLOWED);

// Checked before the database: a wrong value is a misuse, never a quiet default.
const priority = (() => {
  const p = flag(a, "priority");
  if (p === undefined) return undefined;
  const v = p.trim().toLowerCase();
  const n = /^[012]$/.test(v) ? Number(v) : PRIORITY_NAMES.indexOf(v);
  if (n < 0) misused(`${at}: --priority ${p} is not a priority; use normal, high or urgent (or 0, 1, 2)`, rerunWith("--priority", "high"));
  return n;
})();

const fields = (() => {
  const f: Record<string, string> = {};
  for (const kv of flags(a, "field")) {
    const i = kv.indexOf("=");
    const k = i > 0 ? kv.slice(0, i).trim() : "";
    const def = cfg.card.custom.find((x) => x.key === k);
    if (!def) misused(`${at}: --field ${kv}: no custom field ${k || "(none named)"}; declared: ${cfg.card.custom.map((x) => x.key).join(", ") || "none"}`, "node scripts/items.mjs --help");
    const v = kv.slice(i + 1).trim();
    if (def.type === "select" && v && !def.options!.includes(v)) misused(`${at}: --field ${k}=${v}: ${k} is one of ${def.options!.join(", ")}`, "node scripts/items.mjs --help");
    if ((def.type === "number" || def.type === "money") && v && !Number.isFinite(Number(v))) misused(`${at}: --field ${k}=${v}: ${k} is a number; write it without symbols, like ${k}=1250`, "node scripts/items.mjs --help");
    f[k] = v;
  }
  return f;
})();

// --due is a real calendar date (edit also takes none); anything else would be saved as no date.
const due = flag(a, "due");
if (has(a, "due") && !(due && (Q.cleanDate(due) || (cmd === "edit" && due === "none")))) misused(`${at}: --due ${due ?? "(no value)"} is not a date; use YYYY-MM-DD${cmd === "edit" ? " or none" : ""}`, rerunWith("--due", "2026-10-20"));

const tags = flags(a, "tag").flatMap((t) => t.split(",")).map((t) => t.trim()).filter(Boolean);

// A whole number of days: --stale 3d or 3 (bare --stale: the board's own), --older 14.
const days = (k: string, fallback: number) => {
  if (!has(a, k)) return undefined;
  const v = flag(a, k);
  if (v === undefined) return fallback;
  const m = /^(\d+)d?$/.exec(v.trim());
  if (!m) misused(`${at}: --${k} ${v} is not a number of days`, rerunWith(`--${k}`, String(fallback)));
  return Number(m[1]);
};
const stale = days("stale", STALE_DAYS);
const older = days("older", 14) ?? 14;

const id = (() => {
  if (!BY_ID.includes(cmd)) return 0;
  const n = Number(rest[0]);
  if (!Number.isInteger(n) || n <= 0) misused(`${at}: expected a card id, got ${rest[0] ?? "nothing"}`, `node scripts/items.mjs find "words"`);
  return n;
})();
const text = rest.slice(1).join(" ").trim();
const needs: Record<string, [boolean, string, string]> = {
  add: [!!rest.join(" ").trim(), "a title", `add "Smith roof repair"`],
  edit: [ALLOWED.edit.some((k) => k !== "as" && has(a, k)), "a change", `edit ${id} --due 2026-10-20`],
  move: [!!rest[1], "a column key", `move ${id} doing`],
  tag: [rest.length > 1, "+tag or -tag", `tag ${id} +urgent -waiting`],
  note: [!!text, "text", `note ${id} "Customer confirmed the date"`],
  check: [!!text, "a step", `check ${id} "Order parts"`],
  attach: [rest.length > 1, "a file", `attach ${id} ~/app/uploads/roof.jpg`],
  find: [!!rest.join(" ").trim(), "words", `find "roof"`],
};
const need = needs[cmd];
if (need && !need[0]) misused(`${at}: needs ${need[1]}`, `node scripts/items.mjs ${need[2]}`);

// attach's files, read before the database: a path that is not there is a
// misuse, and a file over the limit is refused.
const TYPES: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif", ".pdf": "application/pdf", ".csv": "text/csv", ".txt": "text/plain" };
const attaching: Q.NewFile[] = cmd === "attach" ? rest.slice(1).map((p) => {
  const path = resolve(process.env.CALLER_CWD ?? ".", p);
  if (!existsSync(path)) misused(`${at}: no file at ${path}`, `ls ${resolve(path, "..")}`);
  const bytes = readFileSync(path);
  if (bytes.length > Q.MAX_FILE_BYTES) fail(`${at}: ${basename(path)} is ${Q.formatSize(bytes.length)}; a file can be ${Q.formatSize(Q.MAX_FILE_BYTES)} at most`, `node scripts/items.mjs note ${id} "<where the file is kept>"`);
  return { name: basename(path), content_type: TYPES[extname(path).toLowerCase()] ?? "application/octet-stream", bytes };
}) : [];

await withDb(async (pool) => {
  // The card the id names and the columns of its own board, or exit 2 naming the id.
  const card = async () => {
    const it = await Q.item(pool, id);
    if (!it) misused(`${at}: no card ${id}`, `node scripts/items.mjs find "words"`);
    return { it, cols: await Q.statuses(pool, it.board_id, true) };
  };
  const show = `node scripts/items.mjs show ${id}`;
  const name = (it: Q.Item) => `#${it.id} ${it.title}`;
  // Read commands cover every board when --board is omitted, grouped by board name.
  // The JSON shape follows the flag, never the number of boards.
  const perBoard = async <T>(fn: (b: Q.Board, cols: Q.Status[]) => Promise<T>, show: (r: T, cols: Q.Status[]) => string) => {
    const boards = await boardsFor(pool, flag(a, "board"));
    const rows: { board: Q.Board; cols: Q.Status[]; r: T }[] = [];
    for (const b of boards) { const cols = await Q.statuses(pool, b.id); rows.push({ board: b, cols, r: await fn(b, cols) }); }
    out(json, flag(a, "board") ? rows[0].r : rows.map((x) => ({ board: x.board.key, result: x.r })), () =>
      rows.length === 1 ? show(rows[0].r, rows[0].cols) : rows.map((x) => `${x.board.name} (${x.board.key})\n` + show(x.r, x.cols).replace(/^/gm, "  ")).join("\n"));
  };

  switch (cmd) {
    case "list": {
      await perBoard(async (board, cols) => {
        let items = (has(a, "archived") ? await Q.archivedItems(pool, board.id) : await Q.items(pool, board.id, { assignee: flag(a, "assignee"), due: has(a, "overdue") ? "overdue" : "" }))
          .filter((i) => tags.every((t) => i.tags.includes(t)));
        if (flag(a, "status")) { const s = await resolveStatus(pool, board, flag(a, "status")); items = items.filter((i) => i.status_id === s.id); }
        if (stale !== undefined) {
          const cutoff = Date.now() - stale * 86_400_000;
          const first = cols[0]?.id;
          items = items.filter((i) => i.status_id !== first && !i.completed_at && new Date(i.updated_at).getTime() < cutoff);
        }
        if (has(a, "over-limit")) {
          const counts = await Q.columnCounts(pool, board.id);
          const over = new Set(cols.filter((c) => c.wip_limit != null && (counts.get(c.id) ?? 0) > c.wip_limit).map((c) => c.id));
          items = items.filter((i) => over.has(i.status_id));
        }
        return items;
      }, (items, cols) => items.length ? items.map((i) => fmtItem(i, cols)).join("\n") : "nothing here");
      break;
    }
    case "add": {
      const title = rest.join(" ");
      const board = await resolveBoard(pool, flag(a, "board"));
      const cols = await Q.statuses(pool, board.id);
      const status = await resolveStatus(pool, board, flag(a, "status"));
      const it = await Q.createItem(pool, board.id, {
        title, status_id: status.id, due_on: due, assignee: flag(a, "assignee"), priority: priority ?? 0,
        tags, fields, notes: flag(a, "notes"), customer_ref: flag(a, "customer"), top: has(a, "top"),
      }, actor);
      report(json, it, `${name(it)} on ${board.name}, in ${status.label}`, { lines: [fmtItem(it, cols)], next: `node scripts/items.mjs show ${it.id}` });
      break;
    }
    case "show": {
      const { it, cols } = await card();
      const acts = await Q.activity(pool, it.id);
      const files = await Q.files(pool, it.id);
      out(json, { item: it, files, activity: acts }, () => [fmtItem(it, cols), it.notes ? "\n" + it.notes : "", it.checklist.length ? "\nchecklist:\n" + it.checklist.map((c) => `  [${c.done ? "x" : " "}] ${c.text}`).join("\n") : "",
        files.length ? "\nfiles (curl -s localhost:3000/files/<id> -o <name> to look at one):\n" + files.map((f) => `  ${f.id} ${f.name}, ${Q.formatSize(f.size)}`).join("\n") : "",
        Object.keys(it.fields).length ? "\nfields: " + Object.entries(it.fields).map(([k, v]) => `${k}=${v}`).join(", ") : "",
        `\nactivity (${cfg.time_zone}):\n` + (acts.length ? "" : "  none") + acts.map((x) => `  ${localTime(x.at, cfg.time_zone)} ${x.who ?? "Someone"} ${x.kind}${x.body ? ": " + x.body : ""}${x.from_status ? ` ${x.from_status} -> ${x.to_status}` : ""}`).join("\n")].join(""));
      break;
    }
    case "move": {
      const { it } = await card();
      if (it.archived_at) fail(`${at}: ${name(it)} is archived`, `node scripts/items.mjs restore ${it.id}`);
      const b = (await Q.boardById(pool, it.board_id))!;
      const status = await resolveStatus(pool, b, rest[1]);
      // Already there: moving would send it to the bottom of its column.
      if (status.id === it.status_id && !has(a, "to-top")) { report(json, it, `${name(it)} is already in ${status.label}, left alone`, { next: show }); break; }
      let beforeId: number | null = null;
      if (has(a, "to-top")) beforeId = (await Q.items(pool, b.id)).find((x) => x.status_id === status.id && x.id !== it.id)?.id ?? null;
      const r = await Q.moveItem(pool, it.id, { statusId: status.id, beforeId }, actor);
      report(json, r.item, r.from.id === r.to.id ? `${name(it)} is already in ${r.to.label}, now at the top` : `${name(it)}, ${r.from.label} → ${r.to.label}`, { next: show });
      break;
    }
    case "edit": {
      const { it: cur, cols } = await card();
      const patch: Q.ItemPatch = {};
      if (flag(a, "title")) patch.title = flag(a, "title");
      if (flag(a, "notes") !== undefined) patch.notes = flag(a, "notes");
      if (due !== undefined) patch.due_on = due === "none" ? null : due;
      if (flag(a, "assignee") !== undefined) patch.assignee = flag(a, "assignee") === "none" ? null : flag(a, "assignee");
      if (priority !== undefined) patch.priority = priority;
      if (flags(a, "tag").length) patch.tags = tags;
      if (flag(a, "customer") !== undefined) patch.customer_ref = flag(a, "customer");
      if (Object.keys(fields).length) patch.fields = fields;
      const it = await Q.updateItem(pool, cur.id, patch, actor);
      report(json, it, it.updated_at.getTime() === cur.updated_at.getTime() ? `${name(cur)}: nothing changed, left alone` : `${name(it)} saved`, { lines: [fmtItem(it, cols)], next: show });
      break;
    }
    case "tag": {
      const { it } = await card();
      let next = [...it.tags];
      for (const t of rest.slice(1)) { if (t.startsWith("-")) next = next.filter((x) => x.toLowerCase() !== t.slice(1).toLowerCase()); else next.push(t.replace(/^\+/, "")); }
      const u = await Q.updateItem(pool, it.id, { tags: next }, actor);
      report(json, u, `${name(u)}: ${u.tags.length ? "tags " + u.tags.join(", ") : "no tags"}`, { next: show });
      break;
    }
    case "note": {
      const { it } = await card();
      await Q.comment(pool, it.id, text, actor);
      report(json, { ok: true }, `noted on ${name(it)}`, { lines: [text], next: show });
      break;
    }
    case "check": {
      const { it } = await card();
      // Safe twice: a step already there is never added again, and only --done changes it.
      const list = [...it.checklist];
      const i = list.findIndex((c) => c.text.toLowerCase() === text.toLowerCase());
      const same = i >= 0 && (!has(a, "done") || list[i].done);
      if (i < 0) list.push({ text, done: has(a, "done") });
      else if (!same) list[i] = { ...list[i], done: true };
      const u = same ? it : await Q.updateItem(pool, it.id, { checklist: list }, actor);
      const state = `${u.checklist.filter((c) => c.done).length} of ${u.checklist.length} done`;
      report(json, u.checklist, same ? `${name(u)}: "${list[i].text}" is already on the checklist${list[i].done ? ", done" : ""}, left alone` : `${name(u)}: checklist, ${state}`, { lines: u.checklist.map((c) => `[${c.done ? "x" : " "}] ${c.text}`), next: show });
      break;
    }
    case "attach": {
      const { it } = await card();
      // Safe twice: a file of the same name and size already on the card is left alone.
      const there = await Q.files(pool, it.id);
      const same = (f: Q.NewFile) => there.some((x) => x.name === Q.cleanFileName(f.name) && x.size === f.bytes.length);
      const fresh = attaching.filter((f) => !same(f));
      const kept = attaching.filter(same).map((f) => `left alone: ${f.name} is already on the card`);
      if (!fresh.length) { report(json, [], `${name(it)}: every file is already on it, left alone`, { lines: kept, next: show }); break; }
      const added = await Q.addFiles(pool, it.id, fresh, actor);
      report(json, added, `${added.length} file${added.length === 1 ? "" : "s"} onto ${name(it)}`, { lines: [...added.map((f) => `${f.name}, ${Q.formatSize(f.size)}`), ...kept], next: show });
      break;
    }
    case "find": {
      const q = rest.join(" ").trim();
      await perBoard((board) => Q.items(pool, board.id, { q }), (items, cols) => items.length ? items.map((i) => fmtItem(i, cols)).join("\n") : "no matches");
      break;
    }
    case "archive": {
      const { it } = await card();
      if (it.archived_at) { report(json, { ok: true, already: true }, `${name(it)} was already archived, left alone`, { next: show }); break; }
      await Q.archiveItem(pool, it.id, actor);
      report(json, { ok: true }, `archived ${name(it)}`, { next: show });
      break;
    }
    case "restore": {
      const { it } = await card();
      if (!it.archived_at) { report(json, { ok: true, already: true }, `${name(it)} is not archived, left alone`, { next: show }); break; }
      await Q.restoreItem(pool, it.id, actor);
      report(json, { ok: true }, `restored ${name(it)}`, { next: show });
      break;
    }
    case "archive-done": {
      const board = await resolveBoard(pool, flag(a, "board"));
      const n = await Q.archiveDone(pool, board.id, older, actor);
      report(json, { archived: n }, n ? `archived ${n} card${n === 1 ? "" : "s"} on ${board.name} finished more than ${older} days ago` : `no card on ${board.name} finished more than ${older} days ago, nothing archived`, { next: `node scripts/items.mjs list --board ${board.key} --archived` });
      break;
    }
    case "attention": {
      await perBoard((board) => Q.attention(pool, board.id), (list, cols) => list.length ? list.map((x) => fmtItem(x.item, cols) + "\n    " + x.why.join("; ")).join("\n") : "nothing needs attention");
      break;
    }
    case "summary": {
      await perBoard((board) => Q.summary(pool, board.id), (s) => [
        `${s.board.name}: ` + s.columns.map((c) => `${c.status.label} ${c.count}${c.status.wip_limit != null ? `/${c.status.wip_limit}` : ""}${c.over ? " (over)" : ""}`).join(", "),
        `overdue ${s.overdue}, due this week ${s.dueThisWeek}, unassigned ${s.unassigned}, finished in the last 7 days ${s.doneThisWeek}`,
      ].join("\n"));
      break;
    }
  }
});
