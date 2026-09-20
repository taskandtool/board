// First-run data from board.config.json: the boards and their columns, and
// a handful of example cards that explain the board and delete themselves
// with one click. Idempotent: a board or column already present is left
// alone (so renaming a column in the UI survives a restart), and the
// examples are only added to a board that has never held an item.
import type pg from "pg";
import { cfg } from "../config";

const EXAMPLES = [
  { col: 0, title: "This is a card. Open it", notes: "A card is one piece of work: a job, a listing, a candidate, a ticket. Open it for notes, a due date, an assignee, a priority, tags, a checklist and comments. The title is enough to start; the rest can wait." },
  { col: 0, title: "Drag cards between columns", notes: "Drag a card to the column it belongs in, or open its menu (the three dots) and pick Move to. Both do the same thing and both are recorded in the card's activity." },
  { col: 1, title: "Columns are yours to change", notes: "Edit columns, top right: add one, rename one, set a limit on how many cards a column should hold at once, say which columns count as done. A column over its limit shows it; it never refuses a card." },
  { col: 1, title: "Ask the AI in chat", notes: "The AI can add, move, find and summarise cards without opening the board: \"add a job for the Smith roof, due Friday\" is enough. Ask it to shape the board for your business and it will set the words, columns and fields." },
  { col: 2, title: "Remove these examples when you are done", notes: "Every example card is marked as one. The Remove examples action in the board menu deletes them all at once, and it disappears when they are gone." },
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
