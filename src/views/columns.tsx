// The column editor and the archive page. Columns are rows in `statuses`;
// this is the owner's way to change them without asking the AI.
import type { Board, Item, Status } from "../db/queries";
import { formatDay } from "./board";
import { vocab } from "./layout";
import { ago } from "./list";
import { button, control, ghost, primary } from "./ui";
import { Icon } from "./icons";
import type { Child } from "hono/jsx";

// A settings page's heading: back to the board, the title, what it is for.
function PageHead({ board, title, children }: { board: Board; title: string; children?: Child }) {
  return (
    <div>
      <a href={`/b/${board.key}`} class={"-ml-2 text-label " + ghost}><Icon name="back" />{board.name}</a>
      <h1 class="mt-2 text-title font-semibold">{title}</h1>
      {children ? <p class="mt-1 max-w-prose text-label text-ink-2">{children}</p> : null}
    </div>
  );
}

const card = "rounded-card border border-line bg-surface shadow-card";

export function ColumnsView({ board, columns, counts }: { board: Board; columns: Status[]; counts: Map<number, number> }) {
  const base = `/b/${board.key}`;
  // Every row saves when one of its fields changes; the page re-renders in
  // place and keeps the focus where it was (each field has an id). On a
  // phone a row is the label over its settings.
  const iconButton = "flex size-8 items-center justify-center rounded-control border border-line-strong bg-surface shadow-card hover:bg-canvas";
  return (
    <div id="columns" class="mx-auto flex max-w-3xl flex-col gap-6" hx-target="#columns" hx-select="#columns" hx-swap="outerHTML">
      <PageHead board={board} title="Board settings">
        Columns are the steps a {vocab.one.toLowerCase()} moves through. A limit is how many a column should hold at once: over it, the column says so and refuses nothing. Cards in a done column count as finished.
      </PageHead>

      {/* A plain post: the new name is in the header's board tabs too. */}
      <form method="post" action={`${base}/rename`} onchange="this.requestSubmit()" class={card + " flex flex-col gap-1.5 p-4 text-label sm:flex-row sm:items-center sm:gap-4"}>
        <label for="board-name" class="font-medium sm:w-32">Board name</label>
        <input id="board-name" name="name" value={board.name} required maxlength={60} class={"w-full sm:max-w-xs " + control} />
        <noscript><button class={button}>Rename board</button></noscript>
      </form>

      <div class={card + " text-label"}>
        <div class="hidden grid-cols-[minmax(0,1fr)_4rem_5.5rem_3.5rem_10rem] items-center gap-x-3 rounded-t-card border-b border-line bg-canvas px-4 py-2.5 font-semibold text-ink-2 sm:grid">
          <span>Column</span><span>{vocab.many}</span><span>Limit</span><span>Done</span><span></span>
        </div>
        <ul class="divide-y divide-line">
          {columns.map((c, i) => {
            const held = counts.get(c.id) ?? 0;
            return (
              <li>
                <form method="post" action={`/columns/${c.id}`} hx-post={`/columns/${c.id}`} hx-trigger="change, submit" hx-sync="this:queue last" class="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:grid sm:grid-cols-[minmax(0,1fr)_4rem_5.5rem_3.5rem_10rem]">
                  <input id={`col-${c.id}-label`} name="label" value={c.label} required maxlength={40} class={"w-full " + control} aria-label="Column name" />
                  <span class="text-ink-2"><span class="sm:hidden">{vocab.many}: </span>{held}</span>
                  <input id={`col-${c.id}-limit`} type="number" name="wip_limit" value={c.wip_limit ?? ""} min={1} max={999} placeholder="None" class={"w-20 sm:w-full " + control} aria-label="Limit" />
                  <label class="flex items-center gap-1.5"><input id={`col-${c.id}-done`} type="checkbox" name="is_done" value="1" checked={c.is_done} aria-label="Counts as done" /><span class="sm:hidden">Done</span></label>
                  <span class="ml-auto flex items-center justify-end gap-1">
                    <noscript><button class={button}>Save</button></noscript>
                    <button formaction={`/columns/${c.id}/move`} name="direction" value="left" class={iconButton} disabled={i === 0} aria-label={`Move ${c.label} earlier`} title="Move earlier"><Icon name="back" /></button>
                    <button formaction={`/columns/${c.id}/move`} name="direction" value="right" class={iconButton} disabled={i === columns.length - 1} aria-label={`Move ${c.label} later`} title="Move later"><Icon name="back" class="size-4 rotate-180" /></button>
                    <button formaction={`/columns/${c.id}/archive`} class={"ml-1 " + ghost + " disabled:cursor-not-allowed disabled:hover:bg-transparent"} disabled={held > 0 || columns.length <= 1} title={held > 0 ? "Move its cards first" : `Remove ${c.label}`}>Remove</button>
                  </span>
                </form>
              </li>
            );
          })}
        </ul>
        <form method="post" action={`${base}/columns`} hx-post={`${base}/columns`} class="flex flex-wrap items-end gap-3 rounded-b-card border-t border-line bg-canvas px-4 py-3">
          <label class="flex min-w-40 flex-1 flex-col gap-1.5"><span class="font-medium">New column</span><input id="new-column" name="label" required maxlength={40} placeholder="Like Waiting on parts" class={control} /></label>
          <label class="flex w-24 flex-col gap-1.5"><span class="font-medium">Limit</span><input type="number" name="wip_limit" min={1} max={999} placeholder="None" class={control} /></label>
          <label class="flex items-center gap-1.5 pb-2"><input type="checkbox" name="is_done" value="1" /> Done</label>
          <button class={primary}><Icon name="plus" />Add column</button>
        </form>
      </div>
    </div>
  );
}

