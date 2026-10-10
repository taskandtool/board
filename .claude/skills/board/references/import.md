# Spreadsheet import

Read when the owner sends a spreadsheet to turn into cards: a CSV or an
.xlsx (its first sheet).

Always dry-run first, show the owner the mapping, then run.

```bash
node scripts/import.mjs ~/app/uploads/jobs.csv --dry-run
node scripts/import.mjs ~/app/uploads/jobs.csv --map title=Task,due_on=Deadline --status todo
```

Headers are matched by name (title, status, assignee, due_on, priority,
tags, notes, customer_ref, and any custom field key); `--map` fixes a
miss. Unknown status values fall back to `--status` (default: the first
column). Running it again adds only the rows not already on the board.
`node scripts/export.mjs > board.csv` is the reverse.
