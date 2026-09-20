// Every query the board runs, named. Routes, scripts and tests all come
// through here, so the rules live in one place: positions are sparse
// integers renumbered per column inside the move's transaction; entering a
// done column sets completed_at and leaving one clears it; every change
// writes an activity row with who did it.
import type pg from "pg";
import "./types";

export type Board = { id: number; key: string; name: string; position: number; archived_at: Date | null };
export type Status = {
  id: number; board_id: number; key: string; label: string; position: number;
  wip_limit: number | null; is_done: boolean; archived_at: Date | null;
};
export type Check = { text: string; done: boolean };
export type Item = {
  id: number; board_id: number; status_id: number; title: string; notes: string; position: number;
  assignee: string | null; due_on: string | null; priority: number; tags: string[]; checklist: Check[];
  fields: Record<string, string>; customer_ref: string | null; is_sample: boolean; created_by: string | null;
  created_at: Date; updated_at: Date; completed_at: Date | null; archived_at: Date | null;
};
export type Activity = {
  id: number; item_id: number; who: string | null; kind: string; body: string | null;
  from_status: string | null; to_status: string | null; at: Date;
};
export type Person = { email: string; name: string | null; last_seen_at: Date | null; active: boolean };

export type Filters = {
  q?: string; assignee?: string; tag?: string; due?: "overdue" | "today" | "week" | "none" | ""; mine?: string;
  priority?: number;
};

export type ItemPatch = Partial<Pick<Item, "title" | "notes" | "assignee" | "due_on" | "priority" | "tags" | "fields" | "customer_ref" | "checklist">>;

type Q = pg.Pool | pg.PoolClient;

export const PRIORITIES = ["Normal", "High", "Urgent"] as const;
export const STALE_DAYS = 3;
const KEY = /^[a-z0-9][a-z0-9_-]{0,39}$/;

export function slugify(name: string): string {
  const s = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  return KEY.test(s) ? s : "b" + Date.now().toString(36);
}

// ---- boards ---------------------------------------------------------------

export async function boards(q: Q): Promise<Board[]> {
  return (await q.query<Board>("select * from boards where archived_at is null order by position, id")).rows;
}

export async function boardByKey(q: Q, key: string): Promise<Board | null> {
  return (await q.query<Board>("select * from boards where key = $1 and archived_at is null", [key])).rows[0] ?? null;
}

export async function boardById(q: Q, id: number): Promise<Board | null> {
  return (await q.query<Board>("select * from boards where id = $1", [id])).rows[0] ?? null;
}

// A new board starts with the first board's column shape, so it is usable at
// once; the owner reshapes it in the column editor.
export async function createBoard(q: Q, name: string, key = slugify(name)): Promise<Board> {
  if (!KEY.test(key)) throw new Error(`board key ${key} must be lowercase letters, digits, - or _`);
  const pos = (await q.query<{ n: number }>("select coalesce(max(position), -1) + 1 as n from boards")).rows[0].n;
  const board = (await q.query<Board>("insert into boards (key, name, position) values ($1, $2, $3) returning *", [key, name, pos])).rows[0];
  const first = (await q.query<Status>("select s.* from statuses s join boards b on b.id = s.board_id where b.id <> $1 and s.archived_at is null order by b.position, s.position limit 12", [board.id])).rows;
  const template = first.filter((s) => s.board_id === first[0]?.board_id);
  const cols = template.length ? template : [{ key: "todo", label: "To do", wip_limit: null, is_done: false }, { key: "doing", label: "Doing", wip_limit: null, is_done: false }, { key: "done", label: "Done", wip_limit: null, is_done: true }];
  for (const [i, c] of cols.entries()) {
    await q.query("insert into statuses (board_id, key, label, position, wip_limit, is_done) values ($1, $2, $3, $4, $5, $6)", [board.id, c.key, c.label, i, c.wip_limit, c.is_done]);
  }
  return board;
}

export async function renameBoard(q: Q, id: number, name: string): Promise<void> {
  await q.query("update boards set name = $2 where id = $1", [id, name]);
}

// ---- statuses (columns) ---------------------------------------------------

