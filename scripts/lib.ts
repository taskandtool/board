// Shared by the command-line scripts: the pool, the argument parser, output.
import type pg from "pg";
import { databaseUrl, openPool } from "../src/db/client";
import { migrate } from "../src/db/migrate";
import { seed } from "../src/db/seed";
import * as Q from "../src/db/queries";

export type Args = { _: string[]; flags: Record<string, string | boolean> };

// `cmd sub "title" --status doing --tag a --tag b --json`. A repeated flag
// collects into a comma-separated value; a bare flag is true.
export function parseArgs(argv: string[]): Args {
  const out: Args = { _: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const [k, inline] = a.slice(2).split(/=(.*)/s);
      const next = argv[i + 1];
      let v: string | boolean = true;
      if (inline !== undefined) v = inline;
      else if (next !== undefined && !next.startsWith("--")) { v = next; i++; }
      const prev = out.flags[k];
      out.flags[k] = typeof prev === "string" && typeof v === "string" ? `${prev},${v}` : v;
    } else out._.push(a);
  }
  return out;
}

export const flag = (a: Args, k: string): string | undefined => (typeof a.flags[k] === "string" ? (a.flags[k] as string) : undefined);
export const has = (a: Args, k: string) => a.flags[k] !== undefined;

export async function withDb<T>(fn: (pool: pg.Pool) => Promise<T>): Promise<T> {
  const url = databaseUrl();
  if (!url) {
    console.error("DATABASE_URL is not set. On Task & Tool it is in /home/sprite/.env once the project has a database; off it, put one in .env.");
    process.exit(2);
  }
  const pool = openPool(url);
  try {
    await migrate(pool);
    await seed(pool);
    return await fn(pool);
  } finally {
    await pool.end();
  }
}

export const who = () => process.env.BOARD_USER || "AI";

export async function resolveBoard(pool: pg.Pool, key?: string): Promise<Q.Board> {
  if (key) {
    const b = await Q.boardByKey(pool, key);
    if (!b) fail(`no board with key ${key}; boards: ${(await Q.boards(pool)).map((x) => x.key).join(", ")}`);
    return b;
  }
  const all = await Q.boards(pool);
  if (!all.length) fail("no boards yet");
  return all[0];
}

export async function resolveStatus(pool: pg.Pool, board: Q.Board, key?: string): Promise<Q.Status> {
  const cols = await Q.statuses(pool, board.id);
  if (!key) return cols[0];
  const s = cols.find((c) => c.key === key || c.label.toLowerCase() === key.toLowerCase());
  if (!s) fail(`no column ${key} on ${board.key}; columns: ${cols.map((c) => c.key).join(", ")}`);
  return s;
}

export function fail(msg: string): never {
  console.error(msg);
  process.exit(1);
}

export function out(json: boolean, data: unknown, text: () => string) {
  if (json) console.log(JSON.stringify(data, null, 2));
  else console.log(text());
}

export function fmtItem(it: Q.Item, cols: Q.Status[]): string {
  const col = cols.find((c) => c.id === it.status_id)?.label ?? "?";
  const bits = [
    `#${it.id}`, it.title, `[${col}]`,
    it.assignee ? `@${it.assignee}` : "", it.due_on ? `due ${it.due_on}` : "",
    it.priority ? Q.PRIORITIES[it.priority].toLowerCase() : "", it.tags.length ? it.tags.map((t) => `#${t}`).join(" ") : "",
    it.is_sample ? "(example)" : "",
  ].filter(Boolean);
  return bits.join("  ");
}
