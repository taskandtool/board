// The board: a filter bar, one column per status, a card per item. The whole
// thing is one server-rendered partial (#board) that every change swaps back
// in, so the DOM is never the source of truth for order.
import { cfg, showsField, tagRole } from "../config";
import type { Board, Filters, Item, Person, Status } from "../db/queries";
import { dueState, PRIORITIES, today } from "../db/queries";
import { vocab } from "./layout";

export type BoardData = {
  board: Board; columns: Status[]; items: Item[]; counts: Map<number, number>;
  filters: Filters; people: Person[]; samples: number; user: string | null;
};

const filterQuery = (f: Filters) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v !== undefined && v !== "" && v !== null && k !== "mine") p.set(k, String(v));
  if (f.mine) p.set("mine", "1");
  const s = p.toString();
  return s ? "?" + s : "";
};

export function BoardView({ data }: { data: BoardData }) {
  const { board, columns, items, counts, filters, user, samples } = data;
  const base = `/b/${board.key}`;
  const refresh = `${base}${filterQuery(filters)}`;
  return (
    <div
      id="board"
      data-board={board.key}
      data-refresh={refresh}
      hx-get={refresh}
      hx-trigger="every 30s [document.visibilityState === 'visible' && !window.boardBusy && !(document.activeElement && document.activeElement.closest('#board form'))], board-changed from:body"
      hx-swap="outerHTML"
    >
      <FilterBar data={data} />
      <div class="mt-3 flex gap-3 overflow-x-auto pb-4" data-columns>
        {columns.map((col) => {
          const cards = items.filter((i) => i.status_id === col.id);
          const n = counts.get(col.id) ?? 0;
          const over = col.wip_limit != null && n > col.wip_limit;
          return (
            <section class="flex w-72 shrink-0 flex-col rounded-card bg-panel" data-status-id={col.id} aria-label={col.label}>
              <header class="flex items-center gap-2 px-3 pt-2 pb-1">
                <h2 class="text-label font-semibold">{col.label}</h2>
                <span class={"text-label " + (over ? "rounded-control bg-warn px-1 text-warn-ink" : "text-ink-3")} title={over ? "Over its limit" : col.wip_limit != null ? `Limit ${col.wip_limit}` : undefined}>
                  {n}{col.wip_limit != null ? `/${col.wip_limit}` : ""}
                </span>
                {col.is_done ? <span class="ml-auto text-label text-ink-3" title="Cards here count as finished">done</span> : null}
              </header>
              <ol class="flex min-h-10 flex-col gap-2 px-2 pb-2" data-cards data-status-id={col.id}>
                {cards.map((it) => <Card item={it} columns={columns} board={board} user={user} refresh={refresh} />)}
                {cards.length === 0 && filtersActive(filters) ? <li class="px-1 py-2 text-label text-ink-3">Nothing matches here</li> : null}
              </ol>
              {user ? (
                <details class="px-2 pb-2">
                  <summary class="cursor-pointer list-none rounded-control px-2 py-1 text-label text-ink-2 hover:bg-surface">+ Add {vocab.one.toLowerCase()}</summary>
                  <form method="post" action={`${base}/items`} hx-post={`${base}/items`} hx-target="#board" hx-swap="outerHTML" class="mt-1 flex flex-col gap-1">
                    <input type="hidden" name="status_id" value={col.id} />
                    <input type="hidden" name="return" value={refresh} />
                    <input name="title" required maxlength={200} placeholder="Title" class="w-full rounded-control border border-line-strong bg-surface px-2 py-1" aria-label={`New ${vocab.one.toLowerCase()} title`} autofocus />
                    <button class="self-start rounded-control bg-accent px-3 py-1 text-label text-accent-ink">Add</button>
                  </form>
                </details>
              ) : null}
            </section>
          );
        })}
      </div>
      {user && samples > 0 ? (
        <form method="post" action={`${base}/samples/remove`} hx-post={`${base}/samples/remove`} hx-target="#board" hx-swap="outerHTML" class="mt-1 text-label text-ink-3">
          <input type="hidden" name="return" value={refresh} />
          {samples} example {samples === 1 ? "card explains" : "cards explain"} the board.{" "}
          <button class="underline">Remove the examples</button>
        </form>
      ) : null}
    </div>
  );
}

