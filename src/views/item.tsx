// A card, open: every field editable, the checklist, comments and the
// activity trail. Rendered into the drawer beside the board (an htmx
// request) or as its own page at /items/:id (the deep link).
import { cfg, formatMoney, showsField } from "../config";
import type { Activity, Board, Item, ItemFile, Person, Status } from "../db/queries";
import { dueState, formatSize, PHOTO_TYPES, PRIORITIES } from "../db/queries";
import type { Child } from "hono/jsx";
import { Avatar, formatDay } from "./board";
import { Icon } from "./icons";
import { words } from "./layout";
import type { NameOf } from "./people";
import { ago } from "./list";
import { badge, button, field, ghost, heading, primary } from "./ui";

// Numbers and money are text boxes with a number pad: a number input would
// show an imported "$8,900" or "1,250" as empty, and the next save of the
// form would wipe it.
const INPUT_TYPES = { text: "text", number: "text", money: "text", phone: "tel", date: "date", select: "text" } as const;
const moneySymbol = formatMoney(0).replace(/[\d\s.,]/g, "");

export type ItemData = { item: Item; board: Board; columns: Status[]; activity: Activity[]; people: Person[]; nameOf: NameOf; files: ItemFile[]; user: string | null; drawer: boolean };

export function ItemView({ data }: { data: ItemData }) {
  const { item, board, columns, activity, people, nameOf, files, user, drawer } = data;
  const url = `/items/${item.id}`;
  const vocab = words(board);
  const assignees = [...people.map((p) => p.email)];
  if (item.assignee && !assignees.includes(item.assignee)) assignees.push(item.assignee);
  if (user && !assignees.includes(user)) assignees.push(user);
  const details = showsField("customer_ref") || cfg.card.custom.length > 0;
  const iconButton = "inline-flex size-8 items-center justify-center rounded-control text-ink-3 no-underline hover:bg-panel hover:text-ink";
  return (
    <div id="item" class={drawer ? "min-h-full" : "mx-auto max-w-2xl overflow-hidden rounded-card border border-line bg-surface shadow-card"}>
      <div class="sticky top-0 z-10 flex h-14 items-center gap-1 border-b border-line bg-surface px-3 sm:px-4">
        {drawer ? null : (
          <a href={`/b/${board.key}`} class={"-ml-1 text-label " + ghost}><Icon name="back" />{board.name}</a>
        )}
        <span id="item-meta" class={"text-label text-ink-3 " + (drawer ? "pl-2" : "ml-auto pr-1")}>
          {drawer ? `${board.name} · ` : ""}#{item.id}{item.completed_at ? ` · finished ${formatDay(item.completed_at)}` : ""}{item.is_sample ? " · example" : ""}
        </span>
        <span class={"flex items-center " + (drawer ? "ml-auto" : "")}>
          {item.archived_at ? null : (
            <form method="post" action={`${url}/archive`} hx-post={`${url}/archive`} hx-target="#item" hx-swap="outerHTML">
              <button class={iconButton} title={`Archive this ${vocab.one.toLowerCase()}`} aria-label={`Archive this ${vocab.one.toLowerCase()}`}><Icon name="archive" /></button>
            </form>
          )}
          {drawer ? <a href={url} class={iconButton} title="Open as its own page" aria-label="Open as its own page"><Icon name="expand" /></a> : null}
          {drawer ? <button type="button" class={iconButton} aria-label="Close" title="Close" onclick="window.boardCloseDrawer()"><Icon name="x" class="size-5" /></button> : null}
        </span>
      </div>

      <div class="flex flex-col gap-8 px-4 pt-5 pb-8 sm:px-6">
        {item.archived_at ? (
          <form method="post" action={`${url}/restore`} hx-post={`${url}/restore`} hx-target="#item" hx-swap="outerHTML" class="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-card bg-panel px-3 py-2 text-label">
            <span>Archived {ago(item.archived_at)}.</span>
            <button class={"ml-auto " + button}>Restore to {board.name}</button>
          </form>
        ) : null}

        {/* Every field saves when it changes (a text field when you leave it).
            Nothing in the form is re-rendered under you: only the trail and
            the header take the answer. A field reads as text until it is
            pointed at, so the card reads as a card, not a form. */}
        <form method="post" action={url} hx-post={url} hx-trigger="change, submit" hx-sync="this:queue last" hx-swap="none" hx-select-oob="#activity,#item-meta" class="flex flex-col gap-5">
          <textarea name="title" required maxlength={200} rows={1} class="-mx-2 resize-none rounded-control border border-transparent bg-transparent px-2 py-1 text-title font-semibold field-sizing-content hover:border-line focus:border-line-strong" aria-label="Title" onkeydown="if (event.key === 'Enter') { event.preventDefault(); this.blur(); }">{item.title}</textarea>

          <dl class="flex flex-col gap-0.5 text-label">
            <Property label="Column">
              <select name="status_id" class={field} data-field>
                {columns.map((c) => <option value={c.id} selected={c.id === item.status_id}>{c.label}</option>)}
              </select>
            </Property>
            {showsField("assignee") ? (
              <Property label="Assignee">
                <select name="assignee" class={field + (item.assignee ? "" : " text-ink-3")} data-field>
                  <option value="">Nobody yet</option>
                  {assignees.map((e) => <option value={e} selected={item.assignee === e}>{nameOf(e)}</option>)}
                </select>
              </Property>
            ) : null}
            {showsField("due_on") ? (
              <Property label="Due">
                <input type="date" name="due_on" value={item.due_on ?? ""} class={field + (!item.due_on ? " text-ink-3" : dueState(item.due_on, item.completed_at) === "overdue" ? " text-late" : "")} />
              </Property>
            ) : null}
            {showsField("priority") ? (
              <Property label="Priority">
                <select name="priority" class={field + (item.priority === 2 ? " text-late" : "")} data-field>
                  {PRIORITIES.map((p, i) => <option value={i} selected={item.priority === i}>{p}</option>)}
                </select>
              </Property>
            ) : null}
            {showsField("tags") ? (
              <Property label="Tags" top>
                <div class="flex flex-wrap items-center gap-1.5 px-2 py-1">
                  {cfg.tags.map((t) => (
                    <label class={"cursor-pointer select-none border border-dashed border-line-strong text-ink-3 hover:text-ink has-[:checked]:border-transparent has-[:checked]:text-ink has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent " + `has-[:checked]:bg-${t.role} ` + badge}>
                      <input type="checkbox" name={`tag:${t.name}`} value="1" checked={item.tags.some((x) => x.toLowerCase() === t.name.toLowerCase())} class="sr-only" />{t.name}
                    </label>
                  ))}
                  <input name="tags" value={item.tags.filter((x) => !cfg.tags.some((t) => t.name.toLowerCase() === x.toLowerCase())).join(", ")} placeholder={cfg.tags.length ? "Other" : "Add tags, comma separated"} aria-label={cfg.tags.length ? "Other tags, comma separated" : "Tags, comma separated"} class="min-w-24 flex-1 rounded-control border border-transparent bg-transparent px-1.5 py-0.5 hover:border-line focus:border-line-strong focus:bg-surface" />
                </div>
              </Property>
            ) : null}
            {details ? <div class="my-2 border-t border-line"></div> : null}
            {showsField("customer_ref") ? (
              <Property label="Customer">
                <input name="customer_ref" value={item.customer_ref ?? ""} maxlength={200} placeholder="Add a customer" class={field} />
              </Property>
            ) : null}
            {cfg.card.custom.map((f) => {
              const v = item.fields[f.key] ?? "";
              return (
                <Property label={f.label}>
                  {f.type === "select" ? (
                    <select name={`field_${f.key}`} class={field + (v ? "" : " text-ink-3")} data-field>
                      <option value="">Not set</option>
                      {(f.options ?? []).map((o) => <option value={o} selected={v === o}>{o}</option>)}
                    </select>
                  ) : (
                    <span class="relative flex items-center">
                      {f.type === "money" ? <span class="pointer-events-none absolute left-2 text-ink-3">{moneySymbol}</span> : null}
                      <input type={INPUT_TYPES[f.type]} inputmode={f.type === "money" || f.type === "number" ? "decimal" : undefined} name={`field_${f.key}`} value={v} maxlength={500} placeholder={f.type === "money" ? "0" : `Add ${f.label.toLowerCase()}`} class={field + (f.type === "money" ? " pl-5" : "") + (f.type === "phone" && v ? " pr-16" : "")} />
                      {f.type === "phone" && v ? <a href={`tel:${v.replace(/[^\d+]/g, "")}`} class={"absolute right-1 py-0.5 " + ghost}><Icon name="phone" class="size-3.5" />Call</a> : null}
                    </span>
                  )}
                </Property>
              );
            })}
          </dl>

          <section class="flex flex-col gap-2">
            <h3 class={heading}><label for="item-notes">Notes</label></h3>
            <textarea id="item-notes" name="notes" maxlength={20000} placeholder="Anything the team should know" class="min-h-24 w-full rounded-control border border-line bg-surface px-3 py-2 text-copy field-sizing-content hover:border-line-strong focus:border-line-strong">{item.notes}</textarea>
          </section>
          <noscript><button class={"self-start text-label " + primary}>Save</button></noscript>
        </form>

        {showsField("checklist") ? <Checklist item={item} /> : null}

        <Files item={item} files={files} />

        <section class="flex flex-col gap-3">
          <h3 class={heading}>Activity</h3>
          <form method="post" action={`${url}/comment`} hx-post={`${url}/comment`} hx-target="#activity" hx-select="#activity" hx-swap="outerHTML" hx-on--after-request="if (event.detail.successful) this.reset()" class="flex items-start gap-3">
            {user ? <Avatar name={nameOf(user)} class="mt-1.5" /> : null}
            <div class="min-w-0 flex-1 rounded-card border border-line-strong bg-surface shadow-card focus-within:border-accent">
              <textarea name="body" required rows={2} maxlength={5000} placeholder="Write a comment" class="block w-full resize-none rounded-card bg-transparent px-3 py-2 field-sizing-content focus:outline-none" aria-label="Comment" aria-describedby="comment-hint"></textarea>
              <div class="flex items-center justify-end px-2 pb-2 text-label">
                <button class={primary}>Comment</button>
              </div>
            </div>
          </form>
          <p id="comment-hint" class="sr-only">Ctrl or Command and Enter posts it.</p>
          <ol id="activity" class="flex flex-col gap-4">
            {foldEdits(activity).map((a) => (
              a.kind === "comment" ? (
                <li class="flex gap-3">
                  <Avatar name={a.who ? nameOf(a.who) : "Someone"} class="mt-0.5" />
                  <div class="min-w-0 flex-1">
                    <p class="text-label"><span class="font-medium text-ink">{a.who ? nameOf(a.who) : "Someone"}</span> <span class="text-ink-3" title={new Date(a.at).toISOString()}>{ago(a.at)}</span></p>
                    <p class="mt-0.5 whitespace-pre-line text-ink-2">{a.body}</p>
                  </div>
                </li>
              ) : (
                <li class="flex items-center gap-3 text-label text-ink-3">
                  <span class="flex size-6 shrink-0 items-center justify-center" aria-hidden="true"><span class="size-1.5 rounded-full bg-line-strong"></span></span>
                  <span><span class="text-ink-2">{a.who ? nameOf(a.who) : "Someone"}</span> {describe(a, columns, vocab.one)} <span title={new Date(a.at).toISOString()}>· {ago(a.at)}</span></span>
                </li>
              )
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}

// One row of a card's details: the name on the left, the field on the right.
function Property({ label, top = false, children }: { label: string; top?: boolean; children?: Child }) {
  return (
    <div class={"grid grid-cols-[7rem_minmax(0,1fr)] gap-x-2 sm:grid-cols-[8.5rem_minmax(0,1fr)] " + (top ? "items-start" : "items-center")}>
      <dt class={"truncate text-ink-3" + (top ? " pt-2" : "")}>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

// A part of the drawer that re-renders only itself (and the trail) from the
// card's page, so a change in it never touches a field being typed in.
const part = (id: string) => ({ id, "hx-target": "this", "hx-select": `#${id}`, "hx-swap": "outerHTML", "hx-select-oob": "#activity" });

function Checklist({ item }: { item: Item }) {
  const url = `/items/${item.id}/checklist`;
  const total = item.checklist.length;
  const done = item.checklist.filter((c) => c.done).length;
  return (
    <section {...part("checklist")} class="flex flex-col gap-2">
      <div class="flex items-center gap-3">
        <h3 class={heading}>Checklist</h3>
        {total ? <span class="text-label text-ink-3">{done} of {total} done</span> : null}
      </div>
      {total ? (
        <div class="h-1.5 overflow-hidden rounded-full bg-panel" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} aria-label="Checklist progress">
          <div class="h-full rounded-full bg-accent" style={`width: ${Math.round((done / total) * 100)}%`}></div>
        </div>
      ) : null}
      <ol class="flex flex-col">
        {item.checklist.map((c, i) => (
          <li class="group/step -mx-2 flex items-center gap-3 rounded-control px-2 py-1.5 hover:bg-canvas">
            <form method="post" action={url} hx-post={url} hx-trigger="change" class="flex items-center">
              <input type="hidden" name="action" value="toggle" />
              <input type="hidden" name="index" value={i} />
              <input type="checkbox" checked={c.done} aria-label={c.text} />
              <noscript><button class="ml-2 text-label underline">{c.done ? "Undo" : "Done"}</button></noscript>
            </form>
            <span class={"min-w-0 flex-1 " + (c.done ? "text-ink-3 line-through" : "")}>{c.text}</span>
            <form method="post" action={url} hx-post={url} class="opacity-0 group-hover/step:opacity-100 group-focus-within/step:opacity-100 touch:opacity-100">
              <input type="hidden" name="action" value="remove" />
              <input type="hidden" name="index" value={i} />
              <button class="flex size-6 items-center justify-center rounded-control text-ink-3 hover:bg-panel hover:text-ink" aria-label={`Remove ${c.text}`}><Icon name="x" /></button>
            </form>
          </li>
        ))}
      </ol>
      <form method="post" action={url} hx-post={url} class="group/add -mx-2 flex items-center gap-2 text-label">
        <input type="hidden" name="action" value="add" />
        <label class="flex min-w-0 flex-1 items-center gap-3 rounded-control px-2 text-ink-3 focus-within:bg-canvas hover:bg-canvas has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent">
          <Icon name="plus" />
          <input id="checklist-step" name="text" required maxlength={300} placeholder="Add a step" class="min-w-0 flex-1 bg-transparent py-1.5 text-ink focus:outline-none" aria-label="Checklist step" />
        </label>
        <button class={"invisible group-focus-within/add:visible " + button}>Add</button>
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
const inWords = (list: string[]) => (list.length < 2 ? list.join("") : `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`);

// Photos show as a grid and open in the viewer; any other file is a tile
// that downloads. The upload takes a pick, a drop or a paste (board.js makes
// photos smaller first and adds each one's preview as a `thumb` part).
function Files({ item, files }: { item: Item; files: ItemFile[] }) {
  const url = `/items/${item.id}/files`;
  return (
    <section {...part("files")} class="flex flex-col gap-2">
      <div class="flex items-center gap-3">
        <h3 class={heading}>Photos and files</h3>
        {files.length ? <span class="text-label text-ink-3">{files.length}</span> : null}
      </div>
      {files.length ? (
        <ul class="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {files.map((f) => (
            <li class="group relative">
              {PHOTO_TYPES.includes(f.content_type) ? (
                <a href={`/files/${f.id}`} target="_blank" rel="noopener" data-photo={f.name} class="block">
                  <img src={`/files/${f.id}?thumb=1`} alt={f.name} loading="lazy" class="aspect-square w-full rounded-control border border-line bg-panel object-cover" />
                </a>
              ) : (
                <a href={`/files/${f.id}`} class="flex aspect-square flex-col justify-end gap-0.5 rounded-control border border-line bg-canvas p-2 text-label no-underline hover:border-line-strong">
                  <span class="line-clamp-3 break-all font-medium">{f.name}</span>
                  <span class="text-ink-3">{formatSize(f.size)}</span>
                </a>
              )}
              <form method="post" action={`/files/${f.id}/remove`} hx-post={`/files/${f.id}/remove`} hx-confirm={`Remove ${f.name} from this card?`} class="absolute top-1 right-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 touch:opacity-100">
                <button class="flex size-6 items-center justify-center rounded-control bg-surface text-ink-2 shadow-card hover:text-ink" aria-label={`Remove ${f.name}`}><Icon name="x" /></button>
              </form>
            </li>
          ))}
        </ul>
      ) : null}
      <form method="post" action={url} hx-post={url} hx-encoding="multipart/form-data" enctype="multipart/form-data" data-upload
        hx-on--response-error="this.querySelector('[role=alert]').textContent = event.detail.xhr.responseText"
        class="group text-label">
        <label class="flex cursor-pointer flex-col items-center gap-1 rounded-card border border-dashed border-line-strong px-4 py-5 text-center hover:bg-canvas has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent">
          <Icon name="upload" class="size-5 text-ink-3" />
          <span class="font-semibold text-accent group-[.htmx-request]:hidden">Add photos or files</span>
          <span class="hidden text-ink-2 group-[.htmx-request]:inline">Uploading…</span>
          <span class="text-ink-3 group-[.htmx-request]:hidden touch:hidden">or drop or paste them here</span>
          <input type="file" name="file" multiple class="sr-only" />
        </label>
        <input type="file" name="thumb" multiple hidden />
        <noscript><button class={"mt-2 " + primary}>Upload</button></noscript>
        <p role="alert" class="mt-2 text-late empty:hidden"></p>
      </form>
    </section>
  );
}

export function describe(a: Activity, columns: Status[], one: string): string {
  const label = (k: string | null) => columns.find((c) => c.key === k)?.label ?? k ?? "";
  switch (a.kind) {
    case "created": return `added this ${one.toLowerCase()} to ${label(a.to_status)}`;
    case "moved": return `moved it from ${label(a.from_status)} to ${label(a.to_status)}`;
    case "reordered": return `reordered it in ${label(a.to_status)}`;
    case "edited": return `changed ${inWords((a.body ?? "").split(", ").map((k) => CHANGED[k] ?? k))}`;
    case "comment": return `: ${a.body}`;
    case "attached": return `attached ${a.body}`;
    case "detached": return `removed ${a.body}`;
    case "archived": return "archived it";
    case "restored": return "restored it";
    default: return a.kind + (a.body ? ` ${a.body}` : "");
  }
}
