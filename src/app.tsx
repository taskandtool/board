// The Hono app: identity, the read-only rule, the routes. Every mutation is
// a POST; nothing changes state on a GET. Responses to htmx requests are
// partials; the same URLs answer a plain browser with a full page.
import { Hono } from "hono";
import type { Context } from "hono";
import { cfg } from "./config";
import { db, dbState, isReady, onPlatform } from "./db/client";
import * as Q from "./db/queries";
import type { Board, Filters, Item, Status } from "./db/queries";
import { BoardView, Toast, type BoardData } from "./views/board";
import { ArchiveView, ColumnsView, WaitingView } from "./views/columns";
import { ItemView } from "./views/item";
import { Layout, type Shell } from "./views/layout";
import { ListView, sortItems, type Sort } from "./views/list";

type Vars = { user: string | null };
const app = new Hono<{ Variables: Vars }>();

const seen = new Map<string, number>();

// Identity: the platform's edge sets X-TaskTool-User from a verified session
// and strips any copy a client sent, so the header is trusted here. Off
// Task & Tool, BOARD_USER stands in. No header and no variable means read only.
app.use("*", async (c, next) => {
  const raw = c.req.header("x-tasktool-user") || (onPlatform() ? "" : process.env.BOARD_USER || "");
  const user = /^[^\s@]+@[^\s@]+$/.test(raw) ? raw.toLowerCase() : null;
  c.set("user", user);
  c.header("Cache-Control", "no-store");
  if (c.req.path === "/healthz") return isReady() ? c.text("ok") : c.text("waiting for the database", 503);
  if (!isReady()) {
    const { state, error } = dbState();
    return c.html(<WaitingView state={state} error={error} />, 503);
  }
  if (user && (seen.get(user) ?? 0) < Date.now() - 3_600_000) {
    seen.set(user, Date.now());
    await Q.touchPerson(db(), user);
  }
  if (c.req.method !== "GET" && c.req.method !== "HEAD") {
    if (!user) return c.text("Read only: changes need a signed-in team member.", 403);
    if (!sameOrigin(c)) return c.text("Cross-site request refused.", 403);
  }
  await next();
});

// The origin check that stands in for a CSRF token: a browser names its
// origin on every cross-site POST, and the board only serves its own.
function sameOrigin(c: Context): boolean {
  const origin = c.req.header("origin");
  const host = c.req.header("x-forwarded-host") || c.req.header("host");
  if (origin) {
    try {
      return new URL(origin).host === host;
    } catch {
      return false;
    }
  }
  const site = c.req.header("sec-fetch-site");
  return !site || site === "same-origin" || site === "none";
}

const isHx = (c: Context) => c.req.header("hx-request") === "true";
// A `return` field is a path on this board, never a host: "//evil" is not a path.
const localPath = (p: string, fallback: string) => (p.startsWith("/") && !p.startsWith("//") && !p.includes("\\") ? p : fallback);
const num = (v: unknown) => (typeof v === "string" && /^\d+$/.test(v) ? Number(v) : NaN);
const str = (v: unknown) => (typeof v === "string" ? v : "");

async function shell(c: Context<{ Variables: Vars }>, board: Board | null, view: Shell["view"]): Promise<Shell> {
  return { boards: await Q.boards(db()), board, view, user: c.get("user") };
}

async function boardOr404(c: Context<{ Variables: Vars }>): Promise<Board | null> {
  return Q.boardByKey(db(), c.req.param("board") ?? "");
}

function filtersFrom(c: Context<{ Variables: Vars }>): Filters {
  const q = c.req.query();
  const due = ["overdue", "today", "week", "none"].includes(q.due) ? (q.due as Filters["due"]) : "";
  return {
    q: (q.q ?? "").trim().slice(0, 100) || undefined,
    assignee: q.assignee || undefined,
    tag: q.tag || undefined,
    due,
    mine: q.mine === "1" ? (c.get("user") ?? undefined) : undefined,
  };
}

