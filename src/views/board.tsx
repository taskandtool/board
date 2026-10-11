// The board: a filter bar, one column per status, a card per item. The whole
// thing is one server-rendered partial (#board) that every change swaps back
// in, so the DOM is never the source of truth for order.
import { cfg, faceOf, formatMoney, moneyValue, showsField, tagRole, todayIn, totalFields } from "../config";
import type { Board, BoardItem, Filters, Person, Status } from "../db/queries";
import { dueState, PRIORITIES, today } from "../db/queries";
import { vocab } from "./layout";
import { initials, type NameOf } from "./people";
import { Icon } from "./icons";
import { badge, button, control, ghost, menuItem, primary } from "./ui";

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
      {samples > 0 ? (
        <form method="post" action={`${base}/samples/remove`} hx-post={`${base}/samples/remove`} hx-target="#board" hx-swap="outerHTML" class="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-card bg-accent-soft px-3 py-2 text-label text-ink">
          <input type="hidden" name="return" value={refresh} />
          <span>The {samples} {samples === 1 ? "card marked example explains" : "cards marked example explain"} the board.</span>
          <button class="font-semibold text-accent hover:underline">Remove the examples</button>
        </form>
      ) : null}
      {/* The board fills the window and each column scrolls on its own, so
          the filters and the column heads stay in view. */}
      <div class="mt-4 flex min-h-0 flex-1 items-start gap-3 overflow-x-auto pb-4" data-columns>
        {columns.map((col) => {
          const cards = items.filter((i) => i.status_id === col.id);
          const n = counts.get(col.id) ?? 0;
          // Example cards explain the board; they never put a column over its limit.
          const examples = cards.filter((i) => i.is_sample).length;
          const over = col.wip_limit != null && n - examples > col.wip_limit;
          const totals = totalFields.map((f) => cards.reduce((sum, it) => sum + (moneyValue(it.fields[f.key]) ?? 0), 0));
          return (
            <section class="flex max-h-full min-w-64 max-w-80 flex-1 basis-0 flex-col rounded-card bg-panel" data-status-id={col.id} aria-label={col.label}>
              <header class="flex items-center gap-2 px-3 pt-3 pb-2">
                <h2 class="font-semibold">{col.label}</h2>
                <span class={"rounded-full px-2 text-label font-medium " + (over ? "bg-warn text-warn-ink" : "bg-surface text-ink-2")} title={over ? "Over its limit" : col.wip_limit != null ? `Limit ${col.wip_limit}` : undefined}>
                  {filtering ? `${cards.length} of ${n}` : `${n}${col.wip_limit != null ? ` / ${col.wip_limit}` : ""}`}
                </span>
                {col.is_done ? <span class="text-ink-3" role="img" aria-label="Cards here count as finished" title="Cards here count as finished"><Icon name="done" /></span> : null}
                {totals.some((t) => t) ? <span class="ml-auto text-label text-ink-2">{totals.map((t, i) => (totalFields.length > 1 ? `${totalFields[i].label} ` : "") + formatMoney(t)).join(" · ")}</span> : null}
              </header>
              <ol class="flex min-h-10 flex-col gap-2 overflow-y-auto px-2 pb-1" data-cards data-status-id={col.id}>
                {cards.map((it) => <Card item={it} columns={columns} refresh={refresh} nameOf={data.nameOf} />)}
                {cards.length === 0 && filtering ? <li class="px-1 py-2 text-label text-ink-3">Nothing matches here</li> : null}
              </ol>
              <details class="group/add px-2 pb-2" data-composer={col.id}>
                <summary class={"mt-1 w-full cursor-pointer list-none text-label group-open/add:hidden " + ghost}><Icon name="plus" />Add {vocab.one.toLowerCase()}</summary>
                <form method="post" action={`${base}/items`} hx-post={`${base}/items`} hx-target="#board" hx-swap="outerHTML" class="mt-1 flex flex-col gap-2 rounded-card border border-line bg-surface p-2 shadow-card">
                  <input type="hidden" name="status_id" value={col.id} />
                  <input type="hidden" name="return" value={refresh} />
                  <input name="title" required maxlength={200} placeholder={`New ${vocab.one.toLowerCase()} title`} class="w-full rounded-control px-1 py-1" aria-label={`New ${vocab.one.toLowerCase()} title`} />
                  <div class="flex items-center gap-2 text-label">
                    <button class={primary}>Add {vocab.one.toLowerCase()}</button>
                    <button type="button" class={ghost} onclick="this.closest('details').open = false">Cancel</button>
                  </div>
                </form>
              </details>
            </section>
          );
        })}
      </div>
    </div>
  );
}

export function filtersActive(f: Filters) {
  return !!(f.q || f.assignee || f.tag || f.due || f.mine || f.priority !== undefined);
}

const LIST_SORTS = [["due_on", "Due date"], ["priority", "Priority"], ["updated_at", "Last updated"], ["created_at", "Oldest first"], ["title", "Title"]];

