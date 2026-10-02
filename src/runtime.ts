// What differs between dev (Node, on the machine) and production (a
// Cloudflare Worker): where this request's database comes from, and who
// counts as signed in. Each entry hands the app one as `runtime` in the Hono
// env (src/server.ts, src/worker.ts); everything else is the same code.
import type pg from "pg";

export type DbState = "no-url" | "connecting" | "migrating" | "ready" | "error";

export type Opened =
  | { db: pg.Pool; close?: () => Promise<void> }
  | { db: null; state: DbState; error: string };

export type Runtime = {
  // The database for one request, or why there is none yet. A `close` is
  // run after the response, without holding it up.
  open(): Opened;
  // On Task & Tool, identity comes from the X-TaskTool-User header only.
  onPlatform: boolean;
  // How often an open board quietly re-fetches itself; 0 is never.
  refreshSeconds: number;
  // Who is signed in off the platform (BOARD_USER), when no header says.
  fallbackUser: string;
};

export type AppEnv = {
  Bindings: { runtime: Runtime };
  Variables: { user: string | null; db: pg.Pool };
};