export function filtersActive(f: Filters) {
  return !!(f.q || f.assignee || f.tag || f.due || f.mine || f.priority !== undefined);
}

export function FilterBar({ data, list = false }: { data: BoardData; list?: boolean }) {
  const { board, filters, people, user, items } = data;
  const base = `/b/${board.key}` + (list ? "/list" : "");
  const tagNames = new Set<string>(cfg.tags.map((t) => t.name));
  for (const it of items) for (const t of it.tags) tagNames.add(t);
  const target = list ? "#list" : "#board";
  return (
    <form method="get" action={base} hx-get={base} hx-target={target} hx-swap="outerHTML" hx-push-url="true" hx-trigger="submit, change" class="flex flex-wrap items-center gap-2 text-label">
      <input type="search" name="q" value={filters.q ?? ""} placeholder={`Search ${vocab.many.toLowerCase()}`} class="w-48 rounded-control border border-line-strong bg-surface px-2 py-1" aria-label="Search" />
      <select name="assignee" class="rounded-control border border-line-strong bg-surface px-2 py-1" aria-label="Assignee">
        <option value="">Anyone</option>
        {people.map((p) => <option value={p.email} selected={filters.assignee === p.email}>{p.name || p.email}</option>)}
      </select>
      <select name="tag" class="rounded-control border border-line-strong bg-surface px-2 py-1" aria-label="Tag">
        <option value="">Any tag</option>
        {[...tagNames].sort().map((t) => <option value={t} selected={filters.tag === t}>{t}</option>)}
      </select>
      <select name="due" class="rounded-control border border-line-strong bg-surface px-2 py-1" aria-label="Due">
        <option value="">Any date</option>
        <option value="overdue" selected={filters.due === "overdue"}>Overdue</option>
        <option value="today" selected={filters.due === "today"}>Due today</option>
        <option value="week" selected={filters.due === "week"}>Due this week</option>
        <option value="none" selected={filters.due === "none"}>No date</option>
      </select>
      {user ? (
        <label class="flex items-center gap-1"><input type="checkbox" name="mine" value="1" checked={!!filters.mine} /> Mine</label>
      ) : null}
      {list ? (
        <>
          <input type="hidden" name="sort" value={(filters as Filters & { sort?: string }).sort ?? ""} />
        </>
      ) : null}
      {filtersActive(filters) ? <a href={base} class="text-ink-2">Clear</a> : null}
      <noscript><button class="rounded-control border border-line-strong px-2 py-1">Apply</button></noscript>
    </form>
  );
}

