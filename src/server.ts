// Dev's entry, on the machine: static files, then the app. `npm run start`
// runs this after building the CSS; `npm run dev` runs it under a watcher.
// The database comes up in the background (src/db/client.ts) so the server
// can answer before it exists.
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import app from "./app";
import { machineRuntime, start } from "./db/client";

const port = Number(process.env.PORT ?? 3000);
const runtime = machineRuntime();
const server = new Hono();
server.use("/*", serveStatic({ root: "./static" }));
server.route("/", app);

serve({ fetch: (req) => server.fetch(req, { runtime }), port, hostname: "0.0.0.0" }, (info) => {
  console.log(`board listening on http://localhost:${info.port}`);
});
void start();