export async function statuses(q: Q, boardId: number, includeArchived = false): Promise<Status[]> {
  return (await q.query<Status>(
    `select * from statuses where board_id = $1 ${includeArchived ? "" : "and archived_at is null"} order by position, id`,
    [boardId],
  )).rows;
}

export async function statusById(q: Q, id: number): Promise<Status | null> {
  return (await q.query<Status>("select * from statuses where id = $1", [id])).rows[0] ?? null;
}

export async function statusByKey(q: Q, boardId: number, key: string): Promise<Status | null> {
  return (await q.query<Status>("select * from statuses where board_id = $1 and key = $2 and archived_at is null", [boardId, key])).rows[0] ?? null;
}

export async function createStatus(q: Q, boardId: number, label: string, opts: { key?: string; wip_limit?: number | null; is_done?: boolean } = {}): Promise<Status> {
  const key = opts.key ?? slugify(label);
  if (!KEY.test(key)) throw new Error(`column key ${key} must be lowercase letters, digits, - or _`);
  const pos = (await q.query<{ n: number }>("select coalesce(max(position), -1) + 1 as n from statuses where board_id = $1", [boardId])).rows[0].n;
  // A done column at the end stays at the end: a new column lands before it.
  const lastDone = (await q.query<Status>("select * from statuses where board_id = $1 and archived_at is null and is_done order by position desc limit 1", [boardId])).rows[0];
  const status = (await q.query<Status>(
    "insert into statuses (board_id, key, label, position, wip_limit, is_done) values ($1, $2, $3, $4, $5, $6) returning *",
    [boardId, key, label, pos, opts.wip_limit ?? null, !!opts.is_done],
  )).rows[0];
  if (lastDone && !opts.is_done && lastDone.position === pos - 1) {
    await q.query("update statuses set position = $2 where id = $1", [status.id, lastDone.position]);
    await q.query("update statuses set position = $2 where id = $1", [lastDone.id, pos]);
    status.position = lastDone.position;
  }
  return status;
}

export async function updateStatus(q: Q, id: number, patch: { label?: string; wip_limit?: number | null; is_done?: boolean }): Promise<Status> {
  const cur = await statusById(q, id);
  if (!cur) throw new Error("no such column");
  const next = { label: patch.label ?? cur.label, wip_limit: patch.wip_limit === undefined ? cur.wip_limit : patch.wip_limit, is_done: patch.is_done ?? cur.is_done };
  const s = (await q.query<Status>("update statuses set label = $2, wip_limit = $3, is_done = $4 where id = $1 returning *", [id, next.label, next.wip_limit, next.is_done])).rows[0];
  if (next.is_done !== cur.is_done) {
    // Cards already in the column follow the column's new meaning.
    await q.query(
      next.is_done
        ? "update items set completed_at = coalesce(completed_at, now()) where status_id = $1 and archived_at is null"
        : "update items set completed_at = null where status_id = $1 and archived_at is null",
      [id],
    );
  }
  return s;
}

export async function moveStatus(q: Q, id: number, dir: "left" | "right"): Promise<void> {
  const cur = await statusById(q, id);
  if (!cur) throw new Error("no such column");
  const cols = await statuses(q, cur.board_id);
  const i = cols.findIndex((c) => c.id === id);
  const j = dir === "left" ? i - 1 : i + 1;
  if (j < 0 || j >= cols.length) return;
  const [a, b] = [cols[i], cols[j]];
  await q.query("update statuses set position = $2 where id = $1", [a.id, b.position]);
  await q.query("update statuses set position = $2 where id = $1", [b.id, a.position]);
  await q.query("with r as (select id, row_number() over (order by position, id) - 1 as rn from statuses where board_id = $1 and archived_at is null) update statuses set position = r.rn from r where statuses.id = r.id", [cur.board_id]);
}

// A column that still holds cards cannot be archived: the cards would
// vanish from the board with them. Move them first; the error says how many.
export async function archiveStatus(q: Q, id: number): Promise<void> {
  const n = (await q.query<{ n: string }>("select count(*)::text as n from items where status_id = $1 and archived_at is null", [id])).rows[0].n;
  if (Number(n) > 0) throw new Error(`this column still holds ${n} card${n === "1" ? "" : "s"}; move them first`);
  const cur = await statusById(q, id);
  if (!cur) throw new Error("no such column");
  const live = await statuses(q, cur.board_id);
  if (live.length <= 1) throw new Error("a board needs at least one column");
  await q.query("update statuses set archived_at = now() where id = $1", [id]);
}

