// The document around every page: head, header with the board switcher and
// who is signed in, the drawer and toast slots.
import type { Child } from "hono/jsx";
import { cfg } from "../config";
import type { Board } from "../db/queries";
import { Icon } from "./icons";
import { initials } from "./people";
import { control, ghost, primary } from "./ui";

// The stylesheet and scripts carry a version, so a browser fetches them again
// after a change instead of keeping an old copy: the build's time in
// production, the server's start in dev (which restarts on every change to
// src/ or styles/).
declare const __ASSET_VERSION__: string | undefined;
const VERSION = typeof __ASSET_VERSION__ === "string" ? __ASSET_VERSION__ : Date.now().toString(36);
export const asset = (path: string) => `${path}?v=${VERSION}`;

export type Shell = { boards: Board[]; board?: Board | null; view: "board" | "list" | "columns" | "item" | "archive"; user: string | null; userName: string };

export function Layout({ title, shell, children }: { title: string; shell: Shell; children?: Child }) {
  const { boards, board, view, user, userName } = shell;
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{title}</title>
        <meta name="robots" content="noindex" />
        <link rel="stylesheet" href={asset("/board.css")} />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <script src={asset("/vendor/htmx.min.js")} defer></script>
        <script src={asset("/vendor/Sortable.min.js")} defer></script>
        <script src={asset("/board.js")} defer></script>
      </head>
      <body class={"bg-canvas text-ink font-body text-copy " + (view === "board" ? "flex h-dvh flex-col" : "min-h-screen")} hx-headers='{"X-Requested-With":"htmx"}'>
        <a href="#main" class="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-control focus:bg-accent focus:px-3 focus:py-1 focus:text-accent-ink">Skip to content</a>
        <header class="border-b border-line bg-surface">
          <div class="flex h-14 items-center gap-3 px-4">
            <nav aria-label="Boards" class="-ml-1 flex min-w-0 items-center gap-1 overflow-x-auto">
              {boards.map((b) => (
                <a href={`/b/${b.key}`} class={"shrink-0 rounded-control px-3 py-1.5 font-medium no-underline " + (board?.id === b.id ? "bg-panel text-ink" : "text-ink-2 hover:bg-panel hover:text-ink")} aria-current={board?.id === b.id ? "page" : undefined}>
                  {b.name}
                </a>
              ))}
            </nav>
            <details class="relative shrink-0">
              <summary class={"cursor-pointer list-none " + ghost} aria-label="New board" title="New board"><Icon name="plus" /></summary>
              <form method="post" action="/boards" class="fixed inset-x-4 top-14 z-20 flex gap-2 rounded-card border border-line bg-surface p-3 text-label shadow-lift sm:absolute sm:inset-x-auto sm:top-auto sm:left-0 sm:mt-2 sm:w-72">
                <input name="name" required maxlength={60} placeholder="New board name" class={"w-full " + control} aria-label="New board name" />
                <button class={primary}>Add</button>
              </form>
            </details>
            {user ? (
              <details class="relative ml-auto shrink-0">
                <summary class="flex cursor-pointer list-none items-center gap-2 rounded-control py-1 pr-2 pl-1 text-label text-ink-2 hover:bg-panel" title={`Signed in through Task & Tool as ${user}`}>
                  <span class="inline-flex size-7 items-center justify-center rounded-full bg-panel font-semibold text-ink-2" aria-hidden="true">{initials(userName)}</span>
                  <span class="hidden max-w-40 truncate sm:inline">{userName}</span>
                </summary>
                <form method="post" action="/me" class="absolute right-0 z-20 mt-2 flex w-72 flex-col gap-3 rounded-card border border-line bg-surface p-4 text-label shadow-lift">
                  <label class="flex flex-col gap-1.5"><span class="font-medium text-ink">Your name on the board</span><input name="name" value={userName} maxlength={60} class={control} /></label>
                  <span class="truncate text-ink-3">{user}</span>
                  <button class={"self-start " + primary}>Save</button>
                </form>
              </details>
            ) : null}
          </div>
        </header>
        <main id="main" class={"px-4 py-4 " + (view === "board" ? "flex min-h-0 flex-1 flex-col" : "")}>{children}</main>
        <aside id="drawer" class="fixed inset-y-0 right-0 z-30 w-full max-w-xl overflow-y-auto border-l border-line bg-surface shadow-lift empty:hidden" aria-live="polite"></aside>
        <div id="toast" class="fixed bottom-4 left-1/2 z-40 -translate-x-1/2 empty:hidden" aria-live="polite"></div>
        <dialog id="viewer" class="m-auto bg-transparent p-0 backdrop:bg-night/85" onclick="this.close()" aria-label="Photo">
          <img class="block max-h-[92dvh] max-w-[92vw] rounded-card object-contain" alt="" />
        </dialog>
      </body>
    </html>
  );
}

// What one card is called on a board, and several: the board's own words,
// else the config's.
export const words = (board?: Board | null) => ({
  one: board?.item_one || cfg.vocabulary.item.one,
  many: board?.item_many || cfg.vocabulary.item.many,
});
