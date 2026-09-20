// The list: the same items as a table, sorted and grouped, with a CSV export.
import { showsField, tagRole } from "../config";
import type { Item, Status } from "../db/queries";
import { dueState, PRIORITIES } from "../db/queries";
import { type BoardData, DueBadge, FilterBar, shortName } from "./board";
import { vocab } from "./layout";

export type Sort = "due_on" | "priority" | "updated_at" | "title" | "created_at";
const SORTS: { key: Sort; label: string }[] = [
  { key: "due_on", label: "Due" }, { key: "priority", label: "Priority" }, { key: "updated_at", label: "Updated" }, { key: "created_at", label: "Age" }, { key: "title", label: "Title" },
];

export function sortItems(items: Item[], sort: Sort): Item[] {
  const by: Record<Sort, (a: Item, b: Item) => number> = {
    due_on: (a, b) => (a.due_on ?? "9999").localeCompare(b.due_on ?? "9999"),
    priority: (a, b) => b.priority - a.priority,
    updated_at: (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
    created_at: (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    title: (a, b) => a.title.localeCompare(b.title),
  };
  return [...items].sort(by[sort]);
}

export function ListView({ data, sort, group }: { data: BoardData; sort: Sort; group: boolean }) {
  const { board, columns, items, filters } = data;
  const base = `/b/${board.key}/list`;
  const qs = (extra: Record<string, string>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...filters, sort, group: group ? "1" : "", ...extra })) if (v) p.set(k, String(v));
    return `${base}?${p}`;
  };
  const sorted = sortItems(items, sort);
  const groups = group ? columns.map((c) => ({ label: c.label, items: sorted.filter((i) => i.status_id === c.id) })).filter((g) => g.items.length) : [{ label: "", items: sorted }];
  return (
    <div id="list">
      <div class="flex flex-wrap items-center gap-3">
        <FilterBar data={{ ...data, filters: { ...filters, ...({ sort } as object) } }} list />
        <span class="text-label text-ink-3">Sort</span>
        {SORTS.map((s) => (
          <a href={qs({ sort: s.key })} class={"text-label no-underline " + (sort === s.key ? "font-semibold" : "text-ink-2")}>{s.label}</a>
        ))}
        <a href={qs({ group: group ? "" : "1" })} class={"text-label no-underline " + (group ? "font-semibold" : "text-ink-2")}>Group by column</a>
        <a href={`/b/${board.key}/export.csv`} class="ml-auto text-label text-ink-2">Export CSV</a>
      </div>
      <table class="mt-3 w-full border-collapse text-copy">
        <thead>
          <tr class="border-b border-line-strong text-left text-label text-ink-3">
            <th class="py-1 pr-3">{vocab.one}</th>
            <th class="py-1 pr-3">Column</th>
            {showsField("assignee") ? <th class="py-1 pr-3">Assignee</th> : null}
            {showsField("due_on") ? <th class="py-1 pr-3">Due</th> : null}
            {showsField("priority") ? <th class="py-1 pr-3">Priority</th> : null}
            {showsField("tags") ? <th class="py-1 pr-3">Tags</th> : null}
            <th class="py-1">Updated</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <>
              {g.label ? <tr><th colspan={7} class="bg-panel px-2 py-1 text-left text-label">{g.label} <span class="text-ink-3">{g.items.length}</span></th></tr> : null}
              {g.items.map((it) => <Row item={it} columns={columns} />)}
            </>
          ))}
          {items.length === 0 ? <tr><td colspan={7} class="py-6 text-center text-ink-3">Nothing here yet</td></tr> : null}
        </tbody>
      </table>
    </div>
  );
}

function Row({ item, columns }: { item: Item; columns: Status[] }) {
  const col = columns.find((c) => c.id === item.status_id);
  return (
    <tr class="border-b border-line align-top hover:bg-surface">
      <td class="py-1 pr-3"><a href={`/items/${item.id}`} hx-get={`/items/${item.id}`} hx-target="#drawer" hx-swap="innerHTML" hx-push-url="true" class="no-underline hover:underline">{item.title}</a></td>
      <td class="py-1 pr-3 text-ink-2">{col?.label}</td>
      {showsField("assignee") ? <td class="py-1 pr-3 text-ink-2" title={item.assignee ?? ""}>{item.assignee ? shortName(item.assignee) : ""}</td> : null}
      {showsField("due_on") ? <td class="py-1 pr-3">{item.due_on ? <DueBadge due={item.due_on} state={dueState(item.due_on, item.completed_at)} /> : null}</td> : null}
      {showsField("priority") ? <td class="py-1 pr-3 text-ink-2">{item.priority ? PRIORITIES[item.priority] : ""}</td> : null}
      {showsField("tags") ? <td class="py-1 pr-3"><span class="flex flex-wrap gap-1 text-label">{item.tags.map((t) => <span class={`rounded-control px-1 bg-${tagRole(t)}`}>{t}</span>)}</span></td> : null}
      <td class="py-1 text-label text-ink-3" title={new Date(item.updated_at).toISOString()}>{ago(item.updated_at)}</td>
    </tr>
  );
}

export function ago(d: Date | string): string {
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  const days = Math.floor(s / 86400);
  return days === 1 ? "yesterday" : `${days} days ago`;
}
