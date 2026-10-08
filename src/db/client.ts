// The database in dev: pg on DATABASE_URL, one small pool, and the
// late-database rule. On Task & Tool the `web` service sources
// /home/sprite/.env once at start, and a fresh install can start the service moments before the
// platform writes DATABASE_URL into that file; a replaced machine sees the
// same gap for a few seconds. So the server comes up without a database,
// says so on one page, watches for the URL, and migrates the moment it
// appears. Off-platform the file does not exist and the env var is the whole
// story. This is the only file that knows it runs on Node.
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type pg from "pg";
import type { DbState, Runtime } from "../runtime";
import { migrate } from "./migrate";
import { openPool } from "./pool";
import { seed } from "./seed";

const ENV_FILE = join(homedir(), ".env");

// On a Task & Tool machine the platform writes ~/.tasktool; there, identity
// comes from the platform's header only and BOARD_USER is ignored.
const onPlatform = (): boolean => existsSync(join(homedir(), ".tasktool"));

// How often an open board quietly re-fetches itself. On a Task & Tool
// machine: never, because a tab left open would hold the sprite awake all
// day and a wake costs money; production on Cloudflare and an off-platform
// server refresh every 30 seconds for free. BOARD_REFRESH_SECONDS overrides
// either way (0 turns it off).
function refreshSeconds(): number {
  const raw = process.env.BOARD_REFRESH_SECONDS;
  if (raw !== undefined && /^\d+$/.test(raw)) return Number(raw);
  return onPlatform() ? 0 : 30;
}

let pool: pg.Pool | null = null;
let state: DbState = "no-url";
let lastError = "";

export function databaseUrl(): string | undefined {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  if (!onPlatform() || !existsSync(ENV_FILE)) return undefined;
  try {
    const line = readFileSync(ENV_FILE, "utf8").split("\n").find((l) => l.startsWith("DATABASE_URL="));
    const raw = line?.slice("DATABASE_URL=".length).trim();
    return raw ? raw.replace(/^(['"])(.*)\1$/, "$2") : undefined;
  } catch {
    return undefined;
  }
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

// Dev's runtime: the one pool this server keeps, once it is ready.
export function machineRuntime(): Runtime {
  const platform = onPlatform();
  return {
    open: () => (state === "ready" && pool ? { db: pool } : { db: null, state, error: lastError }),
    onPlatform: platform,
    refreshSeconds: refreshSeconds(),
    fallbackUser: platform ? "" : process.env.BOARD_USER || "",
  };
}