// The toolbar over the board and the list: search and the filters (one GET
// form that submits on every change), the Board/List switch and the board's
// menu. On a phone the search shares the first row with the switch, and the
// filters scroll sideways under them.
export function FilterBar({ data, list = false, sort, group }: { data: BoardData; list?: boolean; sort?: string; group?: boolean }) {
  const { board, filters, people, nameOf, user, items } = data;
  const root = `/b/${board.key}`;
  const base = root + (list ? "/list" : "");
  const tagNames = new Set<string>(cfg.tags.map((t) => t.name));
  for (const it of items) for (const t of it.tags) tagNames.add(t);
  const target = list ? "#list" : "#board";
  const select = "shrink-0 " + control;
  const toggle = "flex shrink-0 cursor-pointer items-center gap-1.5 rounded-control border border-line-strong bg-surface px-2.5 py-1.5 shadow-card hover:bg-canvas has-[:checked]:border-accent has-[:checked]:bg-accent-soft has-[:checked]:text-accent has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent";
  const tab = (on: boolean) => "rounded-control px-3 py-1 font-medium no-underline " + (on ? "bg-surface text-ink shadow-card" : "text-ink-2 hover:text-ink");
  return (
    <div class="flex flex-wrap items-center gap-2 text-label">
      <form method="get" action={base} hx-get={base} hx-target={target} hx-swap="outerHTML" hx-push-url="true" hx-trigger="submit, change, search" class="contents">
        <label class="relative min-w-0 flex-1 sm:w-64 sm:flex-none">
          <span class="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-ink-3"><Icon name="search" /></span>
          <input type="search" name="q" value={filters.q ?? ""} placeholder={`Search ${vocab.many.toLowerCase()}`} class={"w-full pl-8 " + control} aria-label="Search" />
        </label>
        <div class="order-last -mx-4 flex w-[calc(100%+2rem)] min-w-0 items-center gap-2 overflow-x-auto px-4 pb-0.5 sm:order-none sm:mx-0 sm:w-auto sm:overflow-visible sm:px-0 sm:pb-0">
          <select name="assignee" class={select} aria-label="Assignee">
            <option value="">Anyone</option>
            {people.map((p) => <option value={p.email} selected={filters.assignee === p.email}>{nameOf(p.email)}</option>)}
          </select>
          <select name="tag" class={select} aria-label="Tag">
            <option value="">Any tag</option>
            {[...tagNames].sort().map((t) => <option value={t} selected={filters.tag === t}>{t}</option>)}
          </select>
          <select name="due" class={select} aria-label="Due">
            <option value="">Any date</option>
            <option value="overdue" selected={filters.due === "overdue"}>Overdue</option>
            <option value="today" selected={filters.due === "today"}>Due today</option>
            <option value="week" selected={filters.due === "week"}>Due this week</option>
            <option value="none" selected={filters.due === "none"}>No date</option>
          </select>
          {user ? <label class={toggle}><input type="checkbox" name="mine" value="1" checked={!!filters.mine} class="sr-only" />Mine</label> : null}
          {list ? (
            <>
              <select name="sort" class={select} aria-label="Sort">
                {LIST_SORTS.map(([k, label]) => <option value={k} selected={sort === k}>Sort: {label}</option>)}
              </select>
              <label class={toggle}><input type="checkbox" name="group" value="1" checked={!!group} class="sr-only" />Group by column</label>
            </>
          ) : null}
          {filtersActive(filters) ? <a href={base} class={"shrink-0 " + ghost}><Icon name="x" />Clear</a> : null}
          <noscript><button class={button}>Apply</button></noscript>
        </div>
      </form>
      <div class="flex items-center gap-1 sm:ml-auto">
        <nav aria-label="View" class="flex rounded-control bg-panel p-0.5">
          <a href={root} class={tab(!list)} aria-current={!list ? "page" : undefined}>Board</a>
          <a href={`${root}/list`} class={tab(list)} aria-current={list ? "page" : undefined}>List</a>
        </nav>
        <BoardMenu board={board} />
      </div>
    </div>
  );
}

// What a board has besides its cards: its columns, its archive, its export.
export function BoardMenu({ board }: { board: Board }) {
  const root = `/b/${board.key}`;
  const link = "flex items-center gap-2 no-underline " + menuItem;
  return (
    <details class="relative">
      <summary class={"cursor-pointer list-none px-2 py-1.5 " + ghost} aria-label={`${board.name}: columns, archive, export`} title="Columns, archive, export"><Icon name="more" /></summary>
      <div class="absolute right-0 z-20 mt-1 flex w-52 flex-col rounded-card border border-line bg-surface p-1 shadow-lift">
        <a href={`${root}/columns`} class={link}><Icon name="columns" class="size-4 text-ink-3" />Board settings</a>
        <a href={`${root}/archive`} class={link}><Icon name="archive" class="size-4 text-ink-3" />Archive</a>
        <a href={`${root}/export.csv`} class={link}><Icon name="download" class="size-4 text-ink-3" />Export CSV</a>
      </div>
    </details>
  );
}

