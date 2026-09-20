// Boards and columns from the command line. `node scripts/board.mjs --help`.
import { parseArgs, flag, has, withDb, resolveBoard, resolveStatus, fail, out } from "./lib";
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

  --json prints JSON.`;

const a = parseArgs(process.argv.slice(2));
const json = has(a, "json");
const [cmd, ...rest] = a._;
if (!cmd || has(a, "help")) { console.log(HELP); process.exit(0); }

await withDb(async (pool) => {
  switch (cmd) {
    case "list": {
      const boards = await Q.boards(pool);
      const rows: { board: Q.Board; columns: Q.Status[] }[] = [];
      for (const b of boards) rows.push({ board: b, columns: await Q.statuses(pool, b.id) });
      out(json, rows, () => rows.map((r) => `${r.board.key}  ${r.board.name}\n` + r.columns.map((c) => `    ${c.key}  ${c.label}${c.wip_limit != null ? ` (limit ${c.wip_limit})` : ""}${c.is_done ? " [done]" : ""}`).join("\n")).join("\n"));
      break;
    }
    case "add": {
      const name = rest.join(" "); if (!name) fail("add needs a name");
      const b = await Q.createBoard(pool, name, flag(a, "key"));
      out(json, b, () => `added board ${b.key} (${b.name}) at /b/${b.key}`);
      break;
    }
    case "rename": {
      const b = await resolveBoard(pool, rest[0]);
      await Q.renameBoard(pool, b.id, rest.slice(1).join(" "));
      out(json, { ok: true }, () => `renamed ${b.key}`);
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
      const [sub, ...r] = rest;
      const b = await resolveBoard(pool, flag(a, "board"));
      if (sub === "add") {
        const label = r.join(" "); if (!label) fail("column add needs a label");
        const s = await Q.createStatus(pool, b.id, label, { key: flag(a, "key"), wip_limit: flag(a, "limit") ? Number(flag(a, "limit")) : null, is_done: has(a, "done") });
        out(json, s, () => `added column ${s.key} (${s.label}) to ${b.key}`);
        break;
      }
      const s = await resolveStatus(pool, b, r[0]);
      switch (sub) {
        case "rename": await Q.updateStatus(pool, s.id, { label: r.slice(1).join(" ") }); break;
        case "limit": await Q.updateStatus(pool, s.id, { wip_limit: r[1] === "none" ? null : Number(r[1]) }); break;
        case "done": await Q.updateStatus(pool, s.id, { is_done: r[1] !== "no" }); break;
        case "move": await Q.moveStatus(pool, s.id, r[1] === "left" ? "left" : "right"); break;
        case "remove": await Q.archiveStatus(pool, s.id); break;
        default: fail(`unknown column command ${sub}\n\n${HELP}`);
      }
      out(json, await Q.statuses(pool, b.id), () => `${sub}: ${s.key} on ${b.key}`);
      break;
    }
    default: fail(`unknown command ${cmd}\n\n${HELP}`);
  }
});