export function ArchiveView({ board, items, columns, archiveAfter }: { board: Board; items: Item[]; columns: Status[]; archiveAfter: number }) {
  const base = `/b/${board.key}`;
  return (
    <div class="mx-auto flex max-w-3xl flex-col gap-6">
      <PageHead board={board} title="Archive">Archived {vocab.many.toLowerCase()} leave the board and wait here. Restore one and it goes back to its column.</PageHead>
      <form method="post" action={`${base}/archive-done`} class={card + " flex flex-wrap items-center gap-2 p-4 text-label"}>
        <span>Archive finished {vocab.many.toLowerCase()} older than</span>
        <input type="number" name="days" value={archiveAfter} min={0} max={3650} class={"w-20 " + control} aria-label="Days" />
        <span>days</span>
        <button class={"sm:ml-auto " + button}><Icon name="archive" />Archive them</button>
      </form>
      <div class={card}>
        {items.length === 0 ? (
          <p class="px-4 py-10 text-center text-ink-3">Nothing archived yet</p>
        ) : (
          <ul class="divide-y divide-line">
            {items.map((it) => (
              <li class="flex items-center gap-3 px-4 py-3">
                <div class="min-w-0 flex-1">
                  <a href={`/items/${it.id}`} class="font-medium no-underline hover:underline">{it.title}</a>
                  <p class="mt-0.5 text-label text-ink-3">{columns.find((c) => c.id === it.status_id)?.label} · archived {ago(it.archived_at!)}{it.completed_at ? ` · finished ${formatDay(it.completed_at)}` : ""}</p>
                </div>
                <form method="post" action={`/items/${it.id}/restore`}><input type="hidden" name="return" value={`${base}/archive`} /><button class={"text-label " + button}>Restore</button></form>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function WaitingView({ state, error }: { state: string; error: string }) {
  return (
    <html lang="en">
      <head><meta charset="utf-8" /><meta http-equiv="refresh" content="5" /><title>Board</title><link rel="stylesheet" href="/board.css" /></head>
      <body class="min-h-screen bg-canvas p-8 text-ink font-body text-copy">
        <h1 class="text-title font-semibold">The board is waiting for its database</h1>
        <p class="mt-2 max-w-xl text-ink-2">
          {state === "no-url"
            ? "DATABASE_URL is not set yet. On Task & Tool the project's Postgres is being set up and this page refreshes on its own; off Task & Tool, put a Postgres connection string in .env (see .env.example)."
            : state === "error"
              ? `The database did not answer yet: ${error}. Retrying.`
              : "Connecting and applying migrations."}
        </p>
      </body>
    </html>
  );
}
