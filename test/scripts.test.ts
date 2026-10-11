// The scripts as the AI runs them, on the shipped config. Wrong input exits 2
// with a Try line before any database is opened; the rest runs against a
// scratch schema when TEST_DATABASE_URL is set, and skips without it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import pg from "pg";

const run = (script: string, args: string[], databaseUrl: string) => {
  const r = spawnSync("node_modules/.bin/tsx", ["--import", "./test/pin-config.mjs", `scripts/${script}.ts`, ...args], { encoding: "utf8", env: { ...process.env, DATABASE_URL: databaseUrl } });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
};

// Nothing listens here: reaching the database would exit 1, not 2.
const NOWHERE = "postgres://nobody@127.0.0.1:1/none";

test("wrong input is refused before the database, with a Try line", () => {
  const cases: [string, string[], RegExp][] = [
    ["board", ["column", "remove", "--board", "sales"], /Try: node scripts\/board\.mjs columns --board sales/],
    ["board", ["column", "rename"], /Try: node scripts\/board\.mjs columns --board <key>/],
    ["board", ["rename", "work"], /needs a board key and the new name/],
    ["board", ["column", "limit", "doing", "abc"], /whole number or none/],
    ["items", ["list", "--stale", "abc"], /--stale abc is not a number of days/],
    ["items", ["archive-done", "--older", "abc"], /--older abc is not a number of days/],
    ["items", ["add", "x", "--due", "tomorrow"], /--due tomorrow is not a date/],
    ["items", ["tag", "5"], /needs \+tag or -tag/],
    ["items", ["attach", "5"], /needs a file/],
    ["items", ["attach", "5", "no-such-file.jpg"], /no file at .*no-such-file\.jpg/],
  ];
  for (const [script, args, err] of cases) {
    const r = run(script, args, NOWHERE);
    assert.equal(r.code, 2, `${script} ${args.join(" ")}: ${r.stderr}`);
    assert.match(r.stderr, err);
    assert.match(r.stderr, /\n {2}Try: /);
  }
});

test("every script: --help and -h print usage; bad input exits 2 with Try on stderr and nothing on stdout", () => {
  const scripts = ["board", "items", "import", "export", "migrate"];
  for (const script of scripts) {
    for (const h of ["--help", "-h"]) {
      const r = run(script, [h], NOWHERE);
      assert.equal(r.code, 0, `${script} ${h}: ${r.stderr}`);
      assert.ok(r.stdout.trim(), `${script} ${h} printed nothing`);
    }
  }
  const bad: [string, string[], RegExp][] = [
    ["board", ["bogus"], /no such command/],
    ["items", ["bogus"], /no such command/],
    ["board", ["list", "--bogus"], /unknown flag --bogus/],
    ["items", ["add", "x", "--stauts", "done"], /unknown flag --stauts; valid: --board/],
    ["import", ["jobs.csv", "--bogus"], /unknown flag --bogus/],
    ["export", ["--bogus"], /unknown flag --bogus/],
    ["migrate", ["--bogus"], /unknown flag --bogus/],
    ["export", ["stray"], /takes no arguments/],
    ["import", ["no-such-file.csv"], /no such file/],
    ["import", [], /name the CSV file/],
    ["items", ["show", "abc"], /expected a card id/],
  ];
  for (const [script, args, err] of bad) {
    const r = run(script, args, NOWHERE);
    assert.equal(r.code, 2, `${script} ${args.join(" ")}: ${r.stderr}`);
    assert.equal(r.stdout, "", `${script} ${args.join(" ")} printed on stdout`);
    assert.match(r.stderr, err);
    assert.match(r.stderr, /\n {2}Try: /);
  }
});

test("an unreachable database exits 1 with a Try line", () => {
  const r = run("items", ["list"], NOWHERE);
  assert.equal(r.code, 1, r.stderr);
  assert.match(r.stderr, /cannot reach the database[\s\S]*\n {2}Try: node scripts\/items\.mjs list/);
});

const url = process.env.TEST_DATABASE_URL;