// ---- items ----------------------------------------------------------------

const ITEM_ORDER = "order by s.position, i.position, i.id";

function where(filters: Filters, params: unknown[]): string {
  const parts: string[] = [];
  const add = (sql: string, v: unknown) => { params.push(v); parts.push(sql.replace("?", `$${params.length}`)); };
  if (filters.q) add("(i.title ilike ? or i.notes ilike ? )".replace("? )", `$${params.length + 1})`), `%${filters.q}%`);
  if (filters.assignee) add("i.assignee = ?", filters.assignee);
  if (filters.mine) add("i.assignee = ?", filters.mine);
  if (filters.tag) add("? = any(i.tags)", filters.tag);
  if (filters.priority !== undefined) add("i.priority = ?", filters.priority);
  if (filters.due === "overdue") parts.push("i.due_on < current_date and i.completed_at is null");
  if (filters.due === "today") parts.push("i.due_on = current_date");
  if (filters.due === "week") parts.push("i.due_on >= current_date and i.due_on < current_date + 7");
  if (filters.due === "none") parts.push("i.due_on is null");
  return parts.length ? " and " + parts.join(" and ") : "";
}

export async function items(q: Q, boardId: number, filters: Filters = {}): Promise<Item[]> {
  const params: unknown[] = [boardId];
  const sql = `select i.* from items i join statuses s on s.id = i.status_id where i.board_id = $1 and i.archived_at is null${where(filters, params)} ${ITEM_ORDER}`;
  return (await q.query<Item>(sql, params)).rows;
}

export async function archivedItems(q: Q, boardId: number): Promise<Item[]> {
  return (await q.query<Item>("select * from items where board_id = $1 and archived_at is not null order by archived_at desc limit 200", [boardId])).rows;
}

export async function item(q: Q, id: number): Promise<Item | null> {
  return (await q.query<Item>("select * from items where id = $1", [id])).rows[0] ?? null;
}

export async function activity(q: Q, itemId: number): Promise<Activity[]> {
  return (await q.query<Activity>("select * from activity where item_id = $1 order by at desc, id desc limit 200", [itemId])).rows;
}

async function log(q: Q, itemId: number, who: string | null, kind: string, body: string | null = null, from: string | null = null, to: string | null = null) {
  await q.query("insert into activity (item_id, who, kind, body, from_status, to_status) values ($1, $2, $3, $4, $5, $6)", [itemId, who, kind, body, from, to]);
}

export type NewItem = {
  title: string; status_id?: number; assignee?: string | null; due_on?: string | null; priority?: number;
  tags?: string[]; fields?: Record<string, string>; customer_ref?: string | null; notes?: string; top?: boolean;
};

export function cleanTitle(t: string): string {
  return t.replace(/\s+/g, " ").trim().slice(0, 200);
}

export function cleanTags(tags: string[] | string | undefined): string[] {
  const list = Array.isArray(tags) ? tags : (tags ?? "").split(",");
  return [...new Set(list.map((t) => t.trim()).filter(Boolean).map((t) => t.slice(0, 40)))].slice(0, 12);
}

export function cleanDate(d: string | null | undefined): string | null {
  if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  // A real calendar date: "2026-02-30" parses, but rolls into March.
  const t = Date.parse(d + "T00:00:00Z");
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === d ? d : null;
}

