// board.config.json, read once and validated. This file is the first lever
// the AI pulls to shape the board: vocabulary, the boards and columns seeded
// on first run, the tag palette, the fields a card shows, the default view.
// Nothing here changes a table name.
import config from "../board.config.json";
import { validate, type Config } from "./config-schema";

export * from "./config-schema";

const problems = validate(config);
if (problems.length) {
  throw new Error("board.config.json is not valid:\n  - " + problems.join("\n  - "));
}

export const cfg = config as Config;
export const unfilled = cfg.business.includes("to fill");
export const tagRole = (name: string) => cfg.tags.find((t) => t.name.toLowerCase() === name.toLowerCase())?.role ?? "tag-0";
export const showsField = (f: string) => cfg.card.fields.includes(f);
