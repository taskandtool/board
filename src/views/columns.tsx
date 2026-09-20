// The column editor and the archive page. Columns are rows in `statuses`;
// this is the owner's way to change them without asking the AI.
import type { Board, Item, Status } from "../db/queries";
import { formatDate } from "./board";
import { vocab } from "./layout";
import { ago } from "./list";

export function ColumnsView({ board, columns, counts, user }: { board: Board; columns: Status[]; counts: Map<number, number>; user: string | null }) {
  const base = `/b/${board.key}`;
  const ro = !user;
  return (
    <div class="mx-auto max-w-3xl">
      <h1 class="text-title font-semibold">Columns on {board.name}</h1>
      <p class="mt-1 text-label text-ink-2">A limit is how many {vocab.many.toLowerCase()} a column should hold at once; over it, the column says so and refuses nothing. Cards in a done column count as finished.</p>
      <form method="post" action={`${base}/rename`} class="mt-3 flex gap-2 text-label">
        <input name="name" value={board.name} required maxlength={60} disabled={ro} class="rounded-control border border-line-strong bg-surface px-2 py-1" aria-label="Board name" />
        {!ro ? <button class="rounded-control border border-line-strong px-3 py-1">Rename board</button> : null}
      </form>
      <table class="mt-4 w-full border-collapse text-copy">
        <thead>
          <tr class="border-b border-line-strong text-left text-label text-ink-3">
            <th class="py-1 pr-3">Label</th><th class="py-1 pr-3">Key</th><th class="py-1 pr-3">Cards</th><th class="py-1 pr-3">Limit</th><th class="py-1 pr-3">Done</th><th class="py-1"></th>
          </tr>
        </thead>
        <tbody>
          {columns.map((c, i) => (
            <tr class="border-b border-line align-middle">
              <form method="post" action={`/columns/${c.id}`} id={`col-${c.id}`}></form>
              <td class="py-1 pr-3"><input form={`col-${c.id}`} name="label" value={c.label} required maxlength={40} disabled={ro} class="w-full rounded-control border border-line-strong bg-surface px-2 py-1" aria-label="Column label" /></td>
              <td class="py-1 pr-3 text-label text-ink-3">{c.key}</td>
              <td class="py-1 pr-3 text-ink-2">{counts.get(c.id) ?? 0}</td>
              <td class="py-1 pr-3"><input form={`col-${c.id}`} type="number" name="wip_limit" value={c.wip_limit ?? ""} min={1} max={999} disabled={ro} class="w-20 rounded-control border border-line-strong bg-surface px-2 py-1" aria-label="Limit" /></td>
              <td class="py-1 pr-3"><input form={`col-${c.id}`} type="checkbox" name="is_done" value="1" checked={c.is_done} disabled={ro} aria-label="Counts as done" /></td>
              <td class="py-1">
                {!ro ? (
                  <div class="flex items-center gap-1 text-label">
                    <button form={`col-${c.id}`} class="rounded-control bg-accent px-2 py-1 text-accent-ink">Save</button>
                    <form method="post" action={`/columns/${c.id}/move`}><input type="hidden" name="direction" value="left" /><button class="rounded-control border border-line-strong px-2 py-1" disabled={i === 0} aria-label="Move left">←</button></form>
                    <form method="post" action={`/columns/${c.id}/move`}><input type="hidden" name="direction" value="right" /><button class="rounded-control border border-line-strong px-2 py-1" disabled={i === columns.length - 1} aria-label="Move right">→</button></form>
                    <form method="post" action={`/columns/${c.id}/archive`}><button class="rounded-control px-2 py-1 text-ink-2 hover:bg-panel" disabled={(counts.get(c.id) ?? 0) > 0 || columns.length <= 1} title={(counts.get(c.id) ?? 0) > 0 ? "Move its cards first" : "Remove this column"}>Remove</button></form>
                  </div>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!ro ? (
        <form method="post" action={`${base}/columns`} class="mt-4 flex flex-wrap items-end gap-2 text-label">
          <label class="flex flex-col gap-1"><span class="text-ink-3">New column</span><input name="label" required maxlength={40} placeholder="Label" class="rounded-control border border-line-strong bg-surface px-2 py-1" /></label>
          <label class="flex flex-col gap-1"><span class="text-ink-3">Limit</span><input type="number" name="wip_limit" min={1} max={999} class="w-20 rounded-control border border-line-strong bg-surface px-2 py-1" /></label>
          <label class="flex items-center gap-1 pb-1"><input type="checkbox" name="is_done" value="1" /> Done</label>
          <button class="rounded-control bg-accent px-3 py-1 text-accent-ink">Add column</button>
        </form>
      ) : null}
    </div>
  );
}

export function ArchiveView({ board, items, columns, user, archiveAfter }: { board: Board; items: Item[]; columns: Status[]; user: string | null; archiveAfter: number }) {
  const base = `/b/${board.key}`;
  return (
    <div class="mx-auto max-w-3xl">
      <h1 class="text-title font-semibold">Archived on {board.name}</h1>
      {user ? (
        <form method="post" action={`${base}/archive-done`} class="mt-2 flex flex-wrap items-center gap-2 text-label">
          <span>Archive finished {vocab.many.toLowerCase()} older than</span>
          <input type="number" name="days" value={archiveAfter} min={0} max={3650} class="w-20 rounded-control border border-line-strong bg-surface px-2 py-1" aria-label="Days" />
          <span>days</span>
          <button class="rounded-control border border-line-strong px-3 py-1">Archive them</button>
        </form>
      ) : null}
      <ul class="mt-4 flex flex-col gap-1 text-copy">
        {items.map((it) => (
          <li class="flex items-center gap-2 border-b border-line py-1">
            <a href={`/items/${it.id}`} class="no-underline hover:underline">{it.title}</a>
            <span class="text-label text-ink-3">{columns.find((c) => c.id === it.status_id)?.label} · archived {ago(it.archived_at!)}{it.completed_at ? ` · finished ${formatDate(new Date(it.completed_at).toISOString().slice(0, 10))}` : ""}</span>
            {user ? <form method="post" action={`/items/${it.id}/restore`} class="ml-auto"><input type="hidden" name="return" value={`${base}/archive`} /><button class="text-label underline">Restore</button></form> : null}
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
