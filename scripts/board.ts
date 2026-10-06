// Boards and columns from the command line. `node scripts/board.mjs --help`.
import { flag, has, usage, checkFlags, misused, fail, out } from "../src/data/cli.mjs";
import { args, withDb, resolveBoard, resolveStatus, report, at } from "./lib";
import * as Q from "../src/db/queries";

const HELP = `board.mjs: boards and their columns.

  list                                     every board and its columns
  add "name" [--key key]                   a new board (columns copied from the first board)
  rename <board-key> "name"
  columns [--board key]                    the columns with counts and limits
  column add "label" [--board key] [--key key] [--limit n] [--done]
  column rename <key> "label" [--board key]
  column limit <key> <n|none> [--board key]
  column done <key> <yes|no> [--board key]
  column move <key> <left|right> [--board key]
  column remove <key> [--board key]        only when it holds no cards

  --json prints JSON. A change prints what it did, then Next: the command to look.`;

const a = args(["done"]);
const json = has(a, "json");
const [cmd, ...rest] = a._;
usage(a, cmd, ["list", "add", "rename", "columns", "column"], HELP, "board", { list: [], add: ["key"], rename: [], columns: ["board"], column: ["board", "key", "limit", "done"] });
const COLUMN = ["add", "rename", "limit", "done", "move", "remove"];

// Checked before the database: a missing or malformed argument is a misuse,
// never a guess at the first board or column.
const [sub, ...r] = cmd === "column" ? rest : [];
const onBoard = flag(a, "board") ? ` --board ${flag(a, "board")}` : "";
const key = flag(a, "key");
if (key !== undefined && !Q.KEY.test(key)) misused(`${at}: --key ${key} must be lowercase letters, digits, - or _`, `node scripts/board.mjs ${cmd === "column" ? 'column add "Review" --key review' : 'add "Sales" --key sales'}${onBoard}`);
if (cmd === "add" && !rest.length) misused(`${at}: add needs a name`, `node scripts/board.mjs add "Candidates"`);
if (cmd === "rename" && !rest.slice(1).join(" ").trim()) misused(`${at}: rename needs a board key and the new name`, `node scripts/board.mjs rename ${rest[0] ?? "<board-key>"} "New name"`);
if (cmd === "column") {
  if (!COLUMN.includes(sub)) misused(`${at}: no column command ${sub ?? "(none)"}; column commands: ${COLUMN.join(", ")}`, "node scripts/board.mjs --help");
  if (sub !== "add") checkFlags(a, ["board"], `board column ${sub}`, "node scripts/board.mjs --help");
  if (sub === "add" && !r.length) misused(`${at} add: needs a label`, `node scripts/board.mjs column add "Review"${onBoard}`);
  if (sub !== "add" && !r[0]) misused(`${at} ${sub}: name the column by its key`, `node scripts/board.mjs columns --board ${flag(a, "board") ?? "<key>"}`);
  // [valid, what was expected, an example]
  const expected: Record<string, [boolean, string, string]> = {
    rename: [r.length > 1, "a new label", '"In progress"'],
    limit: [r[1] === "none" || /^\d+$/.test(r[1] ?? ""), "a whole number or none", "3"],
    done: [r[1] === "yes" || r[1] === "no", "yes or no", "yes"],
    move: [r[1] === "left" || r[1] === "right", "left or right", "left"],
  };
  const e = expected[sub];
  if (e && !e[0]) misused(`${at} ${sub}: expected ${e[1]} after ${r[0]}, got ${r[1] ?? "nothing"}`, `node scripts/board.mjs column ${sub} ${r[0]} ${e[2]}${onBoard}`);
}
const limit = flag(a, "limit");
if (limit !== undefined && !/^\d+$/.test(limit)) misused(`${at}: --limit ${limit} is not a whole number`, `node scripts/board.mjs column add "Review" --limit 3${onBoard}`);

