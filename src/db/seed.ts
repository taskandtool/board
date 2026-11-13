// First-run data from board.config.json: the boards and their columns, and
// a handful of example cards that explain the board and delete themselves
// with one click. Idempotent: a board or column already present is left
// alone (so renaming a column in the UI survives a restart), and the
// examples are only added to a board that has never held an item.
import type pg from "pg";
import { cfg } from "../config";

const EXAMPLES = [
  { col: 0, title: "Click a card to open it", notes: "Each card is one piece of work. Open it to add notes, a due date, who it's assigned to, a priority, tags, a checklist and comments. Only the title is required." },
  { col: 0, title: "Drag a card to another column", notes: "Try it with this one. On a phone, press and hold it first. You can also click the dots on a card for the same moves. Under Activity you can see every move and who made it." },
  { col: 1, title: "Change the columns to fit your work", notes: "Open Board settings from the menu at the top right to add, rename and reorder columns and choose what to call a card. You can give a column a limit. When it has more cards than that, its count is yellow. You can still add more." },
  { col: 1, title: "Ask the AI to update the board", notes: "In chat, try \"add a job for the Smith roof, due Friday\" or \"what's overdue?\". Ask it to set the board up for your business. It can change the columns, the names and the fields on each card." },
  { col: 2, title: "Remove these examples", notes: "Click Remove the examples, above the board. All five go at once." },
];

export async function seed(pool: pg.Pool): Promise<void> {
  for (const [bi, b] of cfg.boards.entries()) {
    await pool.query(
      "insert into boards (key, name, position, item_one, item_many) values ($1, $2, $3, $4, $5) on conflict (key) do nothing",
      [b.key, b.name, bi, b.item?.one ?? null, b.item?.many ?? null],
    );
    const board = (await pool.query<{ id: number }>("select id from boards where key = $1", [b.key])).rows[0];
    for (const [ci, col] of b.columns.entries()) {
      await pool.query(
        "insert into statuses (board_id, key, label, position, wip_limit, is_done) values ($1, $2, $3, $4, $5, $6) on conflict (board_id, key) do nothing",
        [board.id, col.key, col.label, ci, col.wip_limit ?? null, !!col.is_done],
      );
    }
    if (bi === 0) await seedExamples(pool, board.id);
  }
}

async function seedExamples(pool: pg.Pool, boardId: number) {
  const any = await pool.query("select 1 from items where board_id = $1 limit 1", [boardId]);
  if (any.rowCount) return;
  const cols = (await pool.query<{ id: number }>("select id from statuses where board_id = $1 and archived_at is null order by position", [boardId])).rows;
  if (!cols.length) return;
  for (const [i, ex] of EXAMPLES.entries()) {
    const status = cols[Math.min(ex.col, cols.length - 1)];
    await pool.query(
      "insert into items (board_id, status_id, title, notes, position, is_sample, created_by) values ($1, $2, $3, $4, $5, true, 'board')",
      [boardId, status.id, ex.title, ex.notes, i],
    );
  }
}
