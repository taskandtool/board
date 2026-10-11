import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validate } from "../src/config";

// The config the board ships with; every test runs against it (pin-config.mjs).
const good = () => JSON.parse(readFileSync("test/fixtures/board.config.json", "utf8"));

test("the live config is valid", () => {
  assert.deepEqual(validate(JSON.parse(readFileSync("board.config.json", "utf8"))), []);
});

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

test("money and phone fields ride on the card; a bad currency or on_card is refused", () => {
  const c = good();
  c.card.custom.push({ key: "quote", label: "Quote", type: "money", on_card: true }, { key: "phone", label: "Phone", type: "phone" });
  c.currency = "EUR";
  assert.deepEqual(validate(c), []);
  c.currency = "euros";
  c.card.custom[0].on_card = "yes";
  const p = validate(c);
  assert.ok(p.some((x) => x.includes("currency")));
  assert.ok(p.some((x) => x.includes("on_card")));
});
