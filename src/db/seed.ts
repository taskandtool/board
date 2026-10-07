// First-run data from board.config.json: the boards and their columns, and
// a handful of example cards that explain the board and delete themselves
// with one click. Idempotent: a board or column already present is left
// alone (so renaming a column in the UI survives a restart), and the
// examples are only added to a board that has never held an item.
import type pg from "pg";
import { cfg } from "../config";

const EXAMPLES = [
  { col: 0, title: "Click a card to open it", notes: "Each card is one piece of work. Open it to add notes, a due date, who it's assigned to, a priority, tags, a checklist and comments. Only the title is required." },
  { col: 0, title: "Drag a card to another column", notes: "Try it with this one. The dots on a card open the same moves as a menu. Each move goes into the card's history, with who made it." },
  { col: 1, title: "Change the columns to fit your work", notes: "Edit columns, at the top right, adds, renames and reorders columns. Give a column a limit and its count turns yellow when it holds too many; it still takes the card." },
  { col: 1, title: "Ask the AI to update the board", notes: "In chat, try \"add a job for the Smith roof, due Friday\" or \"what's overdue?\". Ask it to set the board up for your business and it changes the columns, the names and the fields on each card." },
  { col: 2, title: "Remove these examples", notes: "Click Remove the examples, under the board. All five go at once." },
];

export async function seed(pool: pg.Pool): Promise<void> {
  for (const [bi, b] of cfg.boards.entries()) {
    await pool.query(
      "insert into boards (key, name, position) values ($1, $2, $3) on conflict (key) do nothing",
      [b.key, b.name, bi],
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
