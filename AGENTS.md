# This app: a work board on Hono

A kanban board for the work this business runs: jobs, listings,
candidates, client projects, tickets. Columns per board, a card per item,
drag between columns, a list view, a record of who did what. It runs in
**dev** on this machine and in **production** on Cloudflare once
deployed. This repository *is* the app: the code at the root, the one skill that knows
how to work on it in `.claude/skills/board/`, and `.taskandtool/setup.sh`
for what the machine needs (dependencies, the `web` service). All of it is
the owner's to change.

The skill: `board` (the levers, the loop, the scripts) for "shape this
board", "add a job", "what needs attention", "import my spreadsheet",
"publish it". Read it before changing the board rather than working from
memory. The `data` skill holds the project database's rules; read it before
adding a table or a migration.

## Commands

Each takes `--help` (or `-h`); `items.mjs` and `board.mjs` also take
`--json`. A change prints `<script> <command>: <what happened, to which
card>`, then `Next:` with the command to look at it. An error says what was
wrong on stderr with a `Try:` line (exit 2 misused, 1 failed). With more
than one board, `add`, `archive-done`, `import` and `export` need
`--board`; without it, `list`, `find`, `attention` and `summary` cover
every board, and their `--json` is always `[{ "board": key, "result": ... }]`;
with `--board`, it is the result itself.

```bash
node scripts/items.mjs add "title" [--board key] ...  # "items add: #12 Smith roof on Work, in To do"
node scripts/items.mjs move <id> <column>             # "items move: #12 Smith roof, To do → Doing"
node scripts/items.mjs note <id> "text"               # a comment on the card
node scripts/items.mjs attention                       # what needs attention and why, every board
node scripts/items.mjs list [--status key] [--tag t]   # cards, grouped by board when there are several
node scripts/items.mjs find "words"                    # cards matching the words, same grouping
node scripts/items.mjs summary                         # counts per column, overdue, due this week
node scripts/items.mjs archive-done --older 14         # archives cards finished more than 14 days ago
node scripts/board.mjs list                            # boards and their columns, with keys
node scripts/import.mjs <file.csv> --dry-run           # the mapping, new and already-there counts, ten rows; nothing written
node scripts/import.mjs <file.csv>                     # "import: 9 new cards on Work, 3 already there, left alone"
node scripts/export.mjs [--board key]                  # the board as CSV on stdout
node scripts/migrate.mjs                               # "migrate: applied 1 migration" and its name, or "nothing to apply"
npm run check                                          # "check: ok", or exit 1 and each finding
```

## Where things are

- `board.config.json` is the first lever: the words (`Jobs`, `Candidates`),
  the boards and columns seeded on first run, the tag palette, which
  fields a card shows, custom fields, the default view, the archive age,
  the business's time zone.
  `examples/` holds three worked configs (JSON) to read, not a switch.
- `migrations/` is the schema as numbered SQL files, applied once each at
  service start.
- `src/db/queries.ts` is every query the board runs, named. Routes,
  scripts and tests all go through it.
- `src/app.tsx` is the Hono app: identity, the read-only rule, the routes.
  `src/views/` are the pages and partials. `src/server.ts` is dev's entry
  (Node, with `src/db/client.ts`); `src/worker.ts` is production's
  (Cloudflare). `src/runtime.ts` is all that differs between them; `npm run
  check` refuses a Node built-in in any file production runs.
- `styles/theme.css` is the design as tokens; `DESIGN.md` explains them.
  `static/` is served as-is (the built CSS, the vendored htmx and
  SortableJS, `board.js`).
- `test/` runs with `npm test`, which prints a dot per test and then the
  counts (tests, pass, fail, skipped) and any failure in full; the database
  tests need `TEST_DATABASE_URL` and skip without it.

## The loop

- `npm run dev` is what the `web` service runs: Tailwind rebuilds the CSS
  and the server restarts on every change (a new migration included, which
  it applies), so an edit is in dev on refresh.
  If the service is not running, re-run `bash ~/app/.taskandtool/setup.sh`
  (idempotent).
- `npm run check` before showing work (config valid, migrations numbered,
  the refuse list, the typecheck). `npm test` for the tests.
- `npm run deploy` publishes to production (migrate, build, deploy), after
  the board skill's "Before each deploy".
- Commit at milestones. Never commit `node_modules/`, `static/vendor/`,
  `static/board.css`, `dist/`, `build/`, or any credential.

## Rules

- The customer's words for things live in `board.config.json`; the tables
  stay `boards`, `statuses`, `items`, `activity`, `people`. A new field is
  a new numbered migration, never an edit to an old one; the rest of the
  table rules are the `data` skill's.
- Identity comes from the platform. Task & Tool sets `X-TaskTool-User` from
  a signed-in team member; the board builds no login, and with no identity it
  is read only. Never weaken that.
- Colours and sizes are tokens in `styles/theme.css`. Markup never carries
  a hex value or a Tailwind default colour; `npm run check` refuses both.
  No em dashes in interface copy.
- Real data only. The example cards are marked and removable; never invent
  items, people or history to make the board look busy.
- The first deploy opens production to the team; making it public is the
  owner's switch, and a board never needs it.
