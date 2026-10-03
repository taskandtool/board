// The tests run against the config the board ships with, so a board the AI has
// shaped (other boards, other columns) still passes its own suite. The live
// board.config.json is only validated (config.test.ts).
import { register } from "node:module";

register(
  "data:text/javascript," +
    encodeURIComponent(`
      export async function resolve(specifier, context, next) {
        const r = await next(specifier, context);
        return r.url.endsWith("/board.config.json") && !r.url.includes("/test/fixtures/")
          ? { ...r, url: new URL("./test/fixtures/board.config.json", ${JSON.stringify(new URL("../", import.meta.url).href)}).href }
          : r;
      }
    `),
);
