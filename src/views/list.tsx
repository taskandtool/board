// The list: the same items as a table, sorted and grouped, with a CSV export.
import { faceFields, faceOf, showsField, showValue } from "../config";
import type { Item, Status } from "../db/queries";
import { dueState } from "../db/queries";
import { type BoardData, DueBadge, FilterBar, PriorityBadge, TagBadge } from "./board";
import type { NameOf } from "./people";
import { words } from "./layout";

export type Sort = "due_on" | "priority" | "updated_at" | "title" | "created_at";

// On a phone the table is the title and the date; the rest rides under the
// title. These columns show from the sm breakpoint up.
const wide = "hidden sm:table-cell";

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
  const { columns, items } = data;
  const sorted = sortItems(items, sort);
  const span = 3 + ["assignee", "due_on", "priority", "tags", "customer_ref"].filter(showsField).length + faceFields.length;
  const groups = group ? columns.map((c) => ({ label: c.label, items: sorted.filter((i) => i.status_id === c.id) })).filter((g) => g.items.length) : [{ label: "", items: sorted }];
  const th = "px-3 py-2.5 text-left font-semibold text-ink-2";
  return (
    <div id="list">
      <FilterBar data={data} list sort={sort} group={group} />
      <div class="mt-4 overflow-x-auto rounded-card border border-line bg-surface shadow-card">
        <table class="w-full border-collapse">
          <thead class="border-b border-line bg-canvas text-label">
            <tr>
              <th class={th + " pl-4"}>{words(data.board).one}</th>
              {showsField("customer_ref") ? <th class={wide + " " + th}>Customer</th> : null}
              {faceFields.map((f) => <th class={wide + " " + th + (f.type === "money" ? " text-right" : "")}>{f.label}</th>)}
              <th class={wide + " " + th}>Column</th>
              {showsField("assignee") ? <th class={wide + " " + th}>Assignee</th> : null}
              {showsField("due_on") ? <th class={th + " w-px pr-4 whitespace-nowrap sm:pr-3"}>Due</th> : null}
              {showsField("priority") ? <th class={wide + " " + th}>Priority</th> : null}
              {showsField("tags") ? <th class={wide + " " + th}>Tags</th> : null}
              <th class={wide + " " + th + " pr-4"}>Updated</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-line">
            {groups.map((g) => (
              <>
                {g.label ? <tr class="bg-canvas"><th colspan={span} class="px-4 py-2 text-left text-label font-semibold">{g.label} <span class="ml-1 font-medium text-ink-3">{g.items.length}</span></th></tr> : null}
                {g.items.map((it) => <Row item={it} columns={columns} nameOf={data.nameOf} />)}
              </>
            ))}
            {items.length === 0 ? <tr><td colspan={span} class="px-4 py-10 text-center text-ink-3">Nothing here yet</td></tr> : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// A whole row opens the card (board.js treats it as a card); on a phone it
// is the title, then what the card face shows, the column and who has it.
function Row({ item, columns, nameOf }: { item: Item; columns: Status[]; nameOf: NameOf }) {
  const col = columns.find((c) => c.id === item.status_id);
  const td = "px-3 py-3 align-top";
  const meta = [...faceOf(item), col?.label, showsField("assignee") && item.assignee ? nameOf(item.assignee) : ""].filter(Boolean).join(" · ");
  return (
    <tr class="cursor-pointer hover:bg-canvas" data-item-id={item.id}>
      <td class={td + " pl-4"}>
        <a href={`/items/${item.id}`} hx-get={`/items/${item.id}`} hx-target="#drawer" hx-swap="innerHTML" hx-push-url="true" class="font-medium no-underline sm:whitespace-nowrap">{item.title}</a>
        <div class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-label text-ink-3 sm:hidden">
          <span>{meta}</span>
          {showsField("priority") ? <PriorityBadge priority={item.priority} /> : null}
        </div>
      </td>
      {showsField("customer_ref") ? <td class={wide + " " + td + " text-label whitespace-nowrap text-ink-2"}>{item.customer_ref}</td> : null}
      {faceFields.map((f) => <td class={wide + " " + td + " text-label text-ink-2" + (f.type === "money" ? " text-right tabular-nums" : "")}>{showValue(f, item.fields[f.key])}</td>)}
      <td class={wide + " " + td + " text-label whitespace-nowrap text-ink-2"}>{col?.label}</td>
      {showsField("assignee") ? <td class={wide + " " + td + " text-label whitespace-nowrap text-ink-2"} title={item.assignee ?? ""}>{item.assignee ? nameOf(item.assignee) : ""}</td> : null}
      {showsField("due_on") ? <td class={td + " pr-4 text-label whitespace-nowrap sm:pr-3"}>{item.due_on ? <DueBadge due={item.due_on} state={dueState(item.due_on, item.completed_at)} /> : null}</td> : null}
      {showsField("priority") ? <td class={wide + " " + td + " text-label whitespace-nowrap"}><PriorityBadge priority={item.priority} /></td> : null}
      {showsField("tags") ? <td class={wide + " " + td}><span class="flex gap-1 text-label whitespace-nowrap">{item.tags.map((t) => <TagBadge tag={t} />)}</span></td> : null}
      <td class={wide + " " + td + " pr-4 text-label whitespace-nowrap text-ink-3"} title={new Date(item.updated_at).toISOString()}>{ago(item.updated_at)}</td>
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