export async function createItem(q: Q, boardId: number, input: NewItem, who: string | null): Promise<Item> {
  const title = cleanTitle(input.title);
  if (!title) throw new Error("a card needs a title");
  const cols = await statuses(q, boardId);
  const status = cols.find((c) => c.id === input.status_id) ?? cols[0];
  if (!status) throw new Error("the board has no columns");
  const pos = input.top
    ? (await q.query<{ n: number }>("select coalesce(min(position), 1) - 1 as n from items where status_id = $1 and archived_at is null", [status.id])).rows[0].n
    : (await q.query<{ n: number }>("select coalesce(max(position), -1) + 1 as n from items where status_id = $1 and archived_at is null", [status.id])).rows[0].n;
  const created = (await q.query<Item>(
    `insert into items (board_id, status_id, title, notes, position, assignee, due_on, priority, tags, fields, customer_ref, created_by, completed_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) returning *`,
    [boardId, status.id, title, (input.notes ?? "").slice(0, 20000), pos, input.assignee || null, cleanDate(input.due_on), clampPriority(input.priority), cleanTags(input.tags), input.fields ?? {}, input.customer_ref || null, who, status.is_done ? new Date() : null],
  )).rows[0];
  await log(q, created.id, who, "created", null, null, status.key);
  if (input.top) await renumber(q, status.id);
  return created;
}

export function clampPriority(p: number | string | undefined): number {
  const n = Number(p ?? 0);
  return Number.isInteger(n) && n >= 0 && n <= 2 ? n : 0;
}

export async function updateItem(q: Q, id: number, patch: ItemPatch, who: string | null): Promise<Item> {
  const cur = await item(q, id);
  if (!cur) throw new Error("no such card");
  const next = {
    title: patch.title !== undefined ? cleanTitle(patch.title) || cur.title : cur.title,
    notes: patch.notes !== undefined ? patch.notes.slice(0, 20000) : cur.notes,
    assignee: patch.assignee !== undefined ? (patch.assignee || null) : cur.assignee,
    due_on: patch.due_on !== undefined ? cleanDate(patch.due_on) : cur.due_on,
    priority: patch.priority !== undefined ? clampPriority(patch.priority) : cur.priority,
    tags: patch.tags !== undefined ? cleanTags(patch.tags) : cur.tags,
    fields: patch.fields !== undefined ? { ...cur.fields, ...patch.fields } : cur.fields,
    customer_ref: patch.customer_ref !== undefined ? (patch.customer_ref || null) : cur.customer_ref,
    checklist: patch.checklist !== undefined ? cleanChecklist(patch.checklist) : cur.checklist,
  };
  const changed = (Object.keys(next) as (keyof typeof next)[]).filter((k) => JSON.stringify(next[k]) !== JSON.stringify(cur[k]));
  if (!changed.length) return cur;
  const updated = (await q.query<Item>(
    `update items set title = $2, notes = $3, assignee = $4, due_on = $5, priority = $6, tags = $7, fields = $8, customer_ref = $9, checklist = $10, updated_at = now(), is_sample = false
     where id = $1 returning *`,
    [id, next.title, next.notes, next.assignee, next.due_on, next.priority, next.tags, next.fields, next.customer_ref, JSON.stringify(next.checklist)],
  )).rows[0];
  await log(q, id, who, "edited", changed.join(", "));
  return updated;
}

export function cleanChecklist(list: unknown): Check[] {
  if (!Array.isArray(list)) return [];
  return list
    .filter((c) => c && typeof c.text === "string" && c.text.trim())
    .map((c) => ({ text: String(c.text).trim().slice(0, 300), done: !!c.done }))
    .slice(0, 50);
}

async function renumber(q: Q, statusId: number) {
  await q.query(
    "with r as (select id, row_number() over (order by position, id) - 1 as rn from items where status_id = $1 and archived_at is null) update items set position = r.rn from r where items.id = r.id",
    [statusId],
  );
}

export type Move = { statusId: number; beforeId?: number | null };
export type MoveResult = { item: Item; from: Status; to: Status; undo: Move };