export function Card({ item, columns, refresh, nameOf }: { item: BoardItem; columns: Status[]; refresh: string; nameOf: NameOf }) {
  const due = dueState(item.due_on, item.completed_at);
  const done = item.checklist.filter((c) => c.done).length;
  const col = columns.find((c) => c.id === item.status_id)!;
  const others = columns.filter((c) => c.id !== item.status_id);
  const face = faceOf(item);
  return (
    <li class="group cursor-pointer rounded-card border border-line bg-surface p-3 shadow-card hover:border-line-strong" data-item-id={item.id} data-status-id={item.status_id} tabindex={0}>
      {item.cover_id ? <img src={`/files/${item.cover_id}?thumb=1`} alt="" loading="lazy" draggable={false} class="-mx-3 -mt-3 mb-3 block h-32 w-[calc(100%+1.5rem)] max-w-none rounded-t-card bg-panel object-cover" /> : null}
      <div class="flex items-start gap-1">
        <a href={`/items/${item.id}`} hx-get={`/items/${item.id}`} hx-target="#drawer" hx-swap="innerHTML" hx-push-url="true" class="grow font-medium no-underline">
          {item.title}
        </a>
        <details class="relative -mt-0.5 -mr-1.5 shrink-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 open:opacity-100 touch:opacity-100">
          <summary class="flex size-6 cursor-pointer list-none items-center justify-center rounded-control text-ink-3 hover:bg-panel hover:text-ink" aria-label={`Actions for ${item.title}`}><Icon name="more" /></summary>
          <div class="absolute right-0 z-20 mt-1 flex w-48 flex-col rounded-card border border-line bg-surface p-1 text-label shadow-lift">
            {others.map((c) => (
              <form method="post" action={`/items/${item.id}/move`} hx-post={`/items/${item.id}/move`} hx-target="#board" hx-swap="outerHTML">
                <input type="hidden" name="status_id" value={c.id} />
                <input type="hidden" name="return" value={refresh} />
                <button class={menuItem}>Move to {c.label}</button>
              </form>
            ))}
            <div class="my-1 border-t border-line"></div>
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
      {face.length ? <p class="mt-1 text-label text-ink-3">{face.join(" · ")}</p> : null}
      <div class="mt-3 flex flex-wrap items-center gap-1.5 text-label empty:hidden">
        {showsField("due_on") && item.due_on ? <DueBadge due={item.due_on} state={due} /> : null}
        {showsField("priority") ? <PriorityBadge priority={item.priority} /> : null}
        {showsField("tags") ? item.tags.map((t) => <TagBadge tag={t} />) : null}
        {showsField("checklist") && item.checklist.length ? <span class="inline-flex items-center gap-1 text-ink-3" title="Checklist"><Icon name="check" class="size-3.5" />{done}/{item.checklist.length}</span> : null}
        {item.file_count ? <span class="inline-flex items-center gap-1 text-ink-3" title="Photos and files"><Icon name="clip" class="size-3.5" />{item.file_count}</span> : null}
        {item.is_sample ? <span class={"bg-accent-soft text-accent " + badge}>example</span> : null}
        {showsField("assignee") && item.assignee ? <Avatar name={nameOf(item.assignee)} class="ml-auto" /> : null}
      </div>
    </li>
  );
}

export function Avatar({ name, class: cls = "" }: { name: string; class?: string }) {
  return <span class={"inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-panel text-label font-semibold text-ink-2 " + cls} title={name} role="img" aria-label={name}>{initials(name)}</span>;
}

export function TagBadge({ tag }: { tag: string }) {
  return <span class={`bg-${tagRole(tag)} text-ink ` + badge}>{tag}</span>;
}

// Priority is a flag and a word with no ground, so it never reads as a date:
// dates are the filled badges.
export function PriorityBadge({ priority }: { priority: number }) {
  if (!priority) return null;
  return <span class={"inline-flex items-center gap-1 font-medium " + (priority === 2 ? "text-late" : "text-ink-2")}><Icon name="flag" class="size-3.5" />{PRIORITIES[priority]}</span>;
}

export function DueBadge({ due, state }: { due: string; state: ReturnType<typeof dueState> }) {
  const tone = state === "overdue" ? "bg-late-soft text-late" : state === "today" || state === "soon" ? "bg-warn text-warn-ink" : "bg-canvas text-ink-2";
  const label = state === "overdue" ? `Overdue, ${formatDate(due)}` : state === "today" ? "Today" : formatDate(due);
  return <span class={tone + " " + badge} title={`Due ${due}`}><Icon name="calendar" class="size-3.5" />{label}</span>;
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