if (!url) {
  test("script tests against a database", { skip: "TEST_DATABASE_URL is not set" }, () => {});
} else {
  const schema = "board_scripts_" + Date.now().toString(36);
  const scratch = url + (url.includes("?") ? "&" : "?") + "options=" + encodeURIComponent(`-c search_path=${schema}`);
  const admin = new pg.Pool({ connectionString: url, max: 1 });
  let why = "";
  const db = (script: string, ...args: string[]) => run(script, args, scratch);
  const json = (script: string, ...args: string[]) => {
    const r = db(script, ...args, "--json");
    assert.equal(r.code, 0, r.stderr);
    return JSON.parse(r.stdout);
  };

  test.before(async () => {
    try {
      await admin.query(`create schema ${schema}`);
    } catch (e) {
      why = "TEST_DATABASE_URL's role cannot create a scratch schema: " + (e instanceof Error ? e.message : String(e));
    }
  });
  test.after(async () => {
    if (!why) await admin.query(`drop schema ${schema} cascade`);
    await admin.end();
  });

  test("the scripts on a scratch database", async (t) => {
    if (why) return t.skip(why);

    // The JSON shape follows --board, not how many boards there are.
    const all = json("items", "list");
    assert.equal(all.length, 1);
    assert.equal(all[0].board, "work");
    assert.ok(Array.isArray(all[0].result));
    const one = json("items", "list", "--board", "work");
    assert.ok(one.length && one.every((i: object) => "title" in i), "with --board, the cards themselves");
    assert.equal(db("board", "add", "Sales", "--key", "sales").code, 0);
    assert.deepEqual(json("items", "summary").map((x: { board: string }) => x.board), ["work", "sales"]);

    // No column key: nothing removed, nothing renamed.
    assert.equal(db("board", "column", "remove", "--board", "sales").code, 2);
    assert.equal(db("board", "rename", "sales").code, 2);
    assert.deepEqual(json("board", "columns", "--board", "sales").map((c: { key: string }) => c.key), ["todo", "doing", "done"]);
    assert.equal(json("board", "list").find((x: { board: { key: string } }) => x.board.key === "sales").board.name, "Sales");

    // What a card is called, per board: one word gets its plural, none goes back.
    assert.equal(db("board", "words", "sales").code, 2);
    assert.match(db("board", "words", "sales", "Deal").stdout, /sales: one card is called Deal, several are Deals/);
    assert.equal(json("board", "list").find((x: { board: { key: string } }) => x.board.key === "sales").board.item_many, "Deals");
    db("board", "words", "sales", "none");
    assert.equal(json("board", "list").find((x: { board: { key: string } }) => x.board.key === "sales").board.item_one, null);

    // Repeated --tag keeps cards carrying every tag.
    json("items", "add", "one", "--board", "sales", "--tag", "a");
    json("items", "add", "both", "--board", "sales", "--tag", "a", "--tag", "b");
    assert.deepEqual(json("items", "list", "--board", "sales", "--tag", "a", "--tag", "b").map((i: { title: string }) => i.title), ["both"]);

    // A change says what happened to which card, then Next.
    const card = json("items", "add", "mover", "--board", "sales");
    const moved = db("items", "move", String(card.id), "doing");
    assert.equal(moved.code, 0, moved.stderr);
    assert.equal(moved.stdout, `items move: #${card.id} mover, To do → Doing\n\nNext: node scripts/items.mjs show ${card.id}\n`);

    // Run twice, the second is left alone: a move to the column it is in, a checklist step.
    const stay = db("items", "move", String(card.id), "doing");
    assert.match(stay.stdout, /already in Doing, left alone/);
    db("items", "check", String(card.id), "Order parts");
    assert.match(db("items", "check", String(card.id), "Order parts").stdout, /"Order parts" is already on the checklist, left alone/);
    assert.equal(json("items", "show", String(card.id)).item.checklist[0].done, false);

    // A rename of a board that is not there points at the list, not at a flag rename refuses.
    const nope = db("board", "rename", "nope", "X");
    assert.equal(nope.code, 2);
    assert.match(nope.stderr, /Try: node scripts\/board\.mjs list$/m);

    // A board that is already there is left alone, not a database error.
    const again = db("board", "add", "Sales", "--key", "sales");
    assert.equal(again.code, 0, again.stderr);
    assert.match(again.stdout, /^board add: sales \(Sales\) already exists, left alone/);

    // Importing the same sheet twice adds its cards once.
    const first = db("import", "test/fixtures/jobs.csv", "--board", "sales");
    assert.equal(first.code, 0, first.stderr);
    assert.match(first.stdout, /^import: 3 new cards on Sales, 0 already there, left alone/);
    const second = db("import", "test/fixtures/jobs.csv", "--board", "sales");
    assert.match(second.stdout, /^import: 0 new cards on Sales, 3 already there, left alone/);
    const xlsx = db("import", "test/fixtures/jobs.xlsx", "--board", "sales");
    assert.match(xlsx.stdout, /^import: 0 new cards on Sales, 3 already there, left alone/, "the same sheet saved as .xlsx");
    assert.equal(json("items", "find", "Gutter", "--board", "sales").length, 2, "the sheet's two gutter jobs, once each");
  });
}
