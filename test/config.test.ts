import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validate } from "../src/config";

const good = () => JSON.parse(readFileSync("board.config.json", "utf8"));

test("the shipped config is valid", () => {
  assert.deepEqual(validate(good()), []);
});

test("a board with no done column is refused", () => {
  const c = good();
  c.boards[0].columns.forEach((col: { is_done?: boolean }) => (col.is_done = false));
  assert.ok(validate(c).some((p) => p.includes("is_done")));
});

test("keys must be slugs and unique", () => {
  const c = good();
  c.boards[0].columns.push({ key: "To Do", label: "x" });
  c.boards[0].columns.push({ key: "todo", label: "again" });
  const p = validate(c);
  assert.ok(p.some((x) => x.includes("must match")));
  assert.ok(p.some((x) => x.includes("repeats")));
});

test("a limit of zero, a bad tag role and a select with no options are refused", () => {
  const c = good();
  c.boards[0].columns[1].wip_limit = 0;
  c.tags.push({ name: "X", role: "tag-9" });
  c.card.custom.push({ key: "crew", label: "Crew", type: "select" });
  const p = validate(c);
  assert.ok(p.some((x) => x.includes("wip_limit")));
  assert.ok(p.some((x) => x.includes("role")));
  assert.ok(p.some((x) => x.includes("no options")));
});

test("the example configs are valid", () => {
  for (const f of ["contractor", "realtor", "recruiter"]) {
    assert.deepEqual(validate(JSON.parse(readFileSync(`examples/${f}.json`, "utf8"))), [], f);
  }
});
