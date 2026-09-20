// Numbered SQL files under migrations/, applied once each and recorded in
// board_migrations. Files run inside one transaction each; every statement
// in them is written to be safe to re-run anyway, so a hand run after a
// partial failure is harmless. Additive only: a new field is a new file,
// never an edit to an old one, and never a rename of a table.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type pg from "pg";

export const MIGRATIONS_DIR = join(process.cwd(), "migrations");

export function listMigrations(dir = MIGRATIONS_DIR): string[] {
  return readdirSync(dir)
    .filter((f) => /^\d{4}_[a-z0-9_]+\.sql$/.test(f))
    .sort();
}

// The numbering rule: 0001, 0002, ... with no gaps and no repeats.
export function numberingProblems(files: string[]): string[] {
  const out: string[] = [];
  files.forEach((f, i) => {
    const n = Number(f.slice(0, 4));
    if (n !== i + 1) out.push(`${f}: expected number ${String(i + 1).padStart(4, "0")}`);
  });
  return out;
}

export async function migrate(pool: pg.Pool, dir = MIGRATIONS_DIR): Promise<string[]> {
  const files = listMigrations(dir);
  const problems = numberingProblems(files);
  if (problems.length) throw new Error("migrations are misnumbered: " + problems.join("; "));
  await pool.query("create table if not exists board_migrations (name text primary key, applied_at timestamptz not null default now())");
  const done = new Set((await pool.query<{ name: string }>("select name from board_migrations")).rows.map((r) => r.name));
  const applied: string[] = [];
  for (const f of files) {
    if (done.has(f)) continue;
    const sql = readFileSync(join(dir, f), "utf8");
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query(sql);
      await client.query("insert into board_migrations (name) values ($1) on conflict do nothing", [f]);
      await client.query("commit");
      applied.push(f);
    } catch (e) {
      await client.query("rollback").catch(() => {});
      throw new Error(`${f}: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      client.release();
    }
  }
  return applied;
}
