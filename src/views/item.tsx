// A card, open: every field editable, the checklist, comments and the
// activity trail. Rendered into the drawer beside the board (an htmx
// request) or as its own page at /items/:id (the deep link).
import { cfg, showsField } from "../config";
import type { Activity, Board, Item, ItemFile, Person, Status } from "../db/queries";
import { formatSize, PHOTO_TYPES, PRIORITIES } from "../db/queries";
import { formatDay } from "./board";
import { vocab } from "./layout";
import type { NameOf } from "./people";
import { ago } from "./list";
import { button, control, primary } from "./ui";

export type ItemData = { item: Item; board: Board; columns: Status[]; activity: Activity[]; people: Person[]; nameOf: NameOf; files: ItemFile[]; user: string | null; drawer: boolean };

export function ItemView({ data }: { data: ItemData }) {
  const { item, board, columns, activity, people, nameOf, files, user, drawer } = data;
  const url = `/items/${item.id}`;
  const assignees = [...people.map((p) => p.email)];
  if (item.assignee && !assignees.includes(item.assignee)) assignees.push(item.assignee);
  if (user && !assignees.includes(user)) assignees.push(user);
  return (
    <div id="item" class={drawer ? "p-4" : "mx-auto max-w-3xl"}>
      <div class="flex items-center gap-2">
        {drawer ? (
          <button type="button" class="-ml-2 rounded-control px-2 py-1 text-ink-3 hover:bg-panel" aria-label="Close" onclick="window.boardCloseDrawer()">←</button>
        ) : (
          <a href={`/b/${board.key}`} class="-ml-2 rounded-control px-2 py-1 text-ink-3 no-underline hover:bg-panel">← {board.name}</a>
        )}
        <span id="item-meta" class="ml-auto text-label text-ink-3">#{item.id}{item.completed_at ? ` · finished ${formatDay(item.completed_at)}` : ""}{item.is_sample ? " · example" : ""}{item.archived_at ? " · archived" : ""}</span>
        {!drawer ? null : <a href={url} class="inline-flex min-h-6 min-w-6 items-center justify-center rounded-control text-label text-ink-3 no-underline hover:bg-panel" title="Open as its own page" aria-label="Open as its own page">↗</a>}
      </div>

      {/* The back link and the title pull out by their own padding, so their
          text lines up with the fields under them. */}
      {/* Every field saves when it changes (a text field when you leave it).
          Nothing in the form is re-rendered under you: only the trail and
          the header take the answer. */}
      <form method="post" action={url} hx-post={url} hx-trigger="change, submit" hx-sync="this:queue last" hx-swap="none" hx-select-oob="#activity,#item-meta" class="mt-2 flex flex-col gap-3">
        <input name="title" value={item.title} required maxlength={200} class="-mx-2 w-[calc(100%+1rem)] rounded-control bg-transparent px-2 py-1 text-title font-semibold hover:ring-1 hover:ring-line focus:bg-surface focus:ring-1 focus:ring-line-strong" aria-label="Title" />

        <div class="grid grid-cols-2 gap-x-4 gap-y-2 text-label sm:grid-cols-3">
          <label class="flex flex-col gap-1">
            <span class="text-ink-3">Column</span>
            <select name="status_id" class={control}>
              {columns.map((c) => <option value={c.id} selected={c.id === item.status_id}>{c.label}</option>)}
            </select>
          </label>
          {showsField("assignee") ? (
            <label class="flex flex-col gap-1">
              <span class="text-ink-3">Assignee</span>
              <select name="assignee" class={control}>
                <option value="">Unassigned</option>
                {assignees.map((e) => <option value={e} selected={item.assignee === e}>{nameOf(e)}</option>)}
              </select>
            </label>
          ) : null}
          {showsField("due_on") ? (
            <label class="flex flex-col gap-1">
              <span class="text-ink-3">Due</span>
              <input type="date" name="due_on" value={item.due_on ?? ""} class={control} />
            </label>
          ) : null}
          {showsField("priority") ? (
            <label class="flex flex-col gap-1">
              <span class="text-ink-3">Priority</span>
              <select name="priority" class={control}>
                {PRIORITIES.map((p, i) => <option value={i} selected={item.priority === i}>{p}</option>)}
              </select>
            </label>
          ) : null}
          {showsField("tags") ? (
            <label class="flex flex-col gap-1">
              <span class="text-ink-3">Tags, comma separated</span>
              <input name="tags" value={item.tags.join(", ")} list="tag-names" class={control} />
              <datalist id="tag-names">{cfg.tags.map((t) => <option value={t.name} />)}</datalist>
            </label>
          ) : null}
          {showsField("customer_ref") ? (
            <label class="flex flex-col gap-1">
              <span class="text-ink-3">Customer</span>
              <input name="customer_ref" value={item.customer_ref ?? ""} maxlength={200} class={control} />
            </label>
          ) : null}
          {cfg.card.custom.map((f) => (
            <label class="flex flex-col gap-1">
              <span class="text-ink-3">{f.label}</span>
              {f.type === "select" ? (
                <select name={`field_${f.key}`} class={control}>
                  <option value=""></option>
                  {(f.options ?? []).map((o) => <option value={o} selected={item.fields[f.key] === o}>{o}</option>)}
                </select>
              ) : (
                <input type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"} name={`field_${f.key}`} value={item.fields[f.key] ?? ""} maxlength={500} class={control} />
              )}
            </label>
          ))}
        </div>

        <label class="flex flex-col gap-1 text-label">
          <span class="text-ink-3">Notes</span>
          <textarea name="notes" rows={5} maxlength={20000} class={"text-copy " + control}>{item.notes}</textarea>
        </label>
        <noscript><button class={"self-start text-label " + primary}>Save</button></noscript>
      </form>

      {showsField("checklist") ? <Checklist item={item} /> : null}

      <Files item={item} files={files} />

      <section class="mt-4">
        <h3 class="text-label font-semibold text-ink-3">Comments and activity</h3>
        <form method="post" action={`${url}/comment`} hx-post={`${url}/comment`} hx-target="#activity" hx-select="#activity" hx-swap="outerHTML" hx-on--after-request="if (event.detail.successful) this.reset()" class="mt-1 flex items-start gap-2">
          <textarea name="body" required rows={2} maxlength={5000} placeholder="Write a comment" class={"w-full " + control} aria-label="Comment" aria-describedby="comment-hint"></textarea>
          <button class={"text-label " + button}>Post</button>
        </form>
        <p id="comment-hint" class="sr-only">Ctrl or Command and Enter posts it.</p>
        <ol id="activity" class="mt-2 flex flex-col gap-1 text-label">
          {foldEdits(activity).map((a) => (
            <li class={a.kind === "comment" ? "whitespace-pre-line rounded-card bg-panel px-2 py-1" : "px-2 text-ink-3"}>
              <span class="text-ink-2">{a.who ? nameOf(a.who) : "Someone"}</span>{a.kind === "comment" ? "" : " "}{describe(a, columns)}
              <span class="text-ink-3" title={new Date(a.at).toISOString()}> · {ago(a.at)}</span>
            </li>
          ))}
        </ol>
      </section>

      <div class="mt-4 flex gap-2 text-label">
        {item.archived_at ? (
          <form method="post" action={`${url}/restore`} hx-post={`${url}/restore`} hx-target="#item" hx-swap="outerHTML"><button class={button}>Restore to {board.name}</button></form>
        ) : (
          <form method="post" action={`${url}/archive`} hx-post={`${url}/archive`} hx-target="#item" hx-swap="outerHTML"><button class={"text-ink-2 " + button}>Archive</button></form>
        )}
      </div>
    </div>
  );
}

