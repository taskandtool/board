// CSV out, the same shape the board's Export link produces.
import { flag, has } from "../src/data/cli.mjs";
import { args, plain, withDb, resolveBoard } from "./lib";
import { toCsv } from "../src/app";
import * as Q from "../src/db/queries";
import { cfg } from "../src/config";

const HELP = `export.mjs [--board key] [--archived]

Prints the board's cards as CSV on stdout, one row per card, the same shape
as the board's Export link: node scripts/export.mjs > board.csv.
--board is needed once there is more than one board; --archived exports the
archived cards instead.`;

const a = args(["archived"]);
plain(a, HELP, ["board", "archived"]);

await withDb(async (pool) => {
  const board = await resolveBoard(pool, flag(a, "board"));
  const cols = new Map((await Q.statuses(pool, board.id, true)).map((s) => [s.id, s.label]));
  const items = has(a, "archived") ? await Q.archivedItems(pool, board.id) : await Q.items(pool, board.id);
  const head = ["id", "title", "column", "assignee", "due_on", "priority", "tags", "customer_ref", "notes", "created_at", "updated_at", "completed_at", ...cfg.card.custom.map((f) => f.key)];
  const rows = items.map((it) => [it.id, it.title, cols.get(it.status_id) ?? "", it.assignee ?? "", it.due_on ?? "", Q.PRIORITIES[it.priority], it.tags.join(", "), it.customer_ref ?? "", it.notes, it.created_at.toISOString(), it.updated_at.toISOString(), it.completed_at?.toISOString() ?? "", ...cfg.card.custom.map((f) => it.fields[f.key] ?? "")]);
  process.stdout.write(toCsv([head, ...rows]));
});
