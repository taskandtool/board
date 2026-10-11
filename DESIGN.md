# DESIGN.md

The board's design system: what each token in `styles/theme.css` is for
and what to refuse. This is an internal tool a team looks at all day, so
the rules are an app's: dense, quiet, one accent, colour only where it
carries meaning. `npm run check` enforces the parts that can be checked.

## Color roles

| Token | Role |
|---|---|
| `--color-canvas` | The page. |
| `--color-surface` | A card, a panel that floats (the drawer, a menu). |
| `--color-panel` | A column, a tinted band, a hover. |
| `--color-night` / `night-ink` / `night-ink-2` | The toast. |
| `--color-ink` / `ink-2` / `ink-3` | Text, secondary text, metadata. Every pair meets 4.5:1 on canvas and panel. |
| `--color-accent` / `accent-ink` | The one action colour: primary buttons, the focus ring. |
| `--color-accent-soft` | A filter that is on, the examples banner. Accent text sits on it. |
| `--color-late` / `late-ink` / `late-soft` | Lateness: an overdue badge is `late` on `late-soft`; urgent priority is `late` text with a flag. |
| `--color-warn` / `warn-ink` | Due today or soon, a column over its limit. |
| `--color-tag-0` to `tag-6` | The tag palette; `tag-0` is a tag the config does not name. All take `--color-ink`. |
| `--color-line` / `line-strong` | Hairlines; input, button and table edges. `line-strong` keeps 3:1 on every ground, the floor for a control's edge. |

Change a value in `styles/theme.css` and keep its row here. The Tailwind
default palette is off, so `bg-blue-500` does not exist; add a role.

## Type and space

One family (`--font-body`), three sizes: `text-title` (a page or card
heading), `text-copy` (everything), `text-label` (metadata, filters,
buttons). On a touch screen every text box is 16px, or the phone zooms.
Weights: normal, medium (titles of cards and rows, field labels, badges)
and semibold (headings, buttons). Radii: `rounded-control` for
inputs and buttons, `rounded-card` for cards and panels. Depth:
`shadow-card` on a card at rest, `shadow-lift` on something that floats.

Controls take their classes from `src/views/ui.ts`; change a control's
look there, once. `control` is a box that is always a box (filters, the
composer, a comment). `field` is a value in a card's details: plain text
until it is pointed at or focused, so an open card reads as a card, not a
form. `button` is the secondary action, `primary` the one main action,
`ghost` a quiet one. Icons come from `src/views/icons.tsx`, one 16-unit
grid, never a character standing in for one (no ← × ···).

## Composition

- The board is a horizontal row of columns; it scrolls sideways on a phone
  and never widens the page.
- A card shows its title, the line of who and where (the customer and
  any field marked `on_card`), then only the badges that carry
  information: a due date, a priority above normal, tags, a checklist
  count, the assignee. Nothing decorative. Every badge is one shape
  (`badge`); dates are filled and priority is a flag and a word with no
  ground, so the two never read alike.
- An open card is a header (where it is, archive, open, close), the
  title, the details as label and value rows, then Notes, Checklist,
  Photos and files, and Activity as sections with plain headings.
- Settings pages are white cards on the canvas, rows divided by hairlines.
- One accent colour does every primary action. Danger is not red; it is a
  plain button with a clear label and an Undo afterwards.
- Motion: SortableJS's drag animation and nothing else. Reduced motion
  turns it off.

## Refuse

Hex values or default Tailwind colours in markup, gradients, blur, glass,
gradient text, `animate-*`, tracking or leading overrides, weights above
semibold, arbitrary text sizes, em dashes in interface copy.
