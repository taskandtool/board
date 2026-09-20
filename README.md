# Board

A kanban board for the work a business actually runs: jobs, listings,
candidates, client projects, tickets. Three columns out of the box (To do,
Doing, Done), a card per item, drag between columns, a list view, and a
record of who did what. It works the minute it is installed and is shaped
for the business afterwards by talking to the app's AI: the words, the
columns, the fields on a card are one config file, one row or one migration
away, and the AI knows which.

This repository *is* the app. On Task & Tool it is cloned onto the app's
own machine, served from there, and everything in it is yours. It also
runs anywhere with Node 20 and a Postgres.

## What is in the box

- **Columns** you can add, rename, reorder and remove, with an optional
  limit on how many cards a column should hold at once (shown, never
  enforced) and a flag for the columns that count as finished.
- **Cards** with a title, notes, a due date, an assignee, a priority, tags,
  a checklist, comments, and custom fields declared in the config.
- **Drag** between and within columns, or move with the keyboard and the
  card menu. Every move can be undone from the toast.
- **Filter** by search, assignee, tag or due date, or just "mine".
- **A list view** of the same cards: sorted, grouped by column, exported
  as CSV. A CSV import for the spreadsheet you use today.
- **Several boards** in one app (jobs on one, candidates on another).
- **Due badges** (overdue, today, soon), an archive with archive-by-age,
  and an activity trail per card.
- **A quiet refresh** every 30 seconds where that is free (the edge, your
  own server); on a Task & Tool machine the board refreshes after your own
  edits only, so an open tab never keeps the machine awake.
- **The AI's hands**: `scripts/items.mjs` and `scripts/board.mjs` add,
  move, find and summarise cards from chat, so "add a job for the Smith
  roof, due Friday" is a sentence rather than a form.

## Shaping it

`board.config.json` holds the words (`Jobs`, `Candidates`), the boards and
columns seeded on the first run, the tag palette, which fields a card
shows, custom fields (`text`, `number`, `date`, `select`), the default
view, the archive age and the business's time zone (due dates are judged
there, not on the machine's clock). `examples/` has three worked configs: a
contractor, a real estate office, a recruiter. Ask the AI to shape the
board for your business and it reads them, asks what it cannot infer, and
sets the config; or edit it yourself and restart.

Columns are rows after the first run (the Edit columns page, or
`scripts/board.mjs`). A field that deserves a real column is a numbered,
additive SQL file in `migrations/`. Table names never change; what you
call things does.

## How it runs

- On Task & Tool: the platform clones this repository, runs
  `.taskandtool/setup.sh` (dependencies, CSS, the `web` service), grants
  the project's Postgres as `DATABASE_URL`, and the board migrates itself.
  Set the project to **Team only** in Project settings and the board has
  its address; the edge tells the board who is signed in, and that is the
  whole login. Without an identity the board is read only.
- Anywhere else: `npm install`, put `DATABASE_URL` (any Postgres) and
  `BOARD_USER=<your email>` in `.env`, then `npm run dev` and open
  `localhost:3000`. `npm run check` and `npm test` are the checks; the
  database tests run when `TEST_DATABASE_URL` is set.

## Layout

```
board.config.json        the levers: words, boards and columns, tags, fields, view, archive age
migrations/              the schema, numbered SQL, applied once each at start
src/app.tsx              the Hono app: identity, the read-only rule, the routes
src/db/                  client (pg, the late-database rule), migrate, seed, queries
src/views/               layout, board, list, item, columns and archive
scripts/                 items, board, import, export, migrate (--help), check, dev, vendor
styles/  static/         the tokens and the stylesheet; the built CSS, vendored htmx and SortableJS, board.js
examples/                contractor, realtor, recruiter configs
test/                    node:test
.claude/skills/board/    the skill the AI reads; .agents/skills/board/ is the Codex adapter
.taskandtool/setup.sh    what the machine needs; idempotent
```

## Stack

Hono with server-rendered JSX on Node, `pg` on Postgres with plain SQL,
Tailwind v4 as tokens, htmx for the round trips, SortableJS for drag. No
client framework, no ORM, no login of its own. MIT.
