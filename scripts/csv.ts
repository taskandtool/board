// A small CSV reader (RFC 4180: quotes, doubled quotes, newlines in quotes).
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (q) {
      if (ch === '"') { if (src[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

// Guess which spreadsheet column feeds which card field from its header.
export function guessMap(headers: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  const want: Record<string, RegExp> = {
    title: /^(title|task|name|job|item|subject|summary|candidate|listing)$/i,
    status: /^(status|column|stage|state)$/i,
    assignee: /^(assignee|assigned|owner|who|person)$/i,
    due_on: /^(due|due date|due_on|deadline|date)$/i,
    priority: /^(priority|urgency)$/i,
    tags: /^(tags?|labels?|category)$/i,
    notes: /^(notes?|description|details|comments?)$/i,
    customer_ref: /^(customer|client|account|company)$/i,
  };
  for (const h of headers) for (const [field, rx] of Object.entries(want)) if (!map[field] && rx.test(h.trim())) map[field] = h;
  return map;
}

export function parseDate(v: string): string | null {
  const s = v.trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    const y = m[3].length === 2 ? "20" + m[3] : m[3];
    // day/month when the first number cannot be a month
    const [a, b] = [Number(m[1]), Number(m[2])];
    const [mm, dd] = a > 12 ? [b, a] : [a, b];
    return `${y}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
  }
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : new Date(t).toISOString().slice(0, 10);
}

export function parsePriority(v: string): number {
  const s = v.trim().toLowerCase();
  if (/^(2|urgent|critical|highest|p0|p1)$/.test(s)) return 2;
  if (/^(1|high|important|p2)$/.test(s)) return 1;
  return 0;
}
