// Production's entry, on Cloudflare. Everything under dist/ (the built CSS,
// the vendored scripts) is served as static assets first; every other path
// reaches the app. Each request opens its own small pool on the
// DATABASE_URL binding and closes it after the response. Bundled by
// `npm run build` to build/worker.mjs; `pg` runs here through nodejs_compat.
import type { ExecutionContext } from "hono";
import app from "./app";
import { openPool } from "./db/pool";
import type { Runtime } from "./runtime";

type Bindings = { DATABASE_URL?: string; BOARD_REFRESH_SECONDS?: string };

function runtime(env: Bindings): Runtime {
  const refresh = env.BOARD_REFRESH_SECONDS;
  return {
    open() {
      if (!env.DATABASE_URL) return { db: null, state: "no-url", error: "" };
      const db = openPool(env.DATABASE_URL, 2);
      return { db, close: () => db.end() };
    },
    onPlatform: true,
    refreshSeconds: refresh !== undefined && /^\d+$/.test(refresh) ? Number(refresh) : 30,
    fallbackUser: "",
  };
}

export default {
  fetch(request: Request, env: Bindings, ctx: ExecutionContext) {
    return app.fetch(request, { runtime: runtime(env) }, ctx);
  },
};
