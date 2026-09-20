// Against a real Postgres when TEST_DATABASE_URL is set; skipped with a note
// otherwise. Each run works in its own schema and drops it after.
import { test } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { migrate } from "../src/db/migrate";
import { seed } from "../src/db/seed";
import * as Q from "../src/db/queries";

const url = process.env.TEST_DATABASE_URL;

if (!url) {
  test("database tests", { skip: "TEST_DATABASE_URL is not set" }, () => {});
} else {
  const schema = "board_test_" + Date.now().toString(36);
  // The scratch schema rides on the connection itself (options=-c search_path),
  // so no query can slip through before a per-connection SET lands.
  const withSchema = (u: string, s: string) => u + (u.includes("?") ? "&" : "?") + "options=" + encodeURIComponent(`-c search_path=${s}`);
  const pool = new pg.Pool({ connectionString: withSchema(url, schema), max: 2 });
  const admin = new pg.Pool({ connectionString: url, max: 1 });
  // On a Task & Tool machine the app's role owns one schema and cannot make
  // another, and these tests must never run against the real tables; they
  // skip there and run wherever a scratch schema can be made.
  let usable = true;
  let why = "";
  const scratch = async (t: { skip: (m: string) => void }) => {
    if (!usable) t.skip(why);
    return usable;
  };

  test.before(async () => {
    try {
      await admin.query(`create schema ${schema}`);
      await pool.query("select 1");
    } catch (e) {
      usable = false;
      why = "TEST_DATABASE_URL's role cannot create a scratch schema: " + (e instanceof Error ? e.message : String(e));
    }
  });
  test.after(async () => {
    await pool.end();
    if (usable) await admin.query(`drop schema ${schema} cascade`);
    await admin.end();
  });

  test("migrations and the seed are idempotent", async (t) => {
    if (!(await scratch(t))) return;
    const first = await migrate(pool);
    assert.ok(first.includes("0001_schema.sql"));
    assert.deepEqual(await migrate(pool), []);
    await seed(pool);
    await seed(pool);
    const boards = await Q.boards(pool);
    assert.equal(boards.length, 1);
    const cols = await Q.statuses(pool, boards[0].id);
    assert.deepEqual(cols.map((c) => c.key), ["todo", "doing", "done"]);
    assert.equal((await Q.items(pool, boards[0].id)).length, 5, "the example cards, once");
    // the migration file itself is re-runnable outside the ledger
    const { readFileSync } = await import("node:fs");
    await pool.query(readFileSync("migrations/0001_schema.sql", "utf8"));
  });

  test("a move renumbers both columns, keeps completed_at honest, and can be undone", async (t) => {
    if (!(await scratch(t))) return;
    const [board] = await Q.boards(pool);
    const cols = await Q.statuses(pool, board.id);
    const [todo, doing, done] = cols;
    const a = await Q.createItem(pool, board.id, { title: "a", status_id: todo.id }, "t@x");
    const b = await Q.createItem(pool, board.id, { title: "b", status_id: todo.id }, "t@x");
    const c = await Q.createItem(pool, board.id, { title: "c", status_id: todo.id }, "t@x");
    const inCol = async (s: Q.Status) => (await Q.items(pool, board.id)).filter((i) => i.status_id === s.id && !i.is_sample);
    // c before a: order becomes c, a, b
    await Q.moveItem(pool, c.id, { statusId: todo.id, beforeId: a.id }, "t@x");
    assert.deepEqual((await inCol(todo)).map((i) => i.title), ["c", "a", "b"]);
    const positions = (await inCol(todo)).map((i) => i.position);
    assert.deepEqual(positions, positions.map((_, i) => i + positions[0]), "positions are dense after a move");
    // to done: completed_at set; activity says from/to
    const r = await Q.moveItem(pool, a.id, { statusId: done.id }, "t@x");
    assert.ok(r.item.completed_at);
    assert.equal(r.from.key, "todo");
    assert.equal(r.to.key, "done");
    assert.deepEqual((await inCol(todo)).map((i) => i.title), ["c", "b"]);
    // undo puts it back where it was, in front of b
    await Q.moveItem(pool, a.id, r.undo, "t@x");
    assert.deepEqual((await inCol(todo)).map((i) => i.title), ["c", "a", "b"]);
    assert.equal((await Q.item(pool, a.id))!.completed_at, null, "leaving done clears completed_at");
    // a move to a column on another board is refused
    const other = await Q.createBoard(pool, "Other");
    const otherCols = await Q.statuses(pool, other.id);
    await assert.rejects(Q.moveItem(pool, a.id, { statusId: otherCols[0].id }, "t@x"), /no such column on this board/);
    const acts = await Q.activity(pool, a.id);
    assert.deepEqual(acts.map((x) => x.kind).reverse(), ["created", "moved", "moved"]);
    void doing;
  });

  test("a done column change re-labels the cards in it", async (t) => {
    if (!(await scratch(t))) return;
    const [board] = await Q.boards(pool);
    const cols = await Q.statuses(pool, board.id);
    const doing = cols[1];
    const x = await Q.createItem(pool, board.id, { title: "x", status_id: doing.id }, "t@x");
    assert.equal(x.completed_at, null);
    await Q.updateStatus(pool, doing.id, { is_done: true });
    assert.ok((await Q.item(pool, x.id))!.completed_at);
    await Q.updateStatus(pool, doing.id, { is_done: false });
    assert.equal((await Q.item(pool, x.id))!.completed_at, null);
  });

  test("a column holding cards cannot be removed; a new column lands before Done", async (t) => {
    if (!(await scratch(t))) return;
    const [board] = await Q.boards(pool);
    const cols = await Q.statuses(pool, board.id);
    await assert.rejects(Q.archiveStatus(pool, cols[0].id), /still holds/);
    const review = await Q.createStatus(pool, board.id, "Review", { wip_limit: 2 });
    const after = await Q.statuses(pool, board.id);
    assert.deepEqual(after.map((c) => c.key), ["todo", "doing", "review", "done"]);
    await Q.moveStatus(pool, review.id, "left");
    assert.deepEqual((await Q.statuses(pool, board.id)).map((c) => c.key), ["todo", "review", "doing", "done"]);
    await Q.archiveStatus(pool, review.id);
    assert.deepEqual((await Q.statuses(pool, board.id)).map((c) => c.key), ["todo", "doing", "done"]);
  });

  test("attention ranks overdue, then urgent, then due today; finished cards never show", async (t) => {
    if (!(await scratch(t))) return;
    const [board] = await Q.boards(pool);
    const cols = await Q.statuses(pool, board.id);
    const today = new Date().toISOString().slice(0, 10);
    const late = await Q.createItem(pool, board.id, { title: "late", status_id: cols[0].id, due_on: "2020-01-01" }, "t@x");
    const urgent = await Q.createItem(pool, board.id, { title: "urgent", status_id: cols[0].id, priority: 2 }, "t@x");
    const dueToday = await Q.createItem(pool, board.id, { title: "today", status_id: cols[0].id, due_on: today }, "t@x");
    const finished = await Q.createItem(pool, board.id, { title: "finished late", status_id: cols[2].id, due_on: "2020-01-01" }, "t@x");
    const list = await Q.attention(pool, board.id);
    const ids = list.map((x) => x.item.id);
    assert.ok(ids.indexOf(late.id) < ids.indexOf(urgent.id));
    assert.ok(ids.indexOf(urgent.id) < ids.indexOf(dueToday.id));
    assert.ok(!ids.includes(finished.id));
    const s = await Q.summary(pool, board.id);
    assert.ok(s.overdue >= 1);
  });

  test("editing records what changed and drops the example mark; filters find by tag, assignee and search", async (t) => {
    if (!(await scratch(t))) return;
    const [board] = await Q.boards(pool);
    const sample = (await Q.items(pool, board.id)).find((i) => i.is_sample)!;
    const u = await Q.updateItem(pool, sample.id, { tags: ["Client"], assignee: "Sam@Example.com".toLowerCase(), title: sample.title }, "t@x");
    assert.equal(u.is_sample, false);
    const act = (await Q.activity(pool, sample.id))[0];
    assert.equal(act.kind, "edited");
    assert.match(act.body!, /assignee/);
    assert.match(act.body!, /tags/);
    assert.ok((await Q.items(pool, board.id, { tag: "Client" })).some((i) => i.id === sample.id));
    assert.ok((await Q.items(pool, board.id, { assignee: "sam@example.com" })).some((i) => i.id === sample.id));
    assert.ok((await Q.items(pool, board.id, { q: "open it" })).some((i) => i.id === sample.id));
    assert.equal((await Q.items(pool, board.id, { q: "zzz-nothing" })).length, 0);
    assert.equal(await Q.updateItem(pool, sample.id, { title: sample.title }, "t@x").then((i) => i.updated_at.getTime()), u.updated_at.getTime(), "no change writes nothing");
  });

  test("archive by age and sample removal", async (t) => {
    if (!(await scratch(t))) return;
    const [board] = await Q.boards(pool);
    const cols = await Q.statuses(pool, board.id);
    const d = await Q.createItem(pool, board.id, { title: "old done", status_id: cols[2].id }, "t@x");
    await pool.query("update items set completed_at = now() - interval '30 days' where id = $1", [d.id]);
    assert.equal(await Q.archiveDone(pool, board.id, 60, "t@x"), 0);
    assert.ok((await Q.archiveDone(pool, board.id, 14, "t@x")) >= 1);
    assert.ok((await Q.archivedItems(pool, board.id)).some((i) => i.id === d.id));
    await Q.restoreItem(pool, d.id, "t@x");
    assert.equal((await Q.item(pool, d.id))!.archived_at, null);
    const n = await Q.removeSamples(pool, board.id);
    assert.ok(n >= 1);
    assert.equal(await Q.sampleCount(pool, board.id), 0);
  });

  test("a new working column lands before two trailing done columns; a new done column joins the end", async (t) => {
    if (!(await scratch(t))) return;
    const b = await Q.createBoard(pool, "Jobs", "jobs");
    const cols = await Q.statuses(pool, b.id);
    await Q.createStatus(pool, b.id, "Paid", { is_done: true });
    await Q.createStatus(pool, b.id, "Review");
    assert.deepEqual((await Q.statuses(pool, b.id)).map((c) => c.key), [...cols.slice(0, -1).map((c) => c.key), "review", "done", "paid"]);
  });
}

