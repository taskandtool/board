// What the board's scripts share beyond the data skill's helper
// (src/data/cli.mjs): the pool, the board and column lookups, a card's line.
import type pg from "pg";
import { databaseUrl } from "../src/db/client";
import { openPool } from "../src/db/pool";
import { migrate } from "../src/db/migrate";
import { seed } from "../src/db/seed";
import * as Q from "../src/db/queries";
import { parseArgs, plain as plainUsage, done, fail, misused } from "../src/data/cli.mjs";

const script = (process.argv[1] ?? "").split("/").pop()?.replace(/\.(ts|mjs)$/, "") ?? "";

// "items move": this script and, for the two with commands, its command. The
// start of every output and error line.
export const at = ["board", "items"].includes(script) ? [script, parseArgs(process.argv.slice(2))._[0]].filter(Boolean).join(" ") : script;

/** The arguments, with `bare` flags never taking the next word: `check 5 --done "Order parts"`. */
export const args = (bare: readonly string[] = []) => parseArgs(process.argv.slice(2), { bare });

/** For a script with no commands: --help prints `help` and exits 0; a flag it does not take, or an argument when `takesArgs` is false, exits 2. */
export const plain = (a: ReturnType<typeof parseArgs>, help: string, allowed: readonly string[], takesArgs = false) =>
  plainUsage(a, help, script, { flags: allowed, args: takesArgs });

/** A change made: JSON with --json, else the done() shape under this script's name. */
export function report(json: boolean, data: unknown, what: string, opts: Parameters<typeof done>[2] = {}, where = at) {
  if (json) console.log(JSON.stringify(data, null, 2));
  else done(where, what, opts);
}

const ASK_DB = "python3 ~/tools/taskandtool.py request-capability postgres";

// The pool, migrated and seeded (both safe to re-run, and every command reads
// the schema they make). Any database error ends here, on stderr with a Try.
export async function withDb<T>(fn: (pool: pg.Pool, applied: string[]) => Promise<T>): Promise<T> {
  const url = databaseUrl();
  if (!url) fail(`${at}: DATABASE_URL is not set, so this app has no database yet (off Task & Tool, put one in .env)`, ASK_DB);
  const pool = openPool(url);
  try {
    const applied = await migrate(pool);
    await seed(pool);
    return await fn(pool, applied);
  } catch (e) {
    const err = e as Error & { code?: string };
    if (["28P01", "28000", "3D000"].includes(err.code ?? "")) fail(`${at}: the database refused this app's login (${err.code}): ${err.message}`, ASK_DB);
    if (/^E[A-Z]+$/.test(err.code ?? "") || /Connection terminated|timeout exceeded/i.test(err.message)) fail(`${at}: cannot reach the database: ${err.message || err.code}`, rerunWith());
    fail(`${at}: ${err.message || String(e)}`, `node scripts/${script}.mjs --help`);
  } finally {
    await pool.end();
  }
}

export const who = () => process.env.BOARD_USER || "AI";

// The board --board names; with none, the only board. Several boards and no
// --board is a misuse, since the first one is a guess.
export async function resolveBoard(pool: pg.Pool, key?: string): Promise<Q.Board> {
  const all = await Q.boards(pool);
  const keys = all.map((x) => `${x.key} (${x.name})`).join(", ");
  if (key) {
    const b = all.find((x) => x.key === key);
    if (!b) misused(`${at}: no board ${key}; boards: ${keys}`, rerunWith("--board", all[0]?.key ?? "<key>"));
    return b;
  }
  if (!all.length) fail(`${at}: no boards yet`, `node scripts/board.mjs add "Work"`);
  if (all.length > 1) misused(`${at}: there are ${all.length} boards; name one with --board. Boards: ${keys}`, rerunWith("--board", all[0].key));
  return all[0];
}

// --board's board, or every board when it is omitted (the read commands).
export async function boardsFor(pool: pg.Pool, key?: string): Promise<Q.Board[]> {
  return key ? [await resolveBoard(pool, key)] : Q.boards(pool);
}

export async function resolveStatus(pool: pg.Pool, board: Q.Board, key?: string): Promise<Q.Status> {
  const cols = await Q.statuses(pool, board.id);
  if (!key) return cols[0];
  const s = cols.find((c) => c.key === key || c.label.toLowerCase() === key.toLowerCase());
  if (!s) misused(`${at}: no column ${key} on ${board.key}; columns: ${cols.map((c) => `${c.key} (${c.label})`).join(", ")}`, `node scripts/board.mjs columns --board ${board.key}`);
  return s;
}

// This same command line, with one flag set when given, for a Try line.
export function rerunWith(k?: string, v?: string): string {
  const argv = process.argv.slice(2);
  const kept: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (k && argv[i] === k) { i++; continue; }
    if (!k || !argv[i].startsWith(k + "=")) kept.push(argv[i]);
  }
  const q = (x: string) => (/^[\w@%+=:,./-]+$/.test(x) ? x : `"${x.replace(/(["\\$`])/g, "\\$1")}"`);
  return ["node", `scripts/${script}.mjs`, ...kept.map(q), ...(k && v ? [k, v] : [])].join(" ");
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
