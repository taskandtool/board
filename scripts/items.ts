// The AI's hands on the board. `node scripts/items.mjs --help`.
import { parseArgs, flag, has, withDb, who, resolveBoard, resolveStatus, fail, out, fmtItem } from "./lib";
import * as Q from "../src/db/queries";
import { STALE_DAYS } from "../src/db/queries";

const HELP = `items.mjs: read and change the board's cards from the command line.

  list [--board key] [--status key] [--assignee email] [--tag t] [--overdue] [--stale 3d] [--over-limit] [--archived]
  add "title" [--board key] [--status key] [--due YYYY-MM-DD] [--assignee email] [--priority 0|1|2] [--tag t]... [--field k=v]... [--notes "text"] [--customer "ref"] [--top]
  show <id>
  move <id> <status-key> [--to-top]
  edit <id> [--title t] [--due d|none] [--assignee e|none] [--priority n] [--tag t]... [--notes "text"] [--field k=v]...
  tag <id> +tag -tag ...
  note <id> "text"                   a comment on the card
  check <id> "step" [--done]         add a checklist step (or mark one done by its text)
  find "words" [--board key]
  archive <id> | restore <id>
  archive-done [--board key] [--older 14]
  attention [--board key]            what needs attention, and why
  summary [--board key]

  --json on any command prints JSON instead of text. --as email records who acted (default: BOARD_USER or "AI").
Boards and columns: node scripts/board.mjs --help.`;

const a = parseArgs(process.argv.slice(2));
const json = has(a, "json");
const actor = flag(a, "as") ?? who();
const [cmd, ...rest] = a._;
if (!cmd || has(a, "help")) { console.log(HELP); process.exit(0); }

const parseFields = () => {
  const f: Record<string, string> = {};
  for (const kv of (flag(a, "field") ?? "").split(",").filter(Boolean)) {
    const [k, ...v] = kv.split("=");
    if (k && v.length) f[k.trim()] = v.join("=").trim();
  }
  return f;
};