async function boardData(c: Context<{ Variables: Vars }>, board: Board, filters = filtersFrom(c)): Promise<BoardData> {
  const pool = db();
  const [columns, items, counts, people, samples] = await Promise.all([
    Q.statuses(pool, board.id), Q.items(pool, board.id, filters), Q.columnCounts(pool, board.id), Q.people(pool), Q.sampleCount(pool, board.id),
  ]);
  return { board, columns, items, counts, filters, people, samples, user: c.get("user") };
}

// Every mutation from the board answers with the board partial, and a toast
// on top when there is something to say or undo.
async function boardResponse(c: Context<{ Variables: Vars }>, board: Board, toast?: { message: string; undo?: { url: string; fields: Record<string, string | number> } }) {
  const ret = str((await c.req.parseBody())["return"]);
  const filters = ret.startsWith(`/b/${board.key}`) ? filtersFromUrl(c, ret) : {};
  const data = await boardData(c, board, filters);
  if (!isHx(c)) return c.redirect(localPath(ret, `/b/${board.key}`), 303);
  c.header("HX-Trigger-After-Swap", "board-swapped");
  return c.html(<>
    <BoardView data={data} />
    {toast ? <Toast message={toast.message} undo={toast.undo} /> : null}
  </>);
}

function filtersFromUrl(c: Context<{ Variables: Vars }>, url: string): Filters {
  const q = new URL(url, "http://x").searchParams;
  const due = ["overdue", "today", "week", "none"].includes(q.get("due") ?? "") ? (q.get("due") as Filters["due"]) : "";
  return {
    q: q.get("q") || undefined, assignee: q.get("assignee") || undefined, tag: q.get("tag") || undefined, due,
    mine: q.get("mine") === "1" ? (c.get("user") ?? undefined) : undefined,
  };
}

// ---- boards ---------------------------------------------------------------

app.get("/", async (c) => {
  const all = await Q.boards(db());
  if (!all.length) return c.text("No boards yet: check board.config.json", 500);
  return c.redirect(cfg.default_view === "list" ? `/b/${all[0].key}/list` : `/b/${all[0].key}`, 302);
});

app.post("/boards", async (c) => {
  const body = await c.req.parseBody();
  const name = str(body.name).trim().slice(0, 60);
  if (!name) return c.text("A board needs a name", 400);
  const board = await Q.createBoard(db(), name);
  return c.redirect(`/b/${board.key}/columns`, 303);
});

app.post("/b/:board/rename", async (c) => {
  const board = await boardOr404(c);
  if (!board) return c.notFound();
  const name = str((await c.req.parseBody()).name).trim().slice(0, 60);
  if (name) await Q.renameBoard(db(), board.id, name);
  return c.redirect(`/b/${board.key}/columns`, 303);
});

app.get("/b/:board", async (c) => {
  const board = await boardOr404(c);
  if (!board) return c.notFound();
  const data = await boardData(c, board);
  const view = <BoardView data={data} />;
  if (isHx(c)) return c.html(view);
  return c.html(<Layout title={`${board.name} · board`} shell={await shell(c, board, "board")}>{view}</Layout>);
});

app.get("/b/:board/list", async (c) => {
  const board = await boardOr404(c);
  if (!board) return c.notFound();
  const data = await boardData(c, board);
  const sort = (["due_on", "priority", "updated_at", "title", "created_at"].includes(c.req.query("sort") ?? "") ? c.req.query("sort") : "due_on") as Sort;
  const group = c.req.query("group") === "1";
  const view = <ListView data={data} sort={sort} group={group} />;
  if (isHx(c)) return c.html(view);
  return c.html(<Layout title={`${board.name} · list`} shell={await shell(c, board, "list")}>{view}</Layout>);
});

