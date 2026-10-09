// The column editor and the archive page. Columns are rows in `statuses`;
// this is the owner's way to change them without asking the AI.
import type { Board, Item, Status } from "../db/queries";
import { formatDay } from "./board";
import { vocab } from "./layout";
import { ago } from "./list";
import { button, control, primary } from "./ui";

export function ColumnsView({ board, columns, counts }: { board: Board; columns: Status[]; counts: Map<number, number> }) {
  const base = `/b/${board.key}`;
  // Every row saves when one of its fields changes; the page re-renders in
  // place and keeps the focus where it was (each field has an id).
  const grid = "grid grid-cols-[minmax(7rem,1fr)_3rem_5rem_3rem_auto] items-center gap-x-3";
  return (
    <div id="columns" class="mx-auto max-w-3xl" hx-target="#columns" hx-select="#columns" hx-swap="outerHTML">
      <h1 class="text-title font-semibold">Columns on {board.name}</h1>
      <p class="mt-1 text-label text-ink-2">A limit is how many {vocab.many.toLowerCase()} a column should hold at once; over it, the column says so and refuses nothing. Cards in a done column count as finished.</p>
      {/* A plain post: the new name is in the header's board tabs too. */}
      <form method="post" action={`${base}/rename`} onchange="this.requestSubmit()" class="mt-3 flex gap-2 text-label">
        <label class="flex flex-col gap-1"><span class="text-ink-3">Board name</span><input id="board-name" name="name" value={board.name} required maxlength={60} class={control} /></label>
        <noscript><button class={"self-end " + button}>Rename board</button></noscript>
      </form>
      <div class="mt-4 overflow-x-auto">
        <div class={grid + " border-b border-line-strong py-1 text-label text-ink-3"}>
          <span>Label</span><span>Cards</span><span>Limit</span><span>Done</span><span></span>
        </div>
        {columns.map((c, i) => {
          const held = counts.get(c.id) ?? 0;
          return (
            <form method="post" action={`/columns/${c.id}`} hx-post={`/columns/${c.id}`} hx-trigger="change, submit" hx-sync="this:queue last" class={grid + " border-b border-line py-1"}>
              <input id={`col-${c.id}-label`} name="label" value={c.label} required maxlength={40} class={"w-full " + control} aria-label="Column label" />
              <span class="text-ink-2">{held}</span>
              <input id={`col-${c.id}-limit`} type="number" name="wip_limit" value={c.wip_limit ?? ""} min={1} max={999} class={"w-20 " + control} aria-label="Limit" />
              <input id={`col-${c.id}-done`} type="checkbox" name="is_done" value="1" checked={c.is_done} aria-label="Counts as done" />
              <span class="flex items-center gap-1 text-label">
                <noscript><button class={button}>Save</button></noscript>
                <button formaction={`/columns/${c.id}/move`} name="direction" value="left" class={button} disabled={i === 0} aria-label={`Move ${c.label} left`}>←</button>
                <button formaction={`/columns/${c.id}/move`} name="direction" value="right" class={button} disabled={i === columns.length - 1} aria-label={`Move ${c.label} right`}>→</button>
                <button formaction={`/columns/${c.id}/archive`} class="rounded-control px-2 py-1 text-ink-2 hover:bg-panel" disabled={held > 0 || columns.length <= 1} title={held > 0 ? "Move its cards first" : `Remove ${c.label}`}>Remove</button>
              </span>
            </form>
          );
        })}
      </div>
      <form method="post" action={`${base}/columns`} hx-post={`${base}/columns`} class="mt-4 flex flex-wrap items-end gap-2 text-label">
        <label class="flex flex-col gap-1"><span class="text-ink-3">New column</span><input id="new-column" name="label" required maxlength={40} placeholder="Label" class={control} /></label>
        <label class="flex flex-col gap-1"><span class="text-ink-3">Limit</span><input type="number" name="wip_limit" min={1} max={999} class={"w-20 " + control} /></label>
        <label class="flex items-center gap-1 pb-1"><input type="checkbox" name="is_done" value="1" /> Done</label>
        <button class={primary}>Add column</button>
      </form>
    </div>
  );
}

export function ArchiveView({ board, items, columns, archiveAfter }: { board: Board; items: Item[]; columns: Status[]; archiveAfter: number }) {
  const base = `/b/${board.key}`;
  return (
    <div class="mx-auto max-w-3xl">
      <h1 class="text-title font-semibold">Archived on {board.name}</h1>
      <form method="post" action={`${base}/archive-done`} class="mt-2 flex flex-wrap items-center gap-2 text-label">
        <span>Archive finished {vocab.many.toLowerCase()} older than</span>
        <input type="number" name="days" value={archiveAfter} min={0} max={3650} class={"w-20 " + control} aria-label="Days" />
        <span>days</span>
        <button class={button}>Archive them</button>
      </form>
      <ul class="mt-4 flex flex-col gap-1 text-copy">
        {items.map((it) => (
          <li class="flex items-center gap-2 border-b border-line py-1">
            <a href={`/items/${it.id}`} class="no-underline hover:underline">{it.title}</a>
            <span class="text-label text-ink-3">{columns.find((c) => c.id === it.status_id)?.label} · archived {ago(it.archived_at!)}{it.completed_at ? ` · finished ${formatDay(it.completed_at)}` : ""}</span>
            <form method="post" action={`/items/${it.id}/restore`} class="ml-auto"><input type="hidden" name="return" value={`${base}/archive`} /><button class="text-label underline">Restore</button></form>
          </li>
        ))}
        {items.length === 0 ? <li class="py-4 text-ink-3">Nothing archived yet</li> : null}
      </ul>
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
