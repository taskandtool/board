// A card, open: every field editable, the checklist, comments and the
// activity trail. Rendered into the drawer beside the board (an htmx
// request) or as its own page at /items/:id (the deep link).
import { cfg, showsField } from "../config";
import type { Activity, Board, Item, Person, Status } from "../db/queries";
import { PRIORITIES } from "../db/queries";
import { formatDate } from "./board";
import { vocab } from "./layout";
import { ago } from "./list";

export type ItemData = { item: Item; board: Board; columns: Status[]; activity: Activity[]; people: Person[]; user: string | null; drawer: boolean };

export function ItemView({ data }: { data: ItemData }) {
  const { item, board, columns, activity, people, user, drawer } = data;
  const url = `/items/${item.id}`;
  const target = "#item";
  const col = columns.find((c) => c.id === item.status_id);
  const assignees = [...people.map((p) => p.email)];
  if (item.assignee && !assignees.includes(item.assignee)) assignees.push(item.assignee);
  if (user && !assignees.includes(user)) assignees.push(user);
  const ro = !user;
  return (
    <div id="item" class={drawer ? "p-4" : "mx-auto max-w-3xl"}>
      <div class="flex items-start gap-2">
        {drawer ? (
          <button type="button" class="rounded-control px-2 py-1 text-ink-3 hover:bg-panel" aria-label="Close" onclick="window.boardCloseDrawer()">←</button>
        ) : (
          <a href={`/b/${board.key}`} class="rounded-control px-2 py-1 text-ink-3 no-underline hover:bg-panel">← {board.name}</a>
        )}
        <span class="ml-auto text-label text-ink-3">#{item.id}{item.is_sample ? " · example" : ""}{item.archived_at ? " · archived" : ""}</span>
        {!drawer ? null : <a href={url} class="text-label text-ink-3" title="Open as its own page">↗</a>}
      </div>

      <form hx-post={url} hx-target={target} hx-swap="outerHTML" class="mt-2 flex flex-col gap-3">
        <input name="title" value={item.title} required maxlength={200} disabled={ro} class="w-full rounded-control border border-transparent bg-transparent px-1 py-1 text-title font-semibold hover:border-line focus:border-line-strong focus:bg-surface" aria-label="Title" />

        <div class="grid grid-cols-2 gap-x-4 gap-y-2 text-label sm:grid-cols-3">
          <label class="flex flex-col gap-1">
            <span class="text-ink-3">Column</span>
            <select name="status_id" disabled={ro} onchange="this.form.requestSubmit()" class="rounded-control border border-line-strong bg-surface px-2 py-1">
              {columns.map((c) => <option value={c.id} selected={c.id === item.status_id}>{c.label}</option>)}
            </select>
          </label>
          {showsField("assignee") ? (
            <label class="flex flex-col gap-1">
              <span class="text-ink-3">Assignee</span>
              <select name="assignee" disabled={ro} onchange="this.form.requestSubmit()" class="rounded-control border border-line-strong bg-surface px-2 py-1">
                <option value="">Unassigned</option>
                {assignees.map((e) => <option value={e} selected={item.assignee === e}>{people.find((p) => p.email === e)?.name || e}</option>)}
              </select>
            </label>
          ) : null}
          {showsField("due_on") ? (
            <label class="flex flex-col gap-1">
              <span class="text-ink-3">Due</span>
              <input type="date" name="due_on" value={item.due_on ?? ""} disabled={ro} onchange="this.form.requestSubmit()" class="rounded-control border border-line-strong bg-surface px-2 py-1" />
            </label>
          ) : null}
          {showsField("priority") ? (
            <label class="flex flex-col gap-1">
              <span class="text-ink-3">Priority</span>
              <select name="priority" disabled={ro} onchange="this.form.requestSubmit()" class="rounded-control border border-line-strong bg-surface px-2 py-1">
                {PRIORITIES.map((p, i) => <option value={i} selected={item.priority === i}>{p}</option>)}
              </select>
            </label>
          ) : null}
          {showsField("tags") ? (
            <label class="flex flex-col gap-1">
              <span class="text-ink-3">Tags, comma separated</span>
              <input name="tags" value={item.tags.join(", ")} disabled={ro} list="tag-names" class="rounded-control border border-line-strong bg-surface px-2 py-1" />
              <datalist id="tag-names">{cfg.tags.map((t) => <option value={t.name} />)}</datalist>
            </label>
          ) : null}
          {showsField("customer_ref") ? (
            <label class="flex flex-col gap-1">
              <span class="text-ink-3">Customer</span>
              <input name="customer_ref" value={item.customer_ref ?? ""} disabled={ro} maxlength={200} class="rounded-control border border-line-strong bg-surface px-2 py-1" />
            </label>
          ) : null}
          {cfg.card.custom.map((f) => (
            <label class="flex flex-col gap-1">
              <span class="text-ink-3">{f.label}</span>
              {f.type === "select" ? (
                <select name={`field_${f.key}`} disabled={ro} onchange="this.form.requestSubmit()" class="rounded-control border border-line-strong bg-surface px-2 py-1">
                  <option value=""></option>
                  {(f.options ?? []).map((o) => <option value={o} selected={item.fields[f.key] === o}>{o}</option>)}
                </select>
              ) : (
                <input type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"} name={`field_${f.key}`} value={item.fields[f.key] ?? ""} disabled={ro} maxlength={500} class="rounded-control border border-line-strong bg-surface px-2 py-1" />
              )}
            </label>
          ))}
        </div>

        <label class="flex flex-col gap-1 text-label">
          <span class="text-ink-3">Notes</span>
          <textarea name="notes" rows={5} disabled={ro} maxlength={20000} class="rounded-control border border-line-strong bg-surface px-2 py-1 text-copy">{item.notes}</textarea>
        </label>
        {!ro ? (
          <div class="flex items-center gap-2 text-label">
            <button class="rounded-control bg-accent px-3 py-1 text-accent-ink">Save</button>
            <span class="text-ink-3">{col?.label}{item.completed_at ? ` · finished ${formatDate(new Date(item.completed_at).toISOString().slice(0, 10))}` : ""}</span>
          </div>
        ) : null}
      </form>

      {showsField("checklist") ? <Checklist item={item} ro={ro} target={target} /> : null}

      <section class="mt-4">
        <h3 class="text-label font-semibold text-ink-3">Comments and activity</h3>
        {!ro ? (
          <form hx-post={`${url}/comment`} hx-target={target} hx-swap="outerHTML" class="mt-1 flex gap-2">
            <input name="body" required maxlength={5000} placeholder="Write a comment" class="w-full rounded-control border border-line-strong bg-surface px-2 py-1" aria-label="Comment" />
            <button class="rounded-control border border-line-strong px-3 py-1 text-label">Post</button>
          </form>
        ) : null}
        <ol class="mt-2 flex flex-col gap-1 text-label">
          {activity.map((a) => (
            <li class={a.kind === "comment" ? "rounded-card bg-panel px-2 py-1" : "px-2 text-ink-3"}>
              <span class="text-ink-2">{a.who ?? "board"}</span> {describe(a, columns)}
              <span class="text-ink-3" title={new Date(a.at).toISOString()}> · {ago(a.at)}</span>
            </li>
          ))}
        </ol>
      </section>

      {!ro ? (
        <div class="mt-4 flex gap-2 text-label">
          {item.archived_at ? (
            <form hx-post={`${url}/restore`} hx-target={target} hx-swap="outerHTML"><button class="rounded-control border border-line-strong px-3 py-1">Restore to {board.name}</button></form>
          ) : (
            <form hx-post={`${url}/archive`} hx-target={target} hx-swap="outerHTML"><button class="rounded-control border border-line-strong px-3 py-1 text-ink-2">Archive</button></form>
          )}
        </div>
      ) : null}
    </div>
  );
}

