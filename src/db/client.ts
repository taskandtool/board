// The database: pg on DATABASE_URL, one small pool, and the late-database
// rule. On Task & Tool the `web` service sources /home/sprite/.env once at
// start, and a fresh install can start the service moments before the
// platform writes DATABASE_URL into that file; a replaced machine sees the
// same gap for a few seconds. So the server comes up without a database,
// says so on one page, watches for the URL, and migrates the moment it
// appears. Off-platform the file does not exist and the env var is the whole
// story. This is the only file that knows it runs on Node.
import { existsSync, readFileSync } from "node:fs";
import pg from "pg";
import { migrate } from "./migrate";
import { seed } from "./seed";

const { Pool } = pg;
const ENV_FILE = "/home/sprite/.env";

export type DbState = "no-url" | "connecting" | "migrating" | "ready" | "error";

// On a Task & Tool machine the platform writes /home/sprite/.tasktool; there,
// identity comes from the edge's header only and BOARD_USER is ignored.
export const onPlatform = (): boolean => existsSync("/home/sprite/.tasktool");

// How often an open board quietly re-fetches itself. On a Task & Tool
// machine: never, because a tab left open would hold the sprite awake all
// day and a wake costs money; the edge and an off-platform server refresh
// every 30 seconds for free. BOARD_REFRESH_SECONDS overrides either way
// (0 turns it off).
export function refreshSeconds(): number {
  const raw = process.env.BOARD_REFRESH_SECONDS;
  if (raw !== undefined && /^\d+$/.test(raw)) return Number(raw);
  return onPlatform() ? 0 : 30;
}

let pool: pg.Pool | null = null;
let state: DbState = "no-url";
let lastError = "";

export function databaseUrl(): string | undefined {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  if (!existsSync(ENV_FILE)) return undefined;
  try {
    const line = readFileSync(ENV_FILE, "utf8").split("\n").find((l) => l.startsWith("DATABASE_URL="));
    const raw = line?.slice("DATABASE_URL=".length).trim();
    return raw ? raw.replace(/^(['"])(.*)\1$/, "$2") : undefined;
  } catch {
    return undefined;
  }
}

export function dbState(): { state: DbState; error: string } {
  return { state, error: lastError };
}

export function db(): pg.Pool {
  if (!pool || state !== "ready") throw new Error("the database is not ready");
  return pool;
}

export function isReady() {
  return state === "ready";
}

// Open a pool on a URL: four connections at most (the direct Neon host's
// limit is shared by every app in the project) and a connect budget of
// twenty seconds, because a cold Neon endpoint takes a few seconds to wake.
export function openPool(url: string): pg.Pool {
  // pg already treats sslmode=require as verify-full and warns about the
  // alias on every run; say verify-full outright so the scripts stay quiet.
  const explicit = url.replace(/([?&])sslmode=(require|prefer|verify-ca)\b/, "$1sslmode=verify-full");
  return new Pool({ connectionString: explicit, max: 4, connectionTimeoutMillis: 20_000, idleTimeoutMillis: 30_000 });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Bring the database up in the background and keep trying until it is.
export async function start(log: (msg: string) => void = console.log): Promise<void> {
  for (;;) {
    const url = databaseUrl();
    if (!url) {
      if (state !== "no-url") log("DATABASE_URL is not set; waiting for it");
      state = "no-url";
      await sleep(3000);
      continue;
    }
    state = "connecting";
    const p = openPool(url);
    try {
      await p.query("select 1");
      state = "migrating";
      const applied = await migrate(p);
      if (applied.length) log(`applied migrations: ${applied.join(", ")}`);
      await seed(p);
      pool = p;
      state = "ready";
      lastError = "";
      log("database ready");
      return;
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      state = "error";
      log(`database not ready yet: ${lastError}`);
      await p.end().catch(() => {});
      await sleep(5000);
    }
  }
}
