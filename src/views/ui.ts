// The board's controls, named once so changing how they look is one edit.
// A view adds layout (width, alignment) around them, never another look.

// A text box or select that is always a box: filters, the composer, a comment.
export const control = "rounded-control border border-line-strong bg-surface px-2.5 py-1.5 shadow-card";
// A field in a card's details: plain text until it is pointed at or focused.
export const field = "w-full rounded-control border border-transparent bg-transparent px-2 py-1.5 hover:border-line focus:border-line-strong focus:bg-surface";
export const button = "inline-flex items-center justify-center gap-1.5 rounded-control border border-line-strong bg-surface px-3 py-1.5 font-semibold text-ink shadow-card hover:bg-canvas";
export const primary = "inline-flex items-center justify-center gap-1.5 rounded-control bg-accent px-3 py-1.5 font-semibold text-accent-ink shadow-card hover:opacity-90";
// A quiet action: a link that behaves like a button.
export const ghost = "inline-flex items-center gap-1.5 rounded-control px-2 py-1 text-ink-2 hover:bg-panel hover:text-ink";
export const menuItem = "w-full rounded-control px-2 py-1.5 text-left hover:bg-panel";
// Badges: one shape for every signal on a card.
export const badge = "inline-flex items-center gap-1 rounded-control px-1.5 py-px text-label font-medium";
// A section heading inside a page or the drawer.
export const heading = "text-label font-semibold text-ink";
