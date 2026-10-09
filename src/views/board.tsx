// The board: a filter bar, one column per status, a card per item. The whole
// thing is one server-rendered partial (#board) that every change swaps back
// in, so the DOM is never the source of truth for order.
import { cfg, showsField, tagRole, todayIn } from "../config";
import type { Board, BoardItem, Filters, Person, Status } from "../db/queries";
import { dueState, PRIORITIES, today } from "../db/queries";
import { vocab } from "./layout";
import { initials, type NameOf } from "./people";
import { button, control, menuItem, primary } from "./ui";

export type BoardData = {
  board: Board; columns: Status[]; items: BoardItem[]; counts: Map<number, number>;
  filters: Filters; people: Person[]; nameOf: NameOf; samples: number; user: string | null;
  refreshSeconds: number;
};

// The board re-fetches itself after a drawer edit (board-changed) and, where
// that is free, on a timer while the tab is visible and nothing is being
// dragged or typed. The timer is the server's call (src/db/client.ts).
export function refreshTrigger(seconds: number): string {
  const timer = seconds > 0
    ? `every ${seconds}s [document.visibilityState === 'visible' && !window.boardBusy && !(document.activeElement && document.activeElement.closest('#board form'))], `
    : "";
  return timer + "board-changed from:body";
}

const filterQuery = (f: Filters) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v !== undefined && v !== "" && v !== null && k !== "mine") p.set(k, String(v));
  if (f.mine) p.set("mine", "1");
  const s = p.toString();
  return s ? "?" + s : "";
};

