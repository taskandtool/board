// The document around every page: head, header with the board switcher and
// the view toggle, who is signed in, the drawer and toast slots.
import type { Child } from "hono/jsx";
import { cfg } from "../config";
import type { Board } from "../db/queries";
import { control, primary } from "./ui";

export type Shell = { boards: Board[]; board?: Board | null; view: "board" | "list" | "columns" | "item" | "archive"; user: string | null };

export function Layout({ title, shell, children }: { title: string; shell: Shell; children?: Child }) {
  const { boards, board, view, user } = shell;
  const base = board ? `/b/${board.key}` : "/";
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{title}</title>
        <meta name="robots" content="noindex" />
        <link rel="stylesheet" href="/board.css" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <script src="/vendor/htmx.min.js" defer></script>
        <script src="/vendor/Sortable.min.js" defer></script>
        <script src="/board.js" defer></script>
      </head>
      <body class="min-h-screen bg-canvas text-ink font-body text-copy" hx-headers='{"X-Requested-With":"htmx"}'>
        <a href="#main" class="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-control focus:bg-accent focus:px-3 focus:py-1 focus:text-accent-ink">Skip to content</a>
        <header class="border-b border-line bg-surface">
          <div class="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2">
            <nav aria-label="Boards" class="flex flex-wrap items-center gap-1">
              {boards.map((b) => (
                <a href={`/b/${b.key}`} class={"rounded-control px-2 py-1 no-underline " + (board?.id === b.id ? "bg-panel font-semibold" : "text-ink-2 hover:bg-panel")} aria-current={board?.id === b.id ? "page" : undefined}>
                  {b.name}
                </a>
              ))}
              <details class="relative">
                <summary class="cursor-pointer list-none rounded-control px-2 py-1 text-ink-3 hover:bg-panel" aria-label="New board">+</summary>
                <form method="post" action="/boards" class="absolute left-0 z-20 mt-1 flex w-64 gap-2 rounded-card border border-line bg-surface p-2 shadow-lift">
                  <input name="name" required maxlength={60} placeholder="New board name" class={"w-full " + control} aria-label="New board name" />
                  <button class={primary}>Add</button>
                </form>
              </details>
            </nav>
            <div class="ml-auto flex min-w-0 flex-wrap items-center gap-1 text-label">
              {board ? (
                <>
                  <a href={base} class={"rounded-control px-2 py-1 no-underline " + (view === "board" ? "bg-panel" : "text-ink-2 hover:bg-panel")}>Board</a>
                  <a href={`${base}/list`} class={"rounded-control px-2 py-1 no-underline " + (view === "list" ? "bg-panel" : "text-ink-2 hover:bg-panel")}>List</a>
                  <a href={`${base}/columns`} class={"rounded-control px-2 py-1 no-underline " + (view === "columns" ? "bg-panel" : "text-ink-2 hover:bg-panel")}>Edit columns</a>
                  <a href={`${base}/archive`} class={"rounded-control px-2 py-1 no-underline " + (view === "archive" ? "bg-panel" : "text-ink-2 hover:bg-panel")}>Archive</a>
                </>
              ) : null}
              {user ? <span class="ml-3 hidden max-w-40 truncate text-ink-3 sm:inline" title="Signed in through Task & Tool">{user}</span> : null}
            </div>
          </div>
        </header>
        <main id="main" class="px-4 py-3">{children}</main>
        <aside id="drawer" class="fixed inset-y-0 right-0 z-30 w-full max-w-xl overflow-y-auto border-l border-line bg-surface shadow-lift empty:hidden" aria-live="polite"></aside>
        <div id="toast" class="fixed bottom-4 left-1/2 z-40 -translate-x-1/2 empty:hidden" aria-live="polite"></div>
      </body>
    </html>
  );
}

export const vocab = cfg.vocabulary.item;
