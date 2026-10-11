# Shaping the board for a business

Read when asked to shape the board or to change `board.config.json`.

Read `board.config.json`, the closest of `examples/contractor.json`,
`realtor.json` and `recruiter.json` (do not copy it blind), and whatever
this project already knows about the business (a Company Brain's notes,
the owner's words). Ask only what you cannot infer. Then set the keys
below, write the `business` line, and show the board.

Existing cards keep their columns by key. A column you remove from the
config is not removed from the database; `board.mjs column remove` does
that, and only when the column is empty.

## The keys, read once at start

- `vocabulary.item` is what a card is called: `{ "one": "Job", "many": "Jobs" }`.
  A board with other work names its own: `"item": { "one": "Candidate",
  "many": "Candidates" }` on that board seeds it, and after the first run
  `board.mjs words <board-key> "Candidate"` (or Board settings) changes it.
- `boards[]` are the boards and their `columns[]` seeded on the first run:
  `{ key, label, wip_limit, is_done }`. Keys are slugs and never change;
  labels are free. Every board needs one `is_done` column. After the first
  run, boards and columns are rows; this list only seeds a board that does
  not exist yet.
- `tags[]` is the palette: `{ "name": "Roof", "role": "tag-1" }` with roles
  `tag-1` to `tag-6`. Tags outside the palette take the neutral colour.
  Priority is its own field: never a tag for it ("Urgent", "High").
- `card.fields` is which built-in fields a card shows, from `due_on`,
  `assignee`, `priority`, `tags`, `checklist`, `customer_ref`.
- `card.custom[]` adds fields without a migration:
  `{ "key": "crew", "label": "Crew", "type": "select", "options": ["North", "South"] }`
  (types `text`, `number`, `money`, `phone`, `date`, `select`). They live
  in `items.fields` as JSON and show on the open card, in CSV, and in the
  scripts (`--field crew=North`). `"on_card": true` puts one on the card
  face and in the list, after the customer: pick the one or two a person
  scans for (an address, a quote). A `money` field on the face totals
  each column; `currency` (ISO code, default `USD`) sets its symbol. A
  `phone` field gets a Call link.
- `default_view` (`board` or `list`) and `archive_done_after_days`.
- `time_zone`, an IANA name (`America/Chicago`). Due dates are dates, not
  instants, so "overdue" and "due today" are judged in this zone; it ships
  as `UTC`, and setting it is part of shaping. The machine's clock never
  decides.
- `business` is one line about the business. It ships as `to fill`;
  writing the real line also retires the "Shape this board" suggestion.
