import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cleanChecklist, cleanDate, cleanFileName, cleanTags, cleanTitle, clampPriority, dueState, formatSize, slugify } from "../src/db/queries";
import type { Activity } from "../src/db/queries";
import { foldEdits } from "../src/views/item";
import { initials, namer } from "../src/views/people";
import { toCsv } from "../src/app";
import { guessMap, parseCsv, parseDate, parsePriority } from "../scripts/csv";
import { flag, flags, parseArgs } from "../src/data/cli.mjs";
import { sortItems } from "../src/views/list";
import { readXlsx } from "../scripts/xlsx";
import { moneyValue, showValue } from "../src/config";

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
  // A spreadsheet may trim leading spaces and line breaks, and reads a full-width sign as one.
  assert.equal(toCsv([[" =1", "\uFF1D1", "\n=1", "\tx", "plain"]]), '\' =1,\'\uFF1D1,"\'\n=1",\'\tx,plain\r\n');
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
  const a = parseArgs(["add", "Roof", "--tag", "a", "--tag=b", "--json", "--due", "2026-01-01", "--field", "address=1 Main St, Austin", "--field", "crew=North"]);
  assert.deepEqual(a._, ["add", "Roof"]);
  assert.deepEqual(flags(a, "tag"), ["a", "b"]);
  assert.equal(flag(a, "tag"), "b");
  assert.deepEqual(flags(a, "field"), ["address=1 Main St, Austin", "crew=North"]);
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

test("the quiet refresh is a timer only where it is free", async () => {
  const { refreshTrigger } = await import("../src/views/board");
  assert.equal(refreshTrigger(0), "board-changed from:body");
  assert.match(refreshTrigger(30), /^every 30s \[.*visibilityState.*boardBusy.*\], board-changed from:body$/);
});

test("xlsx: the first sheet as rows, the same as the CSV it was made from", () => {
  assert.deepEqual(readXlsx(readFileSync("test/fixtures/jobs.xlsx")), parseCsv(readFileSync("test/fixtures/jobs.csv", "utf8")));
  assert.throws(() => readXlsx(Buffer.from("Task,Status\n")), /not an .xlsx/);
});

test("people show by the name they gave, else their email's first part as words", () => {
  const nameOf = namer([{ email: "dev@x.com", name: "Dev Patel", last_seen_at: null, active: true }, { email: "sam@x.com", name: null, last_seen_at: null, active: true }]);
  assert.equal(nameOf("dev@x.com"), "Dev Patel");
  assert.equal(nameOf("sam@x.com"), "Sam");
  assert.equal(nameOf("maria.lopez@x.com"), "Maria Lopez");
  assert.equal(nameOf("AI"), "AI");
  assert.equal(initials("Maria Lopez"), "ML");
  assert.equal(initials("Sam"), "S");
  assert.equal(initials("Kelly (dispatch)"), "K");
});

test("the trail folds a run of one person's edits into one line, and nothing else", () => {
  const at = (min: number) => new Date(Date.UTC(2026, 9, 8, 12, min));
  const row = (id: number, who: string, kind: string, body: string | null, min: number): Activity => ({ id, item_id: 1, who, kind, body, from_status: null, to_status: null, at: at(min) });
  const folded = foldEdits([
    row(6, "a@x", "edited", "notes", 40),
    row(5, "a@x", "edited", "title, notes", 33),
    row(4, "a@x", "edited", "due_on", 25), // each within ten minutes of the next: one run
    row(3, "b@x", "edited", "tags", 24),
    row(2, "a@x", "comment", "hi", 23),
    row(1, "a@x", "edited", "tags", 2), // twenty minutes earlier: its own line
  ]);
  assert.deepEqual(folded.map((a) => [a.id, a.body]), [[6, "notes, title, due_on"], [3, "tags"], [2, "hi"], [1, "tags"]]);
});

test("file names and sizes are cleaned for showing", () => {
  assert.equal(cleanFileName("C:\\photos\\roof.jpg"), "roof.jpg");
  assert.equal(cleanFileName("../../etc/passwd"), "passwd");
  assert.equal(cleanFileName("a\u0000b.png"), "ab.png");
  assert.equal(cleanFileName("   "), "file");
  assert.ok(cleanFileName("x".repeat(300) + ".jpg").endsWith(".jpg"));
  assert.equal(formatSize(45), "45 B");
  assert.equal(formatSize(310_940), "304 KB");
  assert.equal(formatSize(10 * 1024 * 1024), "10 MB");
  assert.equal(formatSize(2_206_622), "2.1 MB");
});

test("money reads forgivingly and shows with its symbol", () => {
  assert.equal(moneyValue("$8,900"), 8900);
  assert.equal(moneyValue("tbd"), null);
  assert.equal(moneyValue("1,200-1,500"), null);
  assert.equal(showValue({ key: "q", label: "Quote", type: "money" }, "14350"), "$14,350");
  assert.equal(showValue({ key: "q", label: "Quote", type: "money" }, "tbd"), "tbd");
  assert.equal(showValue({ key: "q", label: "Quote", type: "money" }, "1,200-1,500"), "1,200-1,500");
  assert.equal(showValue({ key: "a", label: "Address", type: "text" }, " 12 Elm "), "12 Elm");
});
