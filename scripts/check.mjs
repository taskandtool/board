#!/usr/bin/env node
// The board's own checks, run with `npm run check` before showing work:
//   - board.config.json is valid (the same validator the server runs)
//   - migrations are numbered 0001, 0002, ... with no gaps
//   - no markup carries what DESIGN.md refuses: hex colours, default
//     Tailwind colours, gradients, blur, animations, tracking/leading
//     overrides, weights above semibold
//   - no em dashes in the interface copy
//   - the manifest and the skill adapter are in place
//   - the typecheck passes
// Exit 1 with the findings when something is off.
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const findings = [];

// board.config.json, through the server's own validator (needs tsx)
const cfgCheck = spawnSync("node_modules/.bin/tsx", ["-e", `
  import { validate } from "./src/config";
  import { readFileSync } from "node:fs";
  let raw; try { raw = JSON.parse(readFileSync("board.config.json", "utf8")); } catch (e) { console.log("board.config.json is not valid JSON: " + e.message); process.exit(0); }
  for (const p of validate(raw)) console.log("board.config.json: " + p);
  if (typeof raw.business === "string" && raw.business.includes("to fill")) console.error("note: board.config.json's business line is still to fill; the board is a template until the AI shapes it");
`], { encoding: "utf8" });
for (const line of (cfgCheck.stdout || "").split("\n").filter(Boolean)) findings.push(line);
if (cfgCheck.stderr) process.stderr.write(cfgCheck.stderr);

// migrations numbered without gaps
const migs = readdirSync("migrations").filter((f) => f.endsWith(".sql")).sort();
migs.forEach((f, i) => {
  if (!/^\d{4}_[a-z0-9_]+\.sql$/.test(f)) findings.push(`migrations/${f}: name it NNNN_words.sql`);
  else if (Number(f.slice(0, 4)) !== i + 1) findings.push(`migrations/${f}: expected number ${String(i + 1).padStart(4, "0")}`);
});

// the refuse list, in markup
function walk(dir) {
  return readdirSync(dir).flatMap((e) => {
    const p = join(dir, e);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}
const refuse = [
  [/\b(bg|text|border|from|to|via|ring|outline|fill|stroke)-\[#/, "a hex colour in markup: add a role token in styles/theme.css instead"],
  [/\b(bg|text|border|ring|outline)-(gray|slate|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black)\b/, "a Tailwind default colour: the palette is the theme's tokens only"],
  [/\b(bg-gradient-|bg-linear-|bg-radial-|bg-conic-)/, "a gradient"],
  [/\b(backdrop-blur|blur-|drop-shadow-)/, "blur or glass"],
  [/\banimate-/, "an animation utility"],
  [/\b(tracking|leading)-/, "a tracking/leading override: the size token carries both"],
  [/\bfont-(bold|extrabold|black)\b/, "a weight above semibold"],
  [/\btext-\[(?!clamp)/, "an arbitrary text size: add a --text-* token"],
];
for (const file of walk("src").filter((f) => f.endsWith(".tsx"))) {
  const src = readFileSync(file, "utf8");
  for (const [rx, why] of refuse) {
    const m = src.match(rx);
    if (m) findings.push(`${file}: "${m[0]}" is ${why}`);
  }
  src.split("\n").forEach((line, i) => {
    if (line.includes("—")) findings.push(`${file}:${i + 1}: an em dash in interface copy; write a comma, a colon, or a new sentence`);
  });
}

// the conventions the platform reads
if (!existsSync("starter-app.json")) findings.push("starter-app.json is missing");
if (!existsSync(".claude/skills/board/SKILL.md")) findings.push(".claude/skills/board/SKILL.md is missing");
if (!existsSync(".agents/skills/board/SKILL.md")) findings.push(".agents/skills/board/SKILL.md (the Codex adapter) is missing");
if (!existsSync("static/vendor/htmx.min.js") || !existsSync("static/vendor/Sortable.min.js")) findings.push("static/vendor is missing: run npm run vendor");

// typecheck
const tc = spawnSync("node_modules/.bin/tsc", ["--noEmit", "-p", "."], { encoding: "utf8" });
if (tc.status !== 0) findings.push("typecheck failed:\n" + tc.stdout);

if (findings.length) {
  console.error("check: " + findings.length + " finding(s)\n  - " + findings.join("\n  - "));
  process.exit(1);
}
console.log("check: ok");
