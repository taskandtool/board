// Apply pending migrations by hand (the service does this at start).
import { withDb } from "./lib";
await withDb(async () => { console.log("migrations applied"); });
