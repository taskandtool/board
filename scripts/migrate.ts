// Apply pending migrations by hand (the service does this at start).
import { done } from "../src/data/cli.mjs";
import { args, plain, withDb, at } from "./lib";

const HELP = `migrate.mjs

Applies the numbered files in migrations/ that this database has not run
yet, then seeds any board in board.config.json that does not exist. Safe to
run twice. The web service does the same at start. Prints
"migrate: applied N migrations" and their names, or "nothing to apply".`;

const a = args();
plain(a, HELP, []);
await withDb(async (_pool, applied) => {
  done(at, applied.length ? `applied ${applied.length} migration${applied.length === 1 ? "" : "s"}, boards seeded` : "nothing to apply, the database is up to date", { lines: applied, next: "node scripts/board.mjs list" });
});
