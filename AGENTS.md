# This app: a work board on Hono

A kanban board for the work this business runs: jobs, listings,
candidates, client projects, tickets. Columns per board, a card per item,
drag between columns, a list view, a record of who did what. This
repository *is* the app: the code at the root, the one skill that knows
how to work on it in `.claude/skills/board/`, and `.taskandtool/setup.sh`
for what the machine needs (dependencies, the `web` service). All of it is
the owner's to change.

The skill: `board` (the levers, the loop, the scripts). Read it before
changing the board rather than working from memory.

## Where things are

- `board.config.json` is the first lever: the words (`Jobs`, `Candidates`),
  the boards and columns seeded on first run, the tag palette, which
  fields a card shows, custom fields, the default view, the archive age.
  `examples/` holds three worked configs as prose to read, not a switch.
- `migrations/` is the schema as numbered SQL files, applied once each at
  service start. Additive only; never rename a table.
- `src/db/queries.ts` is every query the board runs, named. Routes,
  scripts and tests all go through it.
- `src/app.tsx` is the Hono app: identity, the read-only rule, the routes.
  `src/views/` are the pages and partials. `src/server.ts` is the machine
  entry; `src/db/client.ts` is the only file that knows it runs on Node.
- `scripts/items.mjs` and `scripts/board.mjs` are your hands on the data
  from chat; `scripts/import.mjs` and `export.mjs` move CSV in and out.
  Every one answers `--help`.
- `styles/theme.css` is the design as tokens; `DESIGN.md` explains them.
  `static/` is served as-is (the built CSS, the vendored htmx and
  SortableJS, `board.js`).
- `test/` runs with `npm test`; the database tests need
  `TEST_DATABASE_URL` and skip with a note without it.

## The loop

- `npm run dev` is what the `web` service runs: Tailwind rebuilds the CSS
  and the server restarts on every change, so an edit is live on refresh.
  If the service is not running, re-run `bash ~/app/.taskandtool/setup.sh`
  (idempotent) or register it as the `board` skill says.
- `npm run check` before showing work (config valid, migrations numbered,
  the refuse list, the typecheck). `npm test` for the tests.
- After a new migration: restart the service (`sprite-env services restart
  web`) or run `node scripts/migrate.mjs`.
- Commit at milestones. Never commit `node_modules/`, `static/vendor/`,
  `static/board.css`, or any credential.

## Rules

- Dataset names never change. The customer's words for things live in
  `board.config.json`; the tables stay `boards`, `statuses`, `items`,
  `activity`, `people`.
- Migrations are additive and idempotent. A new field is a new numbered
  file with `if not exists`; an old file is never edited.
- Identity comes from the platform. The edge sets `X-TaskTool-User` from a
  signed-in team member; the board builds no login, and with no identity it
  is read only. Never weaken that.
- Colours and sizes are tokens in `styles/theme.css`. Markup never carries
  a hex value or a Tailwind default colour; `npm run check` refuses both.
  No em dashes in interface copy.
- Real data only. The example cards are marked and removable; never invent
  items, people or history to make the board look busy.
- The board has no browser address until the owner sets the project to
  Team only in Task & Tool. Say where that switch is; do not work around it.
