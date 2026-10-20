---
name: board
description: "Shapes and runs this work board. Use for 'shape this board for my business', 'add a job', 'move it to done', 'what needs attention', 'import my spreadsheet', 'add a column', 'publish it', and any change to its config, columns, schema, dev server or production."
---

# Board

A kanban board on Hono (server-rendered JSX, htmx, SortableJS, Postgres).

## Rules

- Every change is a POST behind the origin check already there.
- The board's activity trail is the record; never delete rows from
  `activity`.
- No polling, websockets or timers in dev: an open tab would hold the
  machine awake. Production refreshes every 30 s; `BOARD_REFRESH_SECONDS`
  overrides (`0` off).

## The three levers

Everything a business wants changed is in one of these.

1. **`board.config.json`**: the words, the boards and columns seeded on
   first run, tags, card fields, custom fields, the view, the time zone,
   the `business` line. To shape the board or change a key, read
   [references/shaping.md](references/shaping.md) first.

2. **Boards and columns are rows** in `boards` and `statuses`. The owner
   changes them in Board settings (`/b/<key>/columns`); you do the
   same with `node scripts/board.mjs` (`--help` lists every command):

   ```bash
   node scripts/board.mjs column add "Review" --limit 3
   node scripts/board.mjs column rename doing "In progress"
   node scripts/board.mjs column done invoiced yes
   node scripts/board.mjs add "Candidates"          # a second board
   node scripts/board.mjs words candidates "Candidate"  # what a card on it is called
   ```

   A column is removed only once its cards are moved out.
   `wip_limit` is a soft limit: the column shows it is over, and refuses
   nothing.

3. **A migration**, for a field that deserves a real column (indexed,
   constrained, joined on), following the `data` skill's table rules.
   Write `migrations/000N_<words>.sql` with the next number, every
   statement safe to re-run:

   ```sql
   alter table items add column if not exists address text;
   create index if not exists items_address on items (address);
   ```

   Then add the column to `src/db/queries.ts` and the views. Dev applies
   the file when it restarts, on the database production shares.

## Cards from chat

`node scripts/items.mjs` (commands in `AGENTS.md`, everything in
`--help`). A spreadsheet to import: [references/import.md](references/import.md).
A photo sent in chat goes onto a card with `items.mjs attach`; `show`
lists a card's files and how to fetch one to look at.

## Dev, on this machine

```bash
python3 ~/tools/taskandtool.py logs                  # state and the end of the log
curl -s -o /dev/null -w '%{http_code}\n' localhost:3000/healthz   # 200 once the database is ready
```

The server comes up without a database and shows one page saying so; it
watches `/home/sprite/.env` for `DATABASE_URL` and migrates the moment it
appears. If `/healthz` stays 503, the project has no Postgres yet: the
owner adds it from the app's page, or you ask with
`python3 ~/tools/taskandtool.py request-capability postgres`.

Look at your work before showing it: open the board at
`localhost:3000/b/<key>`.

## Before each deploy

The team works on the board in production, on the database dev shares.

1. `npm run check` and `npm test` pass.
2. Open the board in dev and look at what changed: a board, a card's
   drawer, the list view.
3. A migration is already on the shared database once dev restarted, so
   production's current code must work with it until the deploy.

Then `npm run deploy`: it prints production's address; open it and check a
board. Code and `board.config.json` wait for a deploy; cards and
migrations do not.

A person's name on the board is `people.name`, which each person sets at
the top right; until then it comes from their email (`maria.lopez@` shows
as Maria Lopez).