// A part of the drawer that re-renders only itself (and the trail) from the
// card's page, so a change in it never touches a field being typed in.
const part = (id: string) => ({ id, "hx-target": "this", "hx-select": `#${id}`, "hx-swap": "outerHTML", "hx-select-oob": "#activity" });

function Checklist({ item }: { item: Item }) {
  const url = `/items/${item.id}/checklist`;
  return (
    <section {...part("checklist")} class="mt-4">
      <h3 class="text-label font-semibold text-ink-3">Checklist {item.checklist.length ? `${item.checklist.filter((c) => c.done).length}/${item.checklist.length}` : ""}</h3>
      <ol class="mt-1 flex flex-col gap-1 text-copy">
        {item.checklist.map((c, i) => (
          <li class="flex items-center gap-2">
            <form method="post" action={url} hx-post={url} hx-trigger="change" class="flex items-center gap-2">
              <input type="hidden" name="action" value="toggle" />
              <input type="hidden" name="index" value={i} />
              <input type="checkbox" checked={c.done} aria-label={c.text} />
              <noscript><button class="text-label underline">{c.done ? "Undo" : "Done"}</button></noscript>
            </form>
            <span class={c.done ? "text-ink-3 line-through" : ""}>{c.text}</span>
            <form method="post" action={url} hx-post={url} class="ml-auto">
              <input type="hidden" name="action" value="remove" />
              <input type="hidden" name="index" value={i} />
              <button class="min-h-6 min-w-6 rounded-control px-1 text-ink-3 hover:bg-panel hover:text-ink" aria-label={`Remove ${c.text}`}>×</button>
            </form>
          </li>
        ))}
      </ol>
      <form method="post" action={url} hx-post={url} class="mt-1 flex gap-2 text-label">
        <input type="hidden" name="action" value="add" />
        <input id="checklist-step" name="text" required maxlength={300} placeholder="Add a step" class={"w-full " + control} aria-label="Checklist step" />
        <button class={button}>Add</button>
      </form>
    </section>
  );
}