await withDb(async (pool) => {
  const look = (b: Q.Board) => `node scripts/board.mjs columns --board ${b.key}`;
  switch (cmd) {
    case "list": {
      const boards = await Q.boards(pool);
      const rows: { board: Q.Board; columns: Q.Status[] }[] = [];
      for (const b of boards) rows.push({ board: b, columns: await Q.statuses(pool, b.id) });
      out(json, rows, () => rows.map((r) => `${r.board.key}  ${r.board.name}\n` + r.columns.map((c) => `    ${c.key}  ${c.label}${c.wip_limit != null ? ` (limit ${c.wip_limit})` : ""}${c.is_done ? " [done]" : ""}`).join("\n")).join("\n"));
      break;
    }
    case "add": {
      const name = rest.join(" ");
      const had = await Q.boardByKey(pool, key ?? Q.slugify(name));
      if (had) { report(json, { ...had, already: true }, `${had.key} (${had.name}) already exists, left alone`, { next: look(had) }); break; }
      const b = await Q.createBoard(pool, name, key);
      const cols = await Q.statuses(pool, b.id);
      report(json, b, `added ${b.name} (${b.key}) at /b/${b.key}`, { lines: [`columns: ${cols.map((c) => c.label).join(", ")}, copied from the first board`], next: look(b) });
      break;
    }
    case "rename": {
      // The board is named by position here, so its Try names one the same way.
      const b = await Q.boardByKey(pool, rest[0]);
      const name = rest.slice(1).join(" ");
      if (!b) misused(`${at}: no board ${rest[0]}; boards: ${(await Q.boards(pool)).map((x) => `${x.key} (${x.name})`).join(", ")}`, "node scripts/board.mjs list");
      if (b.name === name) { report(json, { ok: true, already: true }, `${b.key} is already called ${name}, left alone`, { next: "node scripts/board.mjs list" }); break; }
      await Q.renameBoard(pool, b.id, name);
      report(json, { ok: true }, `${b.key}: ${b.name} → ${name}`, { next: "node scripts/board.mjs list" });
      break;
    }
    case "columns": {
      const b = await resolveBoard(pool, flag(a, "board"));
      const cols = await Q.statuses(pool, b.id);
      const counts = await Q.columnCounts(pool, b.id);
      out(json, cols.map((c) => ({ ...c, count: counts.get(c.id) ?? 0 })), () => cols.map((c) => `${c.key}  ${c.label}  ${counts.get(c.id) ?? 0}${c.wip_limit != null ? `/${c.wip_limit}` : ""}${c.is_done ? " [done]" : ""}`).join("\n"));
      break;
    }
    case "column": {
      const b = await resolveBoard(pool, flag(a, "board"));
      const where = `board column ${sub}`;
      if (sub === "add") {
        const label = r.join(" ");
        const had = await Q.statusByKey(pool, b.id, key ?? Q.slugify(label));
        if (had) { report(json, { ...had, already: true }, `${had.key} (${had.label}) is already on ${b.key}, left alone`, { next: look(b) }, where); break; }
        const s = await Q.createStatus(pool, b.id, label, { key, wip_limit: limit === undefined ? null : Number(limit), is_done: has(a, "done") });
        report(json, s, `added ${s.label} (${s.key}) to ${b.name}`, { lines: [s.wip_limit != null ? `limit ${s.wip_limit}` : "", s.is_done ? "counts as done" : ""].filter(Boolean), next: look(b) }, where);
        break;
      }
      const s = await resolveStatus(pool, b, r[0]);
      let what = "";
      switch (sub) {
        case "rename": await Q.updateStatus(pool, s.id, { label: r.slice(1).join(" ") }); what = `${s.key} on ${b.key}: ${s.label} → ${r.slice(1).join(" ")}`; break;
        case "limit": await Q.updateStatus(pool, s.id, { wip_limit: r[1] === "none" ? null : Number(r[1]) }); what = `${s.label} (${s.key}) on ${b.key}: ${r[1] === "none" ? "no limit" : `limit ${r[1]}`}`; break;
        case "done": await Q.updateStatus(pool, s.id, { is_done: r[1] === "yes" }); what = `${s.label} (${s.key}) on ${b.key} ${r[1] === "yes" ? "counts as done" : "no longer counts as done"}`; break;
        case "move": {
          const cols = await Q.statuses(pool, b.id);
          const i = cols.findIndex((c) => c.id === s.id);
          const edge = r[1] === "left" ? i === 0 : i === cols.length - 1;
          if (!edge) await Q.moveStatus(pool, s.id, r[1] as "left" | "right");
          what = edge ? `${s.label} (${s.key}) is already the ${r[1] === "left" ? "first" : "last"} column on ${b.key}, left alone` : `${s.label} (${s.key}) on ${b.key} moved ${r[1]}`;
          break;
        }
        case "remove":
          await Q.archiveStatus(pool, s.id).catch((e: Error) => fail(`${where}: ${s.key} on ${b.key}: ${e.message}`, `node scripts/items.mjs list --board ${b.key} --status ${s.key}`));
          what = `removed ${s.label} (${s.key}) from ${b.name}`;
          break;
      }
      report(json, await Q.statuses(pool, b.id), what, { next: look(b) }, where);
      break;
    }
  }
});
