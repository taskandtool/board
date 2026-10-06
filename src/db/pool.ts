// Opening a pool on a URL, the same in dev and in production. The direct
// Neon host's connection limit is shared by every app in the project, so
// the machine keeps four at most and a Worker two per request; the connect
// budget is twenty seconds because a cold Neon endpoint takes a few to wake.
import pg from "pg";
import "./types";

export function openPool(url: string, max = 4): pg.Pool {
  // pg already treats sslmode=require as verify-full and warns about the
  // alias on every run; say verify-full outright so the scripts stay quiet.
  const explicit = url.replace(/([?&])sslmode=(require|prefer|verify-ca)\b/, "$1sslmode=verify-full");
  const pool = new pg.Pool({ connectionString: explicit, max, connectionTimeoutMillis: 20_000, idleTimeoutMillis: 30_000 });
  // An idle connection the server drops (Neon suspends) is not a crash: the
  // pool discards it and opens another on the next query.
  pool.on("error", (e) => console.error(`database connection dropped: ${e.message}`));
  return pool;
}
