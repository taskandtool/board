// CSV out, the same shape the board's Export link produces.
import { parseArgs, flag, has, withDb, resolveBoard } from "./lib";
import { toCsv } from "../src/app";
import * as Q from "../src/db/queries";
import { cfg } from "../src/config";

const a = parseArgs(process.argv.slice(2));
if (has(a, "help")) { console.log("export.mjs [--board key] [--archived]   prints the board as CSV"); process.exit(0); }

await withDb(async (pool) => {
  const board = await resolveBoard(pool, flag(a, "board"));
  const cols = new Map((await Q.statuses(pool, board.id, true)).map((s) => [s.id, s.label]));
  const items = has(a, "archived") ? await Q.archivedItems(pool, board.id) : await Q.items(pool, board.id);
  const head = ["id", "title", "column", "assignee", "due_on", "priority", "tags", "customer_ref", "notes", "created_at", "updated_at", "completed_at", ...cfg.card.custom.map((f) => f.key)];
  const rows = items.map((it) => [it.id, it.title, cols.get(it.status_id) ?? "", it.assignee ?? "", it.due_on ?? "", Q.PRIORITIES[it.priority], it.tags.join(", "), it.customer_ref ?? "", it.notes, it.created_at.toISOString(), it.updated_at.toISOString(), it.completed_at?.toISOString() ?? "", ...cfg.card.custom.map((f) => it.fields[f.key] ?? "")]);
  process.stdout.write(toCsv([head, ...rows]));
});
