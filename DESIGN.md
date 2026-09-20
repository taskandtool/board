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
| `--color-late` / `late-ink` | A card past its date. |
| `--color-warn` / `warn-ink` | Due today or soon, urgent, a column over its limit. |
| `--color-tag-0` to `tag-6` | The tag palette; `tag-0` is a tag the config does not name. All take `--color-ink`. |
| `--color-line` / `line-strong` | Hairlines; input and table edges. |

Change a value in `styles/theme.css` and keep its row here. The Tailwind
default palette is off, so `bg-blue-500` does not exist; add a role.

## Type and space

One family (`--font-body`), three sizes: `text-title` (a page or card
heading), `text-copy` (everything), `text-label` (metadata, filters,
buttons). Weights: normal and semibold. Radii: `rounded-control` for
inputs and buttons, `rounded-card` for cards and panels. Depth:
`shadow-card` on a card at rest, `shadow-lift` on something that floats.

## Composition

- The board is a horizontal row of columns; it scrolls sideways on a phone
  and never widens the page.
- A card shows its title and only the badges that carry information: a
  priority above normal, a due date, tags, a checklist count, the
  assignee. Nothing decorative.
- One accent colour does every primary action. Danger is not red; it is a
  plain button with a clear label and an Undo afterwards.
- Motion: SortableJS's drag animation and nothing else. Reduced motion
  turns it off.

## Refuse

Hex values or default Tailwind colours in markup, gradients, blur, glass,
gradient text, `animate-*`, tracking or leading overrides, weights above
semibold, arbitrary text sizes, em dashes in interface copy.
