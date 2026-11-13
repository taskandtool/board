# Work Board

**A kanban board for your team's work that your AI agent sets up, fills and
changes when you ask in the chat.** You get a board for jobs, listings,
candidates or client projects. The agent names the columns and card fields
in your words.

[![Deploy on Task & Tool](https://taskandtool.com/images/deploy-button.svg)](https://taskandtool.com/accounts/register?starter_app=board)

![Northline Gardens' Okafor backyard board and its Lay the patio card](https://taskandtool.com/images/starter-apps/board.webp)

It's made to run on Task & Tool. Each app there has its own computer for
your AI agent. The project has a Postgres database for the boards and cards.
The agent uses the skill and scripts in this repo to set your columns and
card fields, add and move cards, and tell you what is late. The board is
built with Hono, htmx and Tailwind.

## Get started

Click the button above, or pick Work Board when you create an app on [Task &
Tool](https://taskandtool.com/starter-apps/board). Then ask the agent in the
chat to set up the board for your business.

See it in use on the [Work Board
page](https://taskandtool.com/starter-apps/board).

## Features

### The agent sets the board up for your business

Tell the agent what kind of work you track and what you call it. It names
the cards (Jobs, Listings, Candidates), sets the columns to your steps and
adds a field for each thing you track on a card. Fields can be text,
numbers, money, phone numbers, dates or a pick list. Phone numbers have a
Call link. The agent starts from the closest of three worked examples:

| Example | Columns | Card fields |
|---|---|---|
| Contractor | Quoted, Scheduled, On site, Invoiced, Paid | Address, crew, quote |
| Realtor | Listings: Coming soon, Active, Under offer, Closing, Closed. Buyers: New, Viewing, Offering, Closed | Address, asking price, type |
| Recruiter | Sourced, Screening, Interviewing, Offer, Placed, Passed | Role, source, expected salary |

It also sets your time zone. A card due Friday is overdue from Saturday in
your time zone.

![Northline Gardens' board for the Okafor backyard. Lay the patio is under Build](https://taskandtool.com/images/marketing/northline-gardens-board-okafor.webp)

### Ask the agent what needs attention

The agent lists cards that are overdue, due today or marked urgent. It also
lists columns over their limit and cards in progress that no one has touched
in three days. When you ask for a summary, the agent tells you how many
cards are in each column and how many are overdue, due this week or finished
in the last seven days. You can ask the agent to add, move or assign a card,
or add a note.

### Several boards in one app

A hiring board and a client board can have different columns and a different
word for a card. Your team can add, rename, reorder and remove columns on
the Board settings page. You see how many cards are in each column. You can
give a column a card limit. When a column is over its limit, its count is a
different color. You can still add cards past the limit. If you show a money
field such as Quote on the cards, the column has a total at the top.

### Notes, photos and files on a card

A card can have notes, a due date, the person doing it, a priority, tags, a
checklist and comments. To add photos and files to a card, drag, paste or
pick them. Files can be up to 10 MB. We shrink photos in your browser and
remove their location data before sending them. The first photo is the
card's cover. Files are stored in the database. A backup of the database
includes them.

<img src="https://taskandtool.com/images/marketing/northline-gardens-board-card-plain.webp" width="300" alt="The Lay the patio card: column Build, assigned to Marco, due October 29, tagged Stone, for Grace Okafor">

### Drag, filter and export

Drag cards between columns, or move them with the arrow keys. After you move
a card, click Undo at the bottom of the screen. Filter by search, person,
tag or due date, or show only your cards. In the list view you can sort the
same cards in a table and group them by column. You can export any board as
a CSV file. You or the agent can archive finished cards in one go. On the
Archive page you pick how many days old they must be. The default is 14.

### Who changed a card

Open a card to see who made each change. Your team signs in with Task &
Tool. Anyone can change their display name from the top right of the board.

### The agent imports your spreadsheet

Attach a CSV or .xlsx file in the chat. The agent shows you the first ten
rows and which board field each column goes to. Then it imports the cards.
If you import the same file again, it adds only the rows that aren't on the
board yet.

## Why run it on Task & Tool

Task & Tool is the easiest place to run it. The database and sign-in are
included. The agent publishes the board to Cloudflare when you ask. Each app
has:

- Its own computer for the agent
- A dev address your team opens to use the board and see changes
- Access to the project's Postgres database for your boards, cards and
  files. You can roll it back to an earlier point in time.
- Publishing on your own domain with a free SSL certificate. Only your team
  sees production until you make it public.
- Sign-in for your team

Anyone who can open the board can edit it. Once production is public, that
is anyone with the link.

## Make it your own

Ask the agent for any change in the chat. To start from your own copy, fork
this repo, change what you like, and start a new app from your fork on Task
& Tool. You can also copy its skills from `.claude/skills/` into another
repo.

## What's in the repo

```
board.config.json   your words, boards, columns, tags, card fields and time zone
examples/           the contractor, realtor and recruiter setups
migrations/         the database tables, as numbered SQL files
src/                the app: the routes, the pages and the database queries
scripts/            add and move cards, edit boards, import, export, check
styles/  static/    the design tokens, the built CSS and the browser code
test/               the tests
.claude/skills/     the board, data, writing and tropes skills
AGENTS.md           what the agent reads first
DESIGN.md           how the design tokens work
.taskandtool/       setup for an install on Task & Tool
starter-app.json    what the app needs and its chat suggestions
```

## Commands

The agent runs these on the app's computer. To run them on your own
computer, use Node 20 or later, run `npm install`, and set `DATABASE_URL` to
a Postgres database and `BOARD_USER` to your email.

- `npm run dev`: the board on localhost:3000, restarted on every change. New
  migrations are applied at start.
- `node scripts/cards.mjs`: add, move, find and summarize cards.
- `node scripts/board.mjs`: change boards and columns.
- `node scripts/import.mjs`: import a CSV or .xlsx file.
- `node scripts/export.mjs`: print a board as CSV.
- Every script has `--help`.
- `npm run check`: check the config, the migrations, the colors and styles
  in the markup, the copy and the types.
- `npm test`: run the tests. Set `TEST_DATABASE_URL` to include the database
  tests.
- `npm run deploy`: publish the board to production. You can use it only on
  Task & Tool.

## Third-party tools

- npm packages: `hono`, `@hono/node-server`, `pg`, `sortablejs`,
  `tailwindcss` + `@tailwindcss/cli`, `esbuild` and `tsx` (MIT); `htmx.org`
  (0BSD); `typescript` (Apache-2.0).

## License

MIT. See `LICENSE`.
