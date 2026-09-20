---
name: board
description: "Run and reshape this work board: the levers (board.config.json, columns as rows, additive migrations), the dev loop on the machine, the scripts that add, move, find and summarise cards from chat, CSV import, and the rules. Use when the owner says 'shape this board', 'add a job', 'what needs attention', 'import my spreadsheet'."
---

# Board

This app is a kanban board on Hono: server-rendered JSX, htmx for the
round trips, SortableJS for drag, Postgres for the data, no client
framework. It serves from this machine as the `web` service. `AGENTS.md`
in the app root says where things are; this file is how to change it.

## The three levers

Everything a business wants changed is in one of these. Nothing else
needs touching to reshape the board.

1. **`board.config.json`**, read once at start.
   - `vocabulary.item` is what a card is called: `{ "one": "Job", "many": "Jobs" }`.
   - `boards[]` are the boards and their `columns[]` seeded on the first
     run: `{ key, label, wip_limit, is_done }`. Keys are slugs and never
     change; labels are free. Every board needs one `is_done` column.
     After the first run, boards and columns are rows (lever 2); this
     list only seeds a board that does not exist yet.
   - `tags[]` is the palette: `{ "name": "Roof", "role": "tag-1" }` with
     roles `tag-1` to `tag-6`. Cards can carry tags outside the palette;
     they take the neutral colour.
   - `card.fields` is which built-in fields a card shows, from `due_on`,
     `assignee`, `priority`, `tags`, `checklist`, `customer_ref`.
   - `card.custom[]` adds fields without a migration:
     `{ "key": "crew", "label": "Crew", "type": "select", "options": ["North", "South"] }`
     (types `text`, `number`, `date`, `select`). They live in
     `items.fields` as JSON and show on the card, in CSV, and in the
     scripts (`--field crew=North`).
   - `default_view` (`board` or `list`) and `archive_done_after_days`.
   - `time_zone`, an IANA name (`America/Chicago`, `Europe/London`). Due
     dates are dates, not instants, so "overdue" and "due today" are judged
     in this zone; it ships as `UTC`, and setting it is part of shaping the
     board. The machine's own clock never decides.
   - `business` is one line about the business. It ships as `to fill`;
     write the real line when you shape the board, which also retires the
     "Shape this board" suggestion.

   `examples/contractor.json`, `realtor.json` and `recruiter.json` are
   three worked configs. Read the closest one; do not copy it blind.
   Restart the service after a change (`sprite-env services restart web`)
   and run `npm run check`.

2. **Boards and columns are rows** in `boards` and `statuses`. The owner
   changes them in the column editor (`/b/<key>/columns`); you do the
   same with `node scripts/board.mjs`:

   ```bash
   node scripts/board.mjs list
   node scripts/board.mjs column add "Review" --limit 3
   node scripts/board.mjs column rename doing "In progress"
   node scripts/board.mjs column done invoiced yes
   node scripts/board.mjs add "Candidates"          # a second board
   ```

   A column that still holds cards cannot be removed; move them first.
   `wip_limit` is a soft limit: the column shows it is over, and refuses
   nothing.

3. **A migration**, for a field that deserves a real column (indexed,
   constrained, joined on). Write `migrations/000N_<words>.sql`, the next
   number with no gap, every statement safe to re-run:

   ```sql
   alter table items add column if not exists address text;
   create index if not exists items_address on items (address);
   ```

   Then `sprite-env services restart web` (or `node scripts/migrate.mjs`),
   add the column to `src/db/queries.ts` and the views, and run `npm run
   check` and `npm test`. Additive only; never rename or drop a table.

## The loop on this machine

```bash
sprite-env services get web                          # definition, status, restart_count
curl -s -o /dev/null -w '%{http_code}\n' localhost:3000/healthz   # 200 once the database is ready
tail -50 /.sprite/logs/services/web.log
```

If the service does not exist, register it once (`/serving` has the
mechanics):

```bash
sprite-env services create web \
  --cmd bash --args "-c,set -a; . /home/sprite/.env; set +a; exec npm run dev" \
  --dir /home/sprite/app --env "PORT=3000" --http-port 3000
```

The server comes up without a database and shows one page saying so; it
watches `/home/sprite/.env` for `DATABASE_URL` and migrates the moment it
appears. If `/healthz` stays 503, the project has no Postgres yet: the
owner adds it from the app's page, or you ask with
`request_capability("postgres", why)` from `tools/taskandtool.py`.

Before showing work: `npm run check` and `npm test`. Then look at it:
the board at `localhost:3000/b/<key>`, with `BOARD_USER=<email>` in the
environment only if you run a second server by hand off the service.

## Cost: no timer on the machine

An open board re-fetches itself after every edit made in its drawer, and
nothing else on this machine: a timer would hold the sprite awake for as
long as a tab is open. At the edge or on a server off Task & Tool the same
board also refreshes every 30 seconds, because there it costs nothing.
`BOARD_REFRESH_SECONDS` in the environment overrides either way (`0` is
off). Do not add polling, websockets or a "live" mode on the machine.

## The board's address

A project starts "Not published", so the board has no address until the
owner sets the project to **Team only** in Project settings. Say so when
they ask where the board is. Team only is what makes the edge inject the
signed-in member's email as `X-TaskTool-User`; that header is the board's
whole notion of a user (assignee, "mine", who did what). Never add a login.

## Your hands: the scripts

`node scripts/items.mjs --help` lists everything. The ones you reach for:

```bash
node scripts/items.mjs add "Smith roof repair" --due 2026-10-03 --assignee sam@example.com --priority 1 --tag Roof
node scripts/items.mjs list --status doing
node scripts/items.mjs move 42 done
node scripts/items.mjs note 42 "Customer confirmed the date"
node scripts/items.mjs attention            # overdue, urgent, stale, over-limit, with the reason
node scripts/items.mjs summary
node scripts/items.mjs find "roof"
node scripts/items.mjs archive-done --older 14
```

Add `--json` for structured output and `--as <email>` to record who
acted; the default actor is `AI`. `--status` takes a column key or its
label. Dates are `YYYY-MM-DD`.

**CSV import**: always dry-run first, show the owner the mapping, then run.

```bash
node scripts/import.mjs ~/app/uploads/jobs.csv --dry-run
node scripts/import.mjs ~/app/uploads/jobs.csv --map title=Task,due_on=Deadline --status todo
```

Headers are matched by name (title, status, assignee, due_on, priority,
tags, notes, customer_ref, and any custom field key); `--map` fixes a
miss. Unknown status values fall back to `--status` (default: the first
column). `node scripts/export.mjs > board.csv` is the reverse.

## Shaping the board for a business

When asked to shape it: read `board.config.json`, the closest example, and
whatever this project already knows about the business (a Company Brain's
notes, the owner's words). Ask only what you cannot infer. Then set the
vocabulary, columns, tags and fields in the config, write the `business`
line, restart the service, run `npm run check`, and show the board.
Existing cards keep their columns by key; a column you remove from the
config is not removed from the database (lever 2 does that, and only when
it is empty).

## Rules

- Dataset names never change; the config changes what people see.
- Migrations additive and idempotent, numbered without gaps.
- Identity from the header only; read only without it; every mutation a
  POST with the origin check that is already there.
- Tokens only in markup (`npm run check`), no em dashes in copy.
- Real data only: the example cards are marked and removable; never invent
  cards, people or history.
- The board's activity trail is the record; do not delete rows from
  `activity`.
