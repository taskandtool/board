// The shape of board.config.json and the validator, with no file loaded:
// scripts/check.mjs imports this to report on a config the server refused.
export type ColumnConfig = { key: string; label: string; wip_limit?: number | null; is_done?: boolean };
export type BoardConfig = { key: string; name: string; columns: ColumnConfig[] };
export type TagConfig = { name: string; role: string };
export type CustomField = { key: string; label: string; type: "text" | "number" | "date" | "select"; options?: string[] };
export type Config = {
  business: string;
  vocabulary: { item: { one: string; many: string } };
  boards: BoardConfig[];
  tags: TagConfig[];
  card: { fields: string[]; custom: CustomField[] };
  default_view: "board" | "list";
  archive_done_after_days: number;
  time_zone: string;
};

const KEY = /^[a-z0-9][a-z0-9_-]{0,39}$/;
const TAG_ROLES = ["tag-1", "tag-2", "tag-3", "tag-4", "tag-5", "tag-6"];
const CARD_FIELDS = ["due_on", "assignee", "priority", "tags", "checklist", "customer_ref"];

// Returns the problems with a config object, or an empty list. Used at
// startup (a broken config is a startup error with the reason) and by
// `npm run check`.
export function validate(raw: unknown): string[] {
  const out: string[] = [];
  const c = raw as Partial<Config> | null;
  if (!c || typeof c !== "object") return ["config is not an object"];
  if (typeof c.business !== "string") out.push("business must be a string (one line about the business, or 'to fill')");
  const v = c.vocabulary?.item;
  if (!v || typeof v.one !== "string" || typeof v.many !== "string" || !v.one || !v.many) out.push("vocabulary.item needs one and many");
  if (!Array.isArray(c.boards) || c.boards.length === 0) out.push("boards must list at least one board");
  else {
    const keys = new Set<string>();
    c.boards.forEach((b, i) => {
      if (!b || typeof b !== "object") return out.push(`boards[${i}] is not an object`);
      if (!KEY.test(b.key ?? "")) out.push(`boards[${i}].key must match ${KEY}`);
      if (keys.has(b.key)) out.push(`boards[${i}].key ${b.key} repeats`);
      keys.add(b.key);
      if (!b.name) out.push(`boards[${i}].name is missing`);
      if (!Array.isArray(b.columns) || b.columns.length === 0) return out.push(`boards[${i}].columns must list at least one column`);
      const ckeys = new Set<string>();
      b.columns.forEach((col, j) => {
        if (!KEY.test(col?.key ?? "")) out.push(`boards[${i}].columns[${j}].key must match ${KEY}`);
        if (ckeys.has(col.key)) out.push(`boards[${i}].columns[${j}].key ${col.key} repeats`);
        ckeys.add(col.key);
        if (!col.label) out.push(`boards[${i}].columns[${j}].label is missing`);
        if (col.wip_limit != null && (!Number.isInteger(col.wip_limit) || col.wip_limit < 1)) out.push(`boards[${i}].columns[${j}].wip_limit must be a whole number above 0, or null`);
      });
      if (!b.columns.some((col) => col.is_done)) out.push(`boards[${i}] has no column with is_done: true, so nothing can count as finished`);
    });
  }
  if (!Array.isArray(c.tags)) out.push("tags must be a list");
  else c.tags.forEach((t, i) => {
    if (!t?.name) out.push(`tags[${i}].name is missing`);
    if (!TAG_ROLES.includes(t?.role)) out.push(`tags[${i}].role must be one of ${TAG_ROLES.join(", ")}`);
  });
  if (!c.card || !Array.isArray(c.card.fields)) out.push("card.fields must be a list");
  else c.card.fields.forEach((f) => { if (!CARD_FIELDS.includes(f)) out.push(`card.fields: ${f} is not a card field (${CARD_FIELDS.join(", ")})`); });
  if (!c.card || !Array.isArray(c.card.custom)) out.push("card.custom must be a list");
  else c.card.custom.forEach((f, i) => {
    if (!KEY.test(f?.key ?? "")) out.push(`card.custom[${i}].key must match ${KEY}`);
    if (!f?.label) out.push(`card.custom[${i}].label is missing`);
    if (!["text", "number", "date", "select"].includes(f?.type)) out.push(`card.custom[${i}].type must be text, number, date or select`);
    if (f?.type === "select" && (!Array.isArray(f.options) || f.options.length === 0)) out.push(`card.custom[${i}] is a select with no options`);
  });
  if (c.default_view !== "board" && c.default_view !== "list") out.push("default_view must be board or list");
  if (!Number.isInteger(c.archive_done_after_days) || (c.archive_done_after_days as number) < 0) out.push("archive_done_after_days must be a whole number (0 turns the suggestion off)");
  if (typeof c.time_zone !== "string" || !validTimeZone(c.time_zone)) out.push(`time_zone must be an IANA zone name such as "America/Chicago" or "UTC" (got ${JSON.stringify(c.time_zone)})`);
  return out;
}


export function validTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// Today's date, YYYY-MM-DD, in the business's zone. Due dates are dates,
// never instants, so "overdue" must be judged where the business is.
export function todayIn(tz: string, now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