if (url) {
  test("twelve moves at once, crossing both ways, end dense and unique with every move recorded", async (t) => {
    const schema = "board_race_" + Date.now().toString(36);
    const adminP = new pg.Pool({ connectionString: url, max: 1 });
    try {
      await adminP.query(`create schema ${schema}`);
    } catch (e) {
      t.skip("cannot create a scratch schema");
      await adminP.end();
      return;
    }
    const p = new pg.Pool({ connectionString: url + (url.includes("?") ? "&" : "?") + "options=" + encodeURIComponent(`-c search_path=${schema}`), max: 6 });
    try {
      await migrate(p);
      const b = await Q.createBoard(p, "Race", "race");
      const [todo, doing] = await Q.statuses(p, b.id);
      const a: Q.Item[] = [], d: Q.Item[] = [];
      for (let i = 0; i < 6; i++) a.push(await Q.createItem(p, b.id, { title: "a" + i, status_id: todo.id }, "t@x"));
      for (let i = 0; i < 6; i++) d.push(await Q.createItem(p, b.id, { title: "d" + i, status_id: doing.id }, "t@x"));
      const moves = [
        ...a.slice(0, 3).map((it) => Q.moveItem(p, it.id, { statusId: doing.id }, "t@x")),
        ...d.slice(0, 3).map((it) => Q.moveItem(p, it.id, { statusId: todo.id }, "t@x")),
        ...a.slice(3).map((it, i) => Q.moveItem(p, it.id, { statusId: todo.id, beforeId: a[i].id }, "t@x")),
        ...d.slice(3).map((it, i) => Q.moveItem(p, it.id, { statusId: doing.id, beforeId: d[i].id }, "t@x")),
      ];
      const results = await Promise.allSettled(moves);
      const failed = results.filter((r) => r.status === "rejected").map((r) => (r as PromiseRejectedResult).reason?.message);
      assert.deepEqual(failed, [], "no move was lost to a deadlock");
      for (const s of [todo, doing]) {
        const rows = (await Q.items(p, b.id)).filter((i) => i.status_id === s.id).map((i) => i.position);
        assert.deepEqual(rows, rows.map((_, i) => i), `${s.key} positions are 0..n-1`);
      }
      assert.equal((await Q.items(p, b.id)).length, 12);
      const acts = await p.query("select count(*)::int as n from activity where kind in ('moved','reordered')");
      assert.equal(acts.rows[0].n, 12, "every move wrote its activity row");
    } finally {
      await p.end();
      await adminP.query(`drop schema ${schema} cascade`).catch(() => {});
      await adminP.end();
    }
  });
}
