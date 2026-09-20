import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanChecklist, cleanDate, cleanTags, cleanTitle, clampPriority, dueState, slugify } from "../src/db/queries";
import { toCsv } from "../src/app";
import { guessMap, parseCsv, parseDate, parsePriority } from "../scripts/csv";
import { parseArgs } from "../scripts/lib";
import { sortItems } from "../src/views/list";

test("titles, tags, dates and priorities are cleaned, never trusted", () => {
  assert.equal(cleanTitle("  a   b\n c "), "a b c");
  assert.equal(cleanTitle("x".repeat(300)).length, 200);
  assert.deepEqual(cleanTags(" a, b ,a,, "), ["a", "b"]);
  assert.equal(cleanTags(Array.from({ length: 20 }, (_, i) => `t${i}`)).length, 12);
  assert.equal(cleanDate("2026-02-30"), null);
  assert.equal(cleanDate("2026-09-21"), "2026-09-21");
  assert.equal(cleanDate("21/09/2026"), null);
  assert.equal(clampPriority("7"), 0);
  assert.equal(clampPriority(2), 2);
  assert.deepEqual(cleanChecklist([{ text: " a ", done: "yes" }, { text: "" }, null, 3]), [{ text: "a", done: true }]);
});

test("slugs are lowercase and safe", () => {
  assert.equal(slugify("In Review!"), "in-review");
  assert.match(slugify("!!!"), /^b[0-9a-z]+$/);
});

test("due state reads from the card, not the clock", () => {
  const today = "2026-09-20";
  assert.equal(dueState(null, null, today), "none");
  assert.equal(dueState("2026-09-19", null, today), "overdue");
  assert.equal(dueState("2026-09-20", null, today), "today");
  assert.equal(dueState("2026-09-22", null, today), "soon");
  assert.equal(dueState("2026-10-22", null, today), "later");
  assert.equal(dueState("2026-09-19", new Date(), today), "later", "a finished card is never overdue");
});

test("CSV export quotes and neutralises formulas", () => {
  const out = toCsv([["a", "b"], ['say "hi"', "=SUM(A1)"], ["x,y", "-1"]]);
  assert.equal(out, 'a,b\r\n"say ""hi""",\'=SUM(A1)\r\n"x,y",\'-1\r\n');
});

test("CSV import parses quotes and guesses the mapping", () => {
  const rows = parseCsv('Task,Due,"Notes"\n"Fix, gutter",21/09/2026,"line one\nline ""two"""\n\n');
  assert.deepEqual(rows, [["Task", "Due", "Notes"], ["Fix, gutter", "21/09/2026", 'line one\nline "two"']]);
  assert.deepEqual(guessMap(rows[0]), { title: "Task", due_on: "Due", notes: "Notes" });
  assert.equal(parseDate("21/09/2026"), "2026-09-21");
  assert.equal(parseDate("9/21/26"), "2026-09-21");
  assert.equal(parseDate("2026-9-3"), "2026-09-03");
  assert.equal(parseDate("nope"), null);
  assert.equal(parsePriority("Urgent"), 2);
  assert.equal(parsePriority("high"), 1);
  assert.equal(parsePriority(""), 0);
});

test("arguments: repeated flags collect, bare flags are true", () => {
  const a = parseArgs(["add", "Roof", "--tag", "a", "--tag=b", "--json", "--due", "2026-01-01"]);
  assert.deepEqual(a._, ["add", "Roof"]);
  assert.equal(a.flags.tag, "a,b");
  assert.equal(a.flags.json, true);
  assert.equal(a.flags.due, "2026-01-01");
});

test("list sorting puts undated cards last and urgent first", () => {
  const mk = (id: number, due: string | null, priority: number) => ({ id, due_on: due, priority, title: String(id), updated_at: new Date(), created_at: new Date() }) as never;
  assert.deepEqual(sortItems([mk(1, null, 0), mk(2, "2026-01-02", 0), mk(3, "2026-01-01", 0)], "due_on").map((i: { id: number }) => i.id), [3, 2, 1]);
  assert.deepEqual(sortItems([mk(1, null, 0), mk(2, null, 2), mk(3, null, 1)], "priority").map((i: { id: number }) => i.id), [2, 3, 1]);
});

test("today follows the configured zone, not the machine", async () => {
  const { todayIn, validTimeZone } = await import("../src/config-schema");
  const instant = new Date("2026-09-20T23:30:00Z");
  assert.equal(todayIn("UTC", instant), "2026-09-20");
  assert.equal(todayIn("Australia/Sydney", instant), "2026-09-21");
  assert.equal(todayIn("America/Los_Angeles", instant), "2026-09-20");
  assert.ok(validTimeZone("Europe/London"));
  assert.ok(!validTimeZone("Mars/Olympus"));
});