// The trail as a person reads it: a run of edits by one person, each within
// ten minutes of the next, is one line naming everything they changed. The
// rows themselves stay as they were written. Newest first, as stored.
export function foldEdits(trail: Activity[]): Activity[] {
  const out: Activity[] = [];
  let earlier: Activity | null = null; // the row read just before this one
  for (const a of trail) {
    const prev = out[out.length - 1];
    if (prev && earlier && a.kind === "edited" && prev.kind === "edited" && prev.who === a.who && earlier.at.getTime() - a.at.getTime() < 600_000) {
      out[out.length - 1] = { ...prev, body: [...new Set([...(prev.body ?? "").split(", "), ...(a.body ?? "").split(", ")])].join(", ") };
    } else out.push(a);
    earlier = a;
  }
  return out;
}

// What an edit names, in the words a person uses for it.
const CHANGED: Record<string, string> = {
  title: "the title", notes: "the notes", assignee: "the assignee", due_on: "the due date", priority: "the priority",
  tags: "the tags", fields: "the details", customer_ref: "the customer", checklist: "the checklist",
};
const words = (list: string[]) => (list.length < 2 ? list.join("") : `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`);

// Photos show as a grid and open in the viewer; any other file is a tile
// that downloads. The upload takes a pick, a drop or a paste (board.js makes
// photos smaller first and adds each one's preview as a `thumb` part).
function Files({ item, files }: { item: Item; files: ItemFile[] }) {
  const url = `/items/${item.id}/files`;
  return (
    <section {...part("files")} class="mt-4">
      <h3 class="text-label font-semibold text-ink-3">Photos and files {files.length || ""}</h3>
      {files.length ? (
        <ul class="mt-1 grid grid-cols-3 gap-2">
          {files.map((f) => (
            <li class="group relative">
              {PHOTO_TYPES.includes(f.content_type) ? (
                <a href={`/files/${f.id}`} target="_blank" rel="noopener" data-photo={f.name} class="block">
                  <img src={`/files/${f.id}?thumb=1`} alt={f.name} loading="lazy" class="aspect-square w-full rounded-control border border-line bg-panel object-cover" />
                </a>
              ) : (
                <a href={`/files/${f.id}`} class="flex aspect-square flex-col justify-end gap-0.5 rounded-control border border-line bg-panel p-2 text-label no-underline hover:border-line-strong">
                  <span class="line-clamp-3 break-all">{f.name}</span>
                  <span class="text-ink-3">{formatSize(f.size)}</span>
                </a>
              )}
              <form method="post" action={`/files/${f.id}/remove`} hx-post={`/files/${f.id}/remove`} hx-confirm={`Remove ${f.name} from this card?`} class="absolute top-1 right-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 touch:opacity-100">
                <button class="min-h-6 min-w-6 rounded-control bg-surface px-1 text-ink-2 shadow-card hover:text-ink" aria-label={`Remove ${f.name}`}>×</button>
              </form>
            </li>
          ))}
        </ul>
      ) : null}
      <form method="post" action={url} hx-post={url} hx-encoding="multipart/form-data" enctype="multipart/form-data" data-upload
        hx-on--response-error="this.querySelector('[role=alert]').textContent = event.detail.xhr.responseText"
        class="group mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-label">
        <label class={"cursor-pointer has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent " + button}>
          Add photos or files
          <input type="file" name="file" multiple class="sr-only" />
        </label>
        <input type="file" name="thumb" multiple hidden />
        <span class="hidden text-ink-3 group-[.htmx-request]:inline">Uploading…</span>
        <span class="text-ink-3 group-[.htmx-request]:hidden touch:hidden">or drop or paste them here</span>
        <noscript><button class={primary}>Upload</button></noscript>
        <p role="alert" class="w-full text-late empty:hidden"></p>
      </form>
    </section>
  );
}

export function describe(a: Activity, columns: Status[]): string {
  const label = (k: string | null) => columns.find((c) => c.key === k)?.label ?? k ?? "";
  switch (a.kind) {
    case "created": return `added this ${vocab.one.toLowerCase()} to ${label(a.to_status)}`;
    case "moved": return `moved it from ${label(a.from_status)} to ${label(a.to_status)}`;
    case "reordered": return `reordered it in ${label(a.to_status)}`;
    case "edited": return `changed ${words((a.body ?? "").split(", ").map((k) => CHANGED[k] ?? k))}`;
    case "comment": return `: ${a.body}`;
    case "attached": return `attached ${a.body}`;
    case "detached": return `removed ${a.body}`;
    case "archived": return "archived it";
    case "restored": return "restored it";
    default: return a.kind + (a.body ? ` ${a.body}` : "");
  }
}