export function BoardView({ data }: { data: BoardData }) {
  const { board, columns, items, counts, filters, samples, refreshSeconds } = data;
  const base = `/b/${board.key}`;
  const refresh = `${base}${filterQuery(filters)}`;
  const filtering = filtersActive(filters);
  return (
    <div
      id="board"
      data-board={board.key}
      data-refresh={refresh}
      hx-get={refresh}
      hx-trigger={refreshTrigger(refreshSeconds)}
      hx-swap="outerHTML"
      class="flex min-h-0 flex-1 flex-col"
    >
      <FilterBar data={data} />
      {/* The board fills the window and each column scrolls on its own, so
          the filters and the column heads stay in view. */}
      <div class="mt-3 flex min-h-0 flex-1 items-start gap-3 overflow-x-auto pb-4" data-columns>
        {columns.map((col) => {
          const cards = items.filter((i) => i.status_id === col.id);
          const n = counts.get(col.id) ?? 0;
          const over = col.wip_limit != null && n > col.wip_limit;
          return (
            <section class="flex max-h-full w-72 shrink-0 flex-col rounded-card bg-panel" data-status-id={col.id} aria-label={col.label}>
              <header class="flex items-center gap-2 px-3 pt-2 pb-1">
                <h2 class="text-label font-semibold">{col.label}</h2>
                <span class={"text-label " + (over ? "rounded-control bg-warn px-1 text-warn-ink" : "text-ink-3")} title={over ? "Over its limit" : col.wip_limit != null ? `Limit ${col.wip_limit}` : undefined}>
                  {filtering ? `${cards.length} of ${n}` : `${n}${col.wip_limit != null ? `/${col.wip_limit}` : ""}`}
                </span>
                {col.is_done ? <svg class="ml-auto size-4 text-ink-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="Cards here count as finished"><title>Cards here count as finished</title><path d="M3.5 8.5 6.5 11.5 12.5 5" /></svg> : null}
              </header>
              <ol class="flex min-h-10 flex-col gap-2 overflow-y-auto px-2 pb-2" data-cards data-status-id={col.id}>
                {cards.map((it) => <Card item={it} columns={columns} refresh={refresh} nameOf={data.nameOf} />)}
                {cards.length === 0 && filtering ? <li class="px-1 py-2 text-label text-ink-3">Nothing matches here</li> : null}
              </ol>
              <details class="px-2 pb-2" data-composer={col.id}>
                <summary class="cursor-pointer list-none rounded-control px-2 py-1 text-label text-ink-2 hover:bg-surface">+ Add {vocab.one.toLowerCase()}</summary>
                <form method="post" action={`${base}/items`} hx-post={`${base}/items`} hx-target="#board" hx-swap="outerHTML" class="mt-1 flex flex-col gap-1">
                  <input type="hidden" name="status_id" value={col.id} />
                  <input type="hidden" name="return" value={refresh} />
                  <input name="title" required maxlength={200} placeholder="Title" class={"w-full " + control} aria-label={`New ${vocab.one.toLowerCase()} title`} />
                  <button class={"self-start text-label " + primary}>Add</button>
                </form>
              </details>
            </section>
          );
        })}
      </div>
      {samples > 0 ? (
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
  const { board, filters, people, nameOf, user, items } = data;
  const base = `/b/${board.key}` + (list ? "/list" : "");
  const tagNames = new Set<string>(cfg.tags.map((t) => t.name));
  for (const it of items) for (const t of it.tags) tagNames.add(t);
  const target = list ? "#list" : "#board";
  return (
    <form method="get" action={base} hx-get={base} hx-target={target} hx-swap="outerHTML" hx-push-url="true" hx-trigger="submit, change" class="flex flex-wrap items-center gap-2 text-label">
      <input type="search" name="q" value={filters.q ?? ""} placeholder={`Search ${vocab.many.toLowerCase()}`} class={"w-48 " + control} aria-label="Search" />
      <select name="assignee" class={control} aria-label="Assignee">
        <option value="">Anyone</option>
        {people.map((p) => <option value={p.email} selected={filters.assignee === p.email}>{nameOf(p.email)}</option>)}
      </select>
      <select name="tag" class={control} aria-label="Tag">
        <option value="">Any tag</option>
        {[...tagNames].sort().map((t) => <option value={t} selected={filters.tag === t}>{t}</option>)}
      </select>
      <select name="due" class={control} aria-label="Due">
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
      <noscript><button class={button}>Apply</button></noscript>
    </form>
  );
}

export function Card({ item, columns, refresh, nameOf }: { item: BoardItem; columns: Status[]; refresh: string; nameOf: NameOf }) {
  const due = dueState(item.due_on, item.completed_at);
  const done = item.checklist.filter((c) => c.done).length;
  const col = columns.find((c) => c.id === item.status_id)!;
  const others = columns.filter((c) => c.id !== item.status_id);
  return (
    <li class="group cursor-pointer rounded-card border border-line bg-surface px-3 py-2 shadow-card hover:border-line-strong" data-item-id={item.id} data-status-id={item.status_id} tabindex={0}>
      {item.cover_id ? <img src={`/files/${item.cover_id}?thumb=1`} alt="" loading="lazy" draggable={false} class="-mx-3 -mt-2 mb-2 block h-32 w-[calc(100%+1.5rem)] max-w-none rounded-t-card bg-panel object-cover" /> : null}
      <div class="flex items-start gap-1">
        <a href={`/items/${item.id}`} hx-get={`/items/${item.id}`} hx-target="#drawer" hx-swap="innerHTML" hx-push-url="true" class="grow no-underline">
          {item.title}
        </a>
        <details class="relative -mr-1 shrink-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 open:opacity-100 touch:opacity-100">
          <summary class="min-h-6 min-w-6 cursor-pointer list-none rounded-control px-1 text-center text-ink-3 hover:bg-panel hover:text-ink" aria-label={`Actions for ${item.title}`}>···</summary>
          <div class="absolute right-0 z-20 mt-1 flex w-48 flex-col rounded-card border border-line bg-surface p-1 text-label shadow-lift">
            {others.map((c) => (
              <form method="post" action={`/items/${item.id}/move`} hx-post={`/items/${item.id}/move`} hx-target="#board" hx-swap="outerHTML">
                <input type="hidden" name="status_id" value={c.id} />
                <input type="hidden" name="return" value={refresh} />
                <button class={menuItem}>Move to {c.label}</button>
              </form>
            ))}
            <form method="post" action={`/items/${item.id}/move`} hx-post={`/items/${item.id}/move`} hx-target="#board" hx-swap="outerHTML">
              <input type="hidden" name="status_id" value={col.id} />
              <input type="hidden" name="direction" value="up" />
              <input type="hidden" name="return" value={refresh} />
              <button class={menuItem}>Move up</button>
            </form>
            <form method="post" action={`/items/${item.id}/move`} hx-post={`/items/${item.id}/move`} hx-target="#board" hx-swap="outerHTML">
              <input type="hidden" name="status_id" value={col.id} />
              <input type="hidden" name="direction" value="down" />
              <input type="hidden" name="return" value={refresh} />
              <button class={menuItem}>Move down</button>
            </form>
            <form method="post" action={`/items/${item.id}/archive`} hx-post={`/items/${item.id}/archive`} hx-target="#board" hx-swap="outerHTML">
              <input type="hidden" name="return" value={refresh} />
              <button class={"text-ink-2 " + menuItem}>Archive</button>
            </form>
          </div>
        </details>
      </div>
      <div class="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-label empty:hidden">
        {showsField("priority") ? <PriorityBadge priority={item.priority} /> : null}
        {showsField("due_on") && item.due_on ? <DueBadge due={item.due_on} state={due} /> : null}
        {showsField("tags") ? item.tags.map((t) => <span class={`rounded-full px-2 bg-${tagRole(t)} text-ink`}>{t}</span>) : null}
        {showsField("checklist") && item.checklist.length ? <span class="inline-flex items-center gap-0.5 text-ink-3" title="Checklist"><svg class="size-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2.5" y="2.5" width="11" height="11" rx="2" /><path d="M5.5 8.25 7.25 10 10.5 6.5" /></svg>{done}/{item.checklist.length}</span> : null}
        {item.file_count ? <span class="inline-flex items-center gap-0.5 text-ink-3" title="Photos and files"><svg class="size-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m13.5 7.5-5.3 5.3a3.2 3.2 0 0 1-4.5-4.5l5.6-5.6a2.1 2.1 0 0 1 3 3l-5.6 5.6a1.1 1.1 0 0 1-1.5-1.5L10.5 4.5" /></svg>{item.file_count}</span> : null}
        {item.is_sample ? <span class="text-ink-3">example</span> : null}
        {showsField("assignee") && item.assignee ? <span class="ml-auto inline-flex size-6 items-center justify-center rounded-full bg-panel font-semibold text-ink-2" title={nameOf(item.assignee)} aria-label={`Assigned to ${nameOf(item.assignee)}`}>{initials(nameOf(item.assignee))}</span> : null}
      </div>
    </li>
  );
}

// Priority is outlined, so it never reads as a date: dates are the filled badges.
export function PriorityBadge({ priority }: { priority: number }) {
  if (!priority) return null;
  return <span class={"rounded-control border px-1.5 " + (priority === 2 ? "border-late text-late" : "border-line-strong text-ink-2")}>{PRIORITIES[priority]}</span>;
}

export function DueBadge({ due, state }: { due: string; state: ReturnType<typeof dueState> }) {
  const cls = state === "overdue" ? "rounded-control px-1.5 bg-late text-late-ink" : state === "today" || state === "soon" ? "rounded-control px-1.5 bg-warn text-warn-ink" : "text-ink-3";
  const label = state === "overdue" ? "Overdue" : state === "today" ? "Today" : formatDate(due);
  return <span class={cls} title={`Due ${due}`}>{label}</span>;
}

export function formatDate(d: string) {
  const [y, m, day] = d.split("-").map(Number);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const thisYear = Number(today().slice(0, 4)) === y;
  return `${day} ${months[m - 1]}${thisYear ? "" : " " + y}`;
}

// The day a moment fell on in the business's time zone, written as above.
export const formatDay = (at: Date) => formatDate(todayIn(cfg.time_zone, new Date(at)));

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