await withDb(async (pool) => {
  const board = await resolveBoard(pool, flag(a, "board"));
  const cols = await Q.statuses(pool, board.id);
  const idOf = (s: string | undefined) => { const n = Number(s); if (!Number.isInteger(n) || n <= 0) fail(`expected a card id, got ${s}`); return n; };

  switch (cmd) {
    case "list": {
      let items = has(a, "archived") ? await Q.archivedItems(pool, board.id) : await Q.items(pool, board.id, { assignee: flag(a, "assignee"), tag: flag(a, "tag"), due: has(a, "overdue") ? "overdue" : "" });
      if (flag(a, "status")) { const s = await resolveStatus(pool, board, flag(a, "status")); items = items.filter((i) => i.status_id === s.id); }
      if (flag(a, "stale")) {
        const days = Number(String(flag(a, "stale")).replace(/d$/, "")) || STALE_DAYS;
        const cutoff = Date.now() - days * 86_400_000;
        const first = cols[0]?.id;
        items = items.filter((i) => i.status_id !== first && !i.completed_at && new Date(i.updated_at).getTime() < cutoff);
      }
      if (has(a, "over-limit")) {
        const counts = await Q.columnCounts(pool, board.id);
        const over = new Set(cols.filter((c) => c.wip_limit != null && (counts.get(c.id) ?? 0) > c.wip_limit).map((c) => c.id));
        items = items.filter((i) => over.has(i.status_id));
      }
      out(json, items, () => items.length ? items.map((i) => fmtItem(i, cols)).join("\n") : "nothing here");
      break;
    }
    case "add": {
      const title = rest.join(" ");
      if (!title) fail("add needs a title");
      const status = await resolveStatus(pool, board, flag(a, "status"));
      const it = await Q.createItem(pool, board.id, {
        title, status_id: status.id, due_on: flag(a, "due"), assignee: flag(a, "assignee"), priority: Number(flag(a, "priority") ?? 0),
        tags: flag(a, "tag")?.split(","), fields: parseFields(), notes: flag(a, "notes"), customer_ref: flag(a, "customer"), top: has(a, "top"),
      }, actor);
      out(json, it, () => "added " + fmtItem(it, cols));
      break;
    }
    case "show": {
      const it = await Q.item(pool, idOf(rest[0]));
      if (!it) fail("no such card");
      const acts = await Q.activity(pool, it.id);
      out(json, { item: it, activity: acts }, () => [fmtItem(it, cols), it.notes ? "\n" + it.notes : "", it.checklist.length ? "\nchecklist:\n" + it.checklist.map((c) => `  [${c.done ? "x" : " "}] ${c.text}`).join("\n") : "",
        Object.keys(it.fields).length ? "\nfields: " + Object.entries(it.fields).map(([k, v]) => `${k}=${v}`).join(", ") : "",
        "\nactivity:\n" + acts.map((x) => `  ${x.at.toISOString().slice(0, 16)} ${x.who ?? "board"} ${x.kind}${x.body ? ": " + x.body : ""}${x.from_status ? ` ${x.from_status} -> ${x.to_status}` : ""}`).join("\n")].join(""));
      break;
    }
    case "move": {
      const id = idOf(rest[0]);
      const it = await Q.item(pool, id);
      if (!it) fail("no such card");
      const b = (await Q.boardById(pool, it.board_id))!;
      const status = await resolveStatus(pool, b, rest[1]);
      let beforeId: number | null = null;
      if (has(a, "to-top")) beforeId = (await Q.items(pool, b.id)).find((x) => x.status_id === status.id && x.id !== id)?.id ?? null;
      const r = await Q.moveItem(pool, id, { statusId: status.id, beforeId }, actor);
      out(json, r.item, () => `moved #${id} to ${r.to.label}`);
      break;
    }
    case "edit": {
      const id = idOf(rest[0]);
      const patch: Q.ItemPatch = {};
      if (flag(a, "title")) patch.title = flag(a, "title");
      if (flag(a, "notes") !== undefined) patch.notes = flag(a, "notes");
      if (flag(a, "due") !== undefined) patch.due_on = flag(a, "due") === "none" ? null : flag(a, "due");
      if (flag(a, "assignee") !== undefined) patch.assignee = flag(a, "assignee") === "none" ? null : flag(a, "assignee");
      if (flag(a, "priority") !== undefined) patch.priority = Number(flag(a, "priority"));
      if (flag(a, "tag") !== undefined) patch.tags = flag(a, "tag")!.split(",");
      if (flag(a, "customer") !== undefined) patch.customer_ref = flag(a, "customer");
      const f = parseFields(); if (Object.keys(f).length) patch.fields = f;
      const it = await Q.updateItem(pool, id, patch, actor);
      out(json, it, () => "saved " + fmtItem(it, cols));
      break;
    }
    case "tag": {
      const id = idOf(rest[0]);
      const it = await Q.item(pool, id); if (!it) fail("no such card");
      let tags = [...it.tags];
      for (const t of rest.slice(1)) { if (t.startsWith("-")) tags = tags.filter((x) => x.toLowerCase() !== t.slice(1).toLowerCase()); else tags.push(t.replace(/^\+/, "")); }
      const u = await Q.updateItem(pool, id, { tags }, actor);
      out(json, u, () => "tags: " + u.tags.join(", "));
      break;
    }
    case "note": {
      const id = idOf(rest[0]);
      await Q.comment(pool, id, rest.slice(1).join(" "), actor);
      out(json, { ok: true }, () => `noted on #${id}`);
      break;
    }
    case "check": {
      const id = idOf(rest[0]);
      const it = await Q.item(pool, id); if (!it) fail("no such card");
      const text = rest.slice(1).join(" ");
      const list = [...it.checklist];
      const i = list.findIndex((c) => c.text.toLowerCase() === text.toLowerCase());
      if (i >= 0) list[i] = { ...list[i], done: has(a, "done") ? true : !list[i].done }; else list.push({ text, done: has(a, "done") });
      const u = await Q.updateItem(pool, id, { checklist: list }, actor);
      out(json, u.checklist, () => u.checklist.map((c) => `[${c.done ? "x" : " "}] ${c.text}`).join("\n"));
      break;
    }
    case "find": {
      const items = await Q.items(pool, board.id, { q: rest.join(" ") });
      out(json, items, () => items.length ? items.map((i) => fmtItem(i, cols)).join("\n") : "no matches");
      break;
    }
    case "archive": await Q.archiveItem(pool, idOf(rest[0]), actor); out(json, { ok: true }, () => `archived #${rest[0]}`); break;
    case "restore": await Q.restoreItem(pool, idOf(rest[0]), actor); out(json, { ok: true }, () => `restored #${rest[0]}`); break;
    case "archive-done": {
      const n = await Q.archiveDone(pool, board.id, Number(flag(a, "older") ?? 14), actor);
      out(json, { archived: n }, () => `archived ${n} finished card${n === 1 ? "" : "s"}`);
      break;
    }
    case "attention": {
      const list = await Q.attention(pool, board.id);
      out(json, list, () => list.length ? list.map((x) => fmtItem(x.item, cols) + "\n    " + x.why.join("; ")).join("\n") : "nothing needs attention");
      break;
    }
    case "summary": {
      const s = await Q.summary(pool, board.id);
      out(json, s, () => [
        `${s.board.name}: ` + s.columns.map((c) => `${c.status.label} ${c.count}${c.status.wip_limit != null ? `/${c.status.wip_limit}` : ""}${c.over ? " (over)" : ""}`).join(", "),
        `overdue ${s.overdue}, due this week ${s.dueThisWeek}, unassigned ${s.unassigned}, finished in the last 7 days ${s.doneThisWeek}`,
      ].join("\n"));
      break;
    }
    default: fail(`unknown command ${cmd}\n\n${HELP}`);
  }
});