app.get("/b/:board/export.csv", async (c) => {
  const board = await boardOr404(c);
  if (!board) return c.notFound();
  const data = await boardData(c, board);
  const cols = new Map(data.columns.map((s) => [s.id, s.label]));
  const rows = sortItems(data.items, "due_on").map((it) => [
    it.id, it.title, cols.get(it.status_id) ?? "", it.assignee ?? "", it.due_on ?? "", Q.PRIORITIES[it.priority], it.tags.join(", "),
    it.customer_ref ?? "", it.notes, it.created_at.toISOString(), it.updated_at.toISOString(), it.completed_at?.toISOString() ?? "",
    ...cfg.card.custom.map((f) => it.fields[f.key] ?? ""),
  ]);
  const head = ["id", "title", "column", "assignee", "due_on", "priority", "tags", "customer_ref", "notes", "created_at", "updated_at", "completed_at", ...cfg.card.custom.map((f) => f.key)];
  return c.body(toCsv([head, ...rows]), 200, { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${board.key}.csv"` });
});

// A cell that starts like a formula gets a leading apostrophe, so a
// spreadsheet opens the export as text rather than running it.
export function toCsv(rows: unknown[][]): string {
  const cell = (v: unknown) => {
    let s = v == null ? "" : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}

app.get("/b/:board/columns", async (c) => {
  const board = await boardOr404(c);
  if (!board) return c.notFound();
  const [columns, counts] = await Promise.all([Q.statuses(db(), board.id), Q.columnCounts(db(), board.id)]);
  return c.html(<Layout title={`${board.name} · columns`} shell={await shell(c, board, "columns")}><ColumnsView board={board} columns={columns} counts={counts} user={c.get("user")} /></Layout>);
});

app.post("/b/:board/columns", async (c) => {
  const board = await boardOr404(c);
  if (!board) return c.notFound();
  const body = await c.req.parseBody();
  const label = str(body.label).trim().slice(0, 40);
  if (!label) return c.text("A column needs a label", 400);
  const wip = num(body.wip_limit);
  try {
    await Q.createStatus(db(), board.id, label, { wip_limit: Number.isFinite(wip) && wip > 0 ? wip : null, is_done: body.is_done === "1" });
  } catch (e) {
    return c.text(e instanceof Error ? e.message : "Could not add the column", 400);
  }
  return c.redirect(`/b/${board.key}/columns`, 303);
});

async function columnBoard(c: Context<{ Variables: Vars }>): Promise<{ status: Status; board: Board } | null> {
  const status = await Q.statusById(db(), num(c.req.param("id")));
  if (!status) return null;
  const board = await Q.boardById(db(), status.board_id);
  return board ? { status, board } : null;
}

app.post("/columns/:id", async (c) => {
  const found = await columnBoard(c);
  if (!found) return c.notFound();
  const body = await c.req.parseBody();
  const wip = num(body.wip_limit);
  await Q.updateStatus(db(), found.status.id, { label: str(body.label).trim().slice(0, 40) || undefined, wip_limit: Number.isFinite(wip) && wip > 0 ? wip : null, is_done: body.is_done === "1" });
  return c.redirect(`/b/${found.board.key}/columns`, 303);
});

app.post("/columns/:id/move", async (c) => {
  const found = await columnBoard(c);
  if (!found) return c.notFound();
  const dir = str((await c.req.parseBody()).direction) === "left" ? "left" : "right";
  await Q.moveStatus(db(), found.status.id, dir);
  return c.redirect(`/b/${found.board.key}/columns`, 303);
});

app.post("/columns/:id/archive", async (c) => {
  const found = await columnBoard(c);
  if (!found) return c.notFound();
  try {
    await Q.archiveStatus(db(), found.status.id);
  } catch (e) {
    return c.text(e instanceof Error ? e.message : "Could not remove the column", 400);
  }
  return c.redirect(`/b/${found.board.key}/columns`, 303);
});

// ---- items ----------------------------------------------------------------

app.post("/b/:board/items", async (c) => {
  const board = await boardOr404(c);
  if (!board) return c.notFound();
  const body = await c.req.parseBody();
  const title = Q.cleanTitle(str(body.title));
  if (!title) return c.text("A card needs a title", 400);
  const status_id = num(body.status_id);
  await Q.createItem(db(), board.id, { title, status_id: Number.isFinite(status_id) ? status_id : undefined, top: body.top === "1" }, c.get("user"));
  return boardResponse(c, board);
});

app.post("/b/:board/samples/remove", async (c) => {
  const board = await boardOr404(c);
  if (!board) return c.notFound();
  const n = await Q.removeSamples(db(), board.id);
  return boardResponse(c, board, { message: `Removed ${n} example ${n === 1 ? "card" : "cards"}` });
});

app.post("/b/:board/archive-done", async (c) => {
  const board = await boardOr404(c);
  if (!board) return c.notFound();
  const days = num((await c.req.parseBody()).days);
  const n = await Q.archiveDone(db(), board.id, Number.isFinite(days) ? days : cfg.archive_done_after_days, c.get("user"));
  if (isHx(c)) return boardResponse(c, board, { message: `Archived ${n} finished ${n === 1 ? "card" : "cards"}` });
  return c.redirect(`/b/${board.key}/archive`, 303);
});

app.get("/b/:board/archive", async (c) => {
  const board = await boardOr404(c);
  if (!board) return c.notFound();
  const [items, columns] = await Promise.all([Q.archivedItems(db(), board.id), Q.statuses(db(), board.id, true)]);
  return c.html(<Layout title={`${board.name} · archive`} shell={await shell(c, board, "archive")}><ArchiveView board={board} items={items} columns={columns} user={c.get("user")} archiveAfter={cfg.archive_done_after_days} /></Layout>);
});

async function itemView(c: Context<{ Variables: Vars }>, item: Item, status = 200) {
  const pool = db();
  const [board, columns, activity, people] = await Promise.all([Q.boardById(pool, item.board_id), Q.statuses(pool, item.board_id, true), Q.activity(pool, item.id), Q.people(pool)]);
  const data = { item, board: board!, columns: columns.filter((s) => !s.archived_at || s.id === item.status_id), activity, people, user: c.get("user"), drawer: isHx(c) };
  if (isHx(c)) {
    if (c.req.method !== "GET") c.header("HX-Trigger", "board-changed");
    return c.html(<ItemView data={data} />, status as 200);
  }
  return c.html(<Layout title={item.title} shell={await shell(c, data.board, "item")}><ItemView data={data} /></Layout>, status as 200);
}

async function itemOr404(c: Context<{ Variables: Vars }>): Promise<Item | null> {
  const id = num(c.req.param("id"));
  return Number.isFinite(id) ? Q.item(db(), id) : null;
}

app.get("/items/:id", async (c) => {
  const item = await itemOr404(c);
  if (!item) return c.notFound();
  return itemView(c, item);
});

app.post("/items/:id", async (c) => {
  const item = await itemOr404(c);
  if (!item) return c.notFound();
  const body = await c.req.parseBody();
  const fields: Record<string, string> = {};
  for (const f of cfg.card.custom) if (`field_${f.key}` in body) fields[f.key] = str(body[`field_${f.key}`]).slice(0, 500);
  const patch: Q.ItemPatch = {};
  if ("title" in body) patch.title = str(body.title);
  if ("notes" in body) patch.notes = str(body.notes);
  if ("assignee" in body) patch.assignee = str(body.assignee).toLowerCase() || null;
  if ("due_on" in body) patch.due_on = str(body.due_on) || null;
  if ("priority" in body) patch.priority = num(body.priority);
  if ("tags" in body) patch.tags = Q.cleanTags(str(body.tags));
  if ("customer_ref" in body) patch.customer_ref = str(body.customer_ref).slice(0, 200) || null;
  if (Object.keys(fields).length) patch.fields = fields;
  let updated = await Q.updateItem(db(), item.id, patch, c.get("user"));
  const status_id = num(body.status_id);
  if (Number.isFinite(status_id) && status_id !== updated.status_id) {
    updated = (await Q.moveItem(db(), item.id, { statusId: status_id }, c.get("user"))).item;
  }
  return itemView(c, updated);
});

app.post("/items/:id/move", async (c) => {
  const item = await itemOr404(c);
  if (!item) return c.notFound();
  const board = (await Q.boardById(db(), item.board_id))!;
  const body = await c.req.parseBody();
  const statusId = num(body.status_id);
  if (!Number.isFinite(statusId)) return c.text("Which column?", 400);
  let beforeId: number | null = Number.isFinite(num(body.before_id)) ? num(body.before_id) : null;
  const direction = str(body.direction);
  if (direction === "up" || direction === "down") {
    // Keyboard and menu moves: one step within the column.
    const siblings = (await Q.items(db(), item.board_id)).filter((i) => i.status_id === item.status_id);
    const i = siblings.findIndex((s) => s.id === item.id);
    if (direction === "up") beforeId = siblings[i - 1]?.id ?? siblings[0]?.id ?? null;
    else beforeId = siblings[i + 2]?.id ?? null;
    if (direction === "up" && i === 0) return boardResponse(c, board);
    if (direction === "down" && i === siblings.length - 1) return boardResponse(c, board);
  }
  try {
    const r = await Q.moveItem(db(), item.id, { statusId, beforeId }, c.get("user"));
    const message = r.from.id === r.to.id ? `Reordered in ${r.to.label}` : `Moved to ${r.to.label}`;
    return boardResponse(c, board, { message, undo: { url: `/items/${item.id}/move`, fields: { status_id: r.undo.statusId, before_id: r.undo.beforeId ?? "", return: str(body["return"]) } } });
  } catch (e) {
    return c.text(e instanceof Error ? e.message : "Could not move the card", 400);
  }
});

app.post("/items/:id/comment", async (c) => {
  const item = await itemOr404(c);
  if (!item) return c.notFound();
  const body = str((await c.req.parseBody()).body);
  if (body.trim()) await Q.comment(db(), item.id, body, c.get("user"));
  return itemView(c, (await Q.item(db(), item.id))!);
});

app.post("/items/:id/checklist", async (c) => {
  const item = await itemOr404(c);
  if (!item) return c.notFound();
  const body = await c.req.parseBody();
  const list = [...item.checklist];
  const i = num(body.index);
  switch (str(body.action)) {
    case "add": if (str(body.text).trim()) list.push({ text: str(body.text), done: false }); break;
    case "toggle": if (list[i]) list[i] = { ...list[i], done: !list[i].done }; break;
    case "remove": if (list[i]) list.splice(i, 1); break;
  }
  const updated = await Q.updateItem(db(), item.id, { checklist: list }, c.get("user"));
  return itemView(c, updated);
});

app.post("/items/:id/archive", async (c) => {
  const item = await itemOr404(c);
  if (!item) return c.notFound();
  await Q.archiveItem(db(), item.id, c.get("user"));
  const board = (await Q.boardById(db(), item.board_id))!;
  if (c.req.header("hx-target") === "board") {
    return boardResponse(c, board, { message: `Archived "${item.title}"`, undo: { url: `/items/${item.id}/restore`, fields: {} } });
  }
  return itemView(c, (await Q.item(db(), item.id))!);
});

app.post("/items/:id/restore", async (c) => {
  const item = await itemOr404(c);
  if (!item) return c.notFound();
  await Q.restoreItem(db(), item.id, c.get("user"));
  const board = (await Q.boardById(db(), item.board_id))!;
  const ret = str((await c.req.parseBody())["return"]);
  if (!isHx(c)) return c.redirect(localPath(ret, `/b/${board.key}`), 303);
  if (c.req.header("hx-target") === "board") return boardResponse(c, board, { message: `Restored "${item.title}"` });
  return itemView(c, (await Q.item(db(), item.id))!);
});

app.notFound((c) => c.text("Not found", 404));
app.onError((e, c) => {
  console.error(e);
  return c.text(e instanceof Error ? e.message : "Something went wrong", 500);
});

export default app;