export function Card({ item, columns, board, user, refresh }: { item: Item; columns: Status[]; board: Board; user: string | null; refresh: string }) {
  const due = dueState(item.due_on, item.completed_at);
  const done = item.checklist.filter((c) => c.done).length;
  const col = columns.find((c) => c.id === item.status_id)!;
  const others = columns.filter((c) => c.id !== item.status_id);
  return (
    <li class="group rounded-card border border-line bg-surface p-2 shadow-card" data-item-id={item.id} data-status-id={item.status_id} tabindex={0}>
      <div class="flex items-start gap-1">
        <a href={`/items/${item.id}`} hx-get={`/items/${item.id}`} hx-target="#drawer" hx-swap="innerHTML" hx-push-url="true" class="grow no-underline hover:underline">
          {item.title}
        </a>
        {user ? (
          <details class="relative shrink-0">
            <summary class="cursor-pointer list-none rounded-control px-1 text-ink-3 opacity-60 hover:bg-panel hover:opacity-100 group-focus-within:opacity-100" aria-label={`Actions for ${item.title}`}>···</summary>
            <div class="absolute right-0 z-20 mt-1 flex w-48 flex-col rounded-card border border-line bg-surface p-1 text-label shadow-lift">
              {others.map((c) => (
                <form method="post" action={`/items/${item.id}/move`} hx-post={`/items/${item.id}/move`} hx-target="#board" hx-swap="outerHTML">
                  <input type="hidden" name="status_id" value={c.id} />
                  <input type="hidden" name="return" value={refresh} />
                  <button class="w-full rounded-control px-2 py-1 text-left hover:bg-panel">Move to {c.label}</button>
                </form>
              ))}
              <form method="post" action={`/items/${item.id}/move`} hx-post={`/items/${item.id}/move`} hx-target="#board" hx-swap="outerHTML">
                <input type="hidden" name="status_id" value={col.id} />
                <input type="hidden" name="direction" value="up" />
                <input type="hidden" name="return" value={refresh} />
                <button class="w-full rounded-control px-2 py-1 text-left hover:bg-panel">Move up</button>
              </form>
              <form method="post" action={`/items/${item.id}/move`} hx-post={`/items/${item.id}/move`} hx-target="#board" hx-swap="outerHTML">
                <input type="hidden" name="status_id" value={col.id} />
                <input type="hidden" name="direction" value="down" />
                <input type="hidden" name="return" value={refresh} />
                <button class="w-full rounded-control px-2 py-1 text-left hover:bg-panel">Move down</button>
              </form>
              <form method="post" action={`/items/${item.id}/archive`} hx-post={`/items/${item.id}/archive`} hx-target="#board" hx-swap="outerHTML">
                <input type="hidden" name="return" value={refresh} />
                <button class="w-full rounded-control px-2 py-1 text-left text-ink-2 hover:bg-panel">Archive</button>
              </form>
            </div>
          </details>
        ) : null}
      </div>
      <div class="mt-1 flex flex-wrap items-center gap-1 text-label empty:hidden">
        {showsField("priority") && item.priority > 0 ? <span class={"rounded-control px-1 " + (item.priority === 2 ? "bg-warn text-warn-ink" : "bg-panel text-ink-2")}>{PRIORITIES[item.priority]}</span> : null}
        {showsField("due_on") && item.due_on ? <DueBadge due={item.due_on} state={due} /> : null}
        {showsField("tags") ? item.tags.map((t) => <span class={`rounded-control px-1 bg-${tagRole(t)} text-ink`}>{t}</span>) : null}
        {showsField("checklist") && item.checklist.length ? <span class="text-ink-3" title="Checklist">{done}/{item.checklist.length}</span> : null}
        {item.is_sample ? <span class="text-ink-3">example</span> : null}
        {showsField("assignee") && item.assignee ? <span class="ml-auto text-ink-3" title={item.assignee}>{shortName(item.assignee)}</span> : null}
      </div>
    </li>
  );
}

export function DueBadge({ due, state }: { due: string; state: ReturnType<typeof dueState> }) {
  const cls = state === "overdue" ? "bg-late text-late-ink" : state === "today" || state === "soon" ? "bg-warn text-warn-ink" : "text-ink-3";
  const label = state === "overdue" ? "Overdue" : state === "today" ? "Today" : formatDate(due);
  return <span class={"rounded-control px-1 " + cls} title={`Due ${due}`}>{label}</span>;
}

export function formatDate(d: string) {
  const [y, m, day] = d.split("-").map(Number);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const thisYear = Number(today().slice(0, 4)) === y;
  return `${day} ${months[m - 1]}${thisYear ? "" : " " + y}`;
}

export function shortName(email: string) {
  const local = email.split("@")[0];
  return local.length > 12 ? local.slice(0, 11) + "…" : local;
}

export function Toast({ message, undo }: { message: string; undo?: { url: string; fields: Record<string, string | number> } }) {
  return (
    <div id="toast" hx-swap-oob="true" class="fixed bottom-4 left-1/2 z-40 -translate-x-1/2 empty:hidden">
      <div class="flex items-center gap-3 rounded-card border border-line bg-night px-4 py-2 text-label text-night-ink shadow-lift" data-toast>
        <span>{message}</span>
        {undo ? (
          <form method="post" action={undo.url} hx-post={undo.url} hx-target="#board" hx-swap="outerHTML">
            {Object.entries(undo.fields).map(([k, v]) => <input type="hidden" name={k} value={String(v)} />)}
            <button class="underline">Undo</button>
          </form>
        ) : null}
        <button type="button" class="text-night-ink-2" aria-label="Dismiss" onclick="this.closest('[data-toast]').remove()">×</button>
      </div>
    </div>
  );
}
