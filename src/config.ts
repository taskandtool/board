// board.config.json, read once and validated. This file is the first lever
// the AI pulls to shape the board: vocabulary, the boards and columns seeded
// on first run, the tag palette, the fields a card shows, the default view.
// Nothing here changes a table name.
import config from "../board.config.json";
import { validate, type Config, type CustomField } from "./config-schema";

export * from "./config-schema";

const problems = validate(config);
if (problems.length) {
  throw new Error("board.config.json is not valid:\n  - " + problems.join("\n  - "));
}

export const cfg = config as Config;
export const tagRole = (name: string) => cfg.tags.find((t) => t.name.toLowerCase() === name.toLowerCase())?.role ?? "tag-0";
export const showsField = (f: string) => cfg.card.fields.includes(f);

// Custom fields marked on_card show on the card face, after the customer.
export const faceFields = cfg.card.custom.filter((f) => f.on_card);
// The money fields on the face: each column heads with their total.
export const totalFields = faceFields.filter((f) => f.type === "money");

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: cfg.currency ?? "USD", maximumFractionDigits: 0 });
export const formatMoney = (n: number) => currency.format(n);
// A money value as a number, forgiving "$8,900" from an imported sheet; null when it is not one.
export function moneyValue(raw: string | undefined): number | null {
  const n = Number((raw ?? "").replace(/[^\d.-]/g, ""));
  return /\d/.test(raw ?? "") && Number.isFinite(n) ? n : null;
}

// A custom value as it reads on a card or in the list.
export function showValue(f: CustomField, raw: string | undefined): string {
  const v = (raw ?? "").trim();
  if (!v) return "";
  const n = f.type === "money" ? moneyValue(v) : null;
  return n === null ? v : formatMoney(n);
}

// What a card shows under its title, and the list beside it: the customer,
// then the custom fields marked on_card.
export const faceOf = (item: { customer_ref: string | null; fields: Record<string, string> }) =>
  [showsField("customer_ref") ? item.customer_ref ?? "" : "", ...faceFields.map((f) => showValue(f, item.fields[f.key]))].filter(Boolean);