function Checklist({ item, ro, target }: { item: Item; ro: boolean; target: string }) {
  const url = `/items/${item.id}/checklist`;
  return (
    <section class="mt-4">
      <h3 class="text-label font-semibold text-ink-3">Checklist {item.checklist.length ? `${item.checklist.filter((c) => c.done).length}/${item.checklist.length}` : ""}</h3>
      <ol class="mt-1 flex flex-col gap-1 text-copy">
        {item.checklist.map((c, i) => (
          <li class="flex items-center gap-2">
            <form hx-post={url} hx-target={target} hx-swap="outerHTML" class="flex items-center gap-2">
              <input type="hidden" name="action" value="toggle" />
              <input type="hidden" name="index" value={i} />
              <input type="checkbox" checked={c.done} disabled={ro} onchange="this.form.requestSubmit()" aria-label={c.text} />
            </form>
            <span class={c.done ? "text-ink-3 line-through" : ""}>{c.text}</span>
            {!ro ? (
              <form hx-post={url} hx-target={target} hx-swap="outerHTML" class="ml-auto">
                <input type="hidden" name="action" value="remove" />
                <input type="hidden" name="index" value={i} />
                <button class="px-1 text-ink-3 hover:text-ink" aria-label={`Remove ${c.text}`}>×</button>
              </form>
            ) : null}
          </li>
        ))}
      </ol>
      {!ro ? (
        <form hx-post={url} hx-target={target} hx-swap="outerHTML" class="mt-1 flex gap-2 text-label">
          <input type="hidden" name="action" value="add" />
          <input name="text" required maxlength={300} placeholder="Add a step" class="w-full rounded-control border border-line-strong bg-surface px-2 py-1" aria-label="Checklist step" />
          <button class="rounded-control border border-line-strong px-3 py-1">Add</button>
        </form>
      ) : null}
    </section>
  );
}

export function describe(a: Activity, columns: Status[]): string {
  const label = (k: string | null) => columns.find((c) => c.key === k)?.label ?? k ?? "";
  switch (a.kind) {
    case "created": return `added this ${vocab.one.toLowerCase()} to ${label(a.to_status)}`;
    case "moved": return `moved it from ${label(a.from_status)} to ${label(a.to_status)}`;
    case "reordered": return `reordered it in ${label(a.to_status)}`;
    case "edited": return `changed ${a.body}`;
    case "comment": return `: ${a.body}`;
    case "archived": return "archived it";
    case "restored": return "restored it";
    default: return a.kind + (a.body ? ` ${a.body}` : "");
  }
}