// Move a card to a column, before a given card (or to the bottom). One
// transaction: lock the card, place it, renumber the columns it left and
// joined, keep completed_at honest, record the activity. Returns what undo
// needs: where the card was and which card followed it.
export async function moveItem(pool: pg.Pool, id: number, move: Move, who: string | null): Promise<MoveResult> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const cur = (await client.query<Item>("select * from items where id = $1 for update", [id])).rows[0];
    if (!cur || cur.archived_at) throw new Error("no such card");
    const to = await statusById(client, move.statusId);
    if (!to || to.board_id !== cur.board_id || to.archived_at) throw new Error("no such column on this board");
    const from = (await statusById(client, cur.status_id))!;
    const after = (await client.query<{ id: number }>("select id from items where status_id = $1 and archived_at is null and id <> $2 and (position > $3 or (position = $3 and id > $2)) order by position, id limit 1", [cur.status_id, id, cur.position])).rows[0];
    const undo: Move = { statusId: cur.status_id, beforeId: after?.id ?? null };

    const others = (await client.query<{ id: number }>("select id from items where status_id = $1 and archived_at is null and id <> $2 order by position, id", [to.id, id])).rows.map((r) => r.id);
    let at = others.length;
    if (move.beforeId != null) {
      const i = others.indexOf(move.beforeId);
      if (i >= 0) at = i;
    }
    const order = [...others.slice(0, at), id, ...others.slice(at)];
    for (const [i, itemId] of order.entries()) {
      await client.query("update items set position = $2 where id = $1", [itemId, i]);
    }
    const completed = to.is_done ? (cur.completed_at ?? new Date()) : null;
    const moved = (await client.query<Item>("update items set status_id = $2, completed_at = $3, updated_at = now(), is_sample = false where id = $1 returning *", [id, to.id, completed])).rows[0];
    if (from.id !== to.id) {
      await renumber(client, from.id);
      await log(client, id, who, "moved", null, from.key, to.key);
    } else {
      await log(client, id, who, "reordered", null, from.key, to.key);
    }
    await client.query("commit");
    return { item: moved, from, to, undo };
  } catch (e) {
    await client.query("rollback").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

export async function comment(q: Q, id: number, body: string, who: string | null): Promise<void> {
  const text = body.trim().slice(0, 5000);
  if (!text) throw new Error("an empty comment");
  await log(q, id, who, "comment", text);
  await q.query("update items set updated_at = now() where id = $1", [id]);
}

export async function archiveItem(q: Q, id: number, who: string | null): Promise<void> {
  await q.query("update items set archived_at = now(), updated_at = now() where id = $1 and archived_at is null", [id]);
  await log(q, id, who, "archived");
}

export async function restoreItem(q: Q, id: number, who: string | null): Promise<void> {
  const cur = await item(q, id);
  if (!cur || !cur.archived_at) return;
  const pos = (await q.query<{ n: number }>("select coalesce(max(position), -1) + 1 as n from items where status_id = $1 and archived_at is null", [cur.status_id])).rows[0].n;
  await q.query("update items set archived_at = null, position = $2, updated_at = now() where id = $1", [id, pos]);
  await log(q, id, who, "restored");
}

// Archive every card in a done column whose completion is older than N days
// (0 archives all of them). Returns how many.
export async function archiveDone(q: Q, boardId: number, olderThanDays: number, who: string | null): Promise<number> {
  const rows = (await q.query<{ id: number }>(
    `select i.id from items i join statuses s on s.id = i.status_id
     where i.board_id = $1 and i.archived_at is null and s.is_done and coalesce(i.completed_at, i.updated_at) < now() - ($2::int * interval '1 day')`,
    [boardId, Math.max(0, Math.floor(olderThanDays))],
  )).rows;
  for (const r of rows) await archiveItem(q, r.id, who);
  return rows.length;
}

export async function removeSamples(q: Q, boardId: number): Promise<number> {
  const r = await q.query("delete from items where board_id = $1 and is_sample", [boardId]);
  return r.rowCount ?? 0;
}

export async function sampleCount(q: Q, boardId: number): Promise<number> {
  return Number((await q.query<{ n: string }>("select count(*)::text as n from items where board_id = $1 and is_sample and archived_at is null", [boardId])).rows[0].n);
}

// ---- people ---------------------------------------------------------------

export async function people(q: Q): Promise<Person[]> {
  return (await q.query<Person>("select * from people where active order by email")).rows;
}

export async function touchPerson(q: Q, email: string): Promise<void> {
  await q.query(
    "insert into people (email, last_seen_at) values ($1, now()) on conflict (email) do update set last_seen_at = now(), active = true",
    [email.toLowerCase()],
  );
}

// ---- reading the board ----------------------------------------------------

export type Attention = { item: Item; why: string[] };

// The question the board exists to answer: what needs attention, and why.
export async function attention(q: Q, boardId: number): Promise<Attention[]> {
  const cols = await statuses(q, boardId);
  const first = cols[0]?.id;
  const over = new Set(cols.filter((c) => c.wip_limit != null).filter((c) => false).map((c) => c.id));
  const counts = await columnCounts(q, boardId);
  for (const c of cols) if (c.wip_limit != null && (counts.get(c.id) ?? 0) > c.wip_limit) over.add(c.id);
  const rows = (await q.query<Item & { is_done: boolean }>(
    `select i.*, s.is_done from items i join statuses s on s.id = i.status_id where i.board_id = $1 and i.archived_at is null and not s.is_done ${ITEM_ORDER}`,
    [boardId],
  )).rows;
  const today = new Date().toISOString().slice(0, 10);
  const stale = Date.now() - STALE_DAYS * 86_400_000;
  const out: Attention[] = [];
  for (const it of rows) {
    const why: string[] = [];
    if (it.due_on && it.due_on < today) why.push(`overdue since ${it.due_on}`);
    else if (it.due_on === today) why.push("due today");
    if (it.priority === 2) why.push("urgent");
    if (it.status_id !== first && new Date(it.updated_at).getTime() < stale) why.push(`no change in ${STALE_DAYS} days while in progress`);
    if (over.has(it.status_id)) why.push("its column is over its limit");
    if (why.length) out.push({ item: it, why });
  }
  const rank = (a: Attention) => (a.why[0]?.startsWith("overdue") ? 0 : a.why.includes("urgent") ? 1 : a.why[0] === "due today" ? 2 : 3);
  return out.sort((a, b) => rank(a) - rank(b) || (a.item.due_on ?? "9").localeCompare(b.item.due_on ?? "9"));
}

export async function columnCounts(q: Q, boardId: number): Promise<Map<number, number>> {
  const rows = (await q.query<{ status_id: number; n: string }>("select status_id, count(*)::text as n from items where board_id = $1 and archived_at is null group by status_id", [boardId])).rows;
  return new Map(rows.map((r) => [Number(r.status_id), Number(r.n)]));
}

export type Summary = { board: Board; columns: { status: Status; count: number; over: boolean }[]; overdue: number; dueThisWeek: number; unassigned: number; doneThisWeek: number };

export async function summary(q: Q, boardId: number): Promise<Summary> {
  const board = (await boardById(q, boardId))!;
  const cols = await statuses(q, boardId);
  const counts = await columnCounts(q, boardId);
  const stat = (await q.query<{ overdue: string; week: string; unassigned: string; done_week: string }>(
    `select
       count(*) filter (where i.due_on < current_date and not s.is_done)::text as overdue,
       count(*) filter (where i.due_on >= current_date and i.due_on < current_date + 7 and not s.is_done)::text as week,
       count(*) filter (where i.assignee is null and not s.is_done)::text as unassigned,
       count(*) filter (where i.completed_at >= now() - interval '7 days')::text as done_week
     from items i join statuses s on s.id = i.status_id where i.board_id = $1 and i.archived_at is null`,
    [boardId],
  )).rows[0];
  return {
    board,
    columns: cols.map((s) => ({ status: s, count: counts.get(s.id) ?? 0, over: s.wip_limit != null && (counts.get(s.id) ?? 0) > s.wip_limit })),
    overdue: Number(stat.overdue), dueThisWeek: Number(stat.week), unassigned: Number(stat.unassigned), doneThisWeek: Number(stat.done_week),
  };
}

// ---- helpers shared by views and scripts ----------------------------------

export type DueState = "overdue" | "today" | "soon" | "later" | "none";

export function dueState(due: string | null, completed: Date | null, today = new Date().toISOString().slice(0, 10)): DueState {
  if (!due) return "none";
  if (completed) return "later";
  if (due < today) return "overdue";
  if (due === today) return "today";
  const days = (Date.parse(due) - Date.parse(today)) / 86_400_000;
  return days <= 3 ? "soon" : "later";
}
