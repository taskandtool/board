// The board's only locks, through the app itself with no database: every
// refusal happens before a query, and a fake pool answers the rest.
import { test } from "node:test";
import assert from "node:assert/strict";
import type pg from "pg";
import app, { localPath } from "../src/app";
import type { Runtime } from "../src/runtime";

const pool = { query: async () => ({ rows: [], rowCount: 0 }) } as unknown as pg.Pool;
const runtime = (over: Partial<Runtime> = {}): Runtime => ({ open: () => ({ db: pool }), onPlatform: true, refreshSeconds: 0, fallbackUser: "", ...over });
const HOST = "https://board.example";
const post = (headers: Record<string, string>, rt = runtime()) =>
  app.request(HOST + "/b/work/items", { method: "POST", body: new URLSearchParams({ title: "x" }), headers: { host: "board.example", "content-type": "application/x-www-form-urlencoded", ...headers } }, { runtime: rt });

test("no one signed in reads but never changes", async () => {
  assert.equal((await post({ origin: HOST })).status, 403);
  assert.equal((await post({ origin: HOST, "x-tasktool-user": "not an email" })).status, 403);
});

test("on the platform only the header signs someone in; BOARD_USER is for off it", async () => {
  assert.equal((await post({ origin: HOST }, runtime({ fallbackUser: "me@example.com" }))).status, 403);
  assert.notEqual((await post({ origin: HOST }, runtime({ onPlatform: false, fallbackUser: "me@example.com" }))).status, 403);
});

test("a cross-site change is refused, by Origin or else Sec-Fetch-Site", async () => {
  const me = { "x-tasktool-user": "ann@team.example" };
  assert.equal((await post({ ...me, origin: "https://evil.example" })).status, 403);
  assert.equal((await post({ ...me, "sec-fetch-site": "cross-site" })).status, 403);
  assert.notEqual((await post({ ...me, origin: HOST })).status, 403, "the board's own page gets through");
});

test("a return path stays on the board", () => {
  assert.equal(localPath("/b/work?view=list", "/"), "/b/work?view=list");
  for (const p of ["//evil.example", "/\\evil.example", "https://evil.example", "evil"]) assert.equal(localPath(p, "/b/work"), "/b/work", p);
});
