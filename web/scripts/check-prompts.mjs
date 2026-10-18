// Checks the prompt files: every market in lib/markets.ts has prompts/markets/<code>.md with the six headings in
// order, a title line and a formats line, and a non-empty Protect section; no market file without a market.
// Usage (from web/): npm run check:prompts   (add --print to print the built scan prompt and Manus skill)
import fs from "node:fs";
import { MARKET_SECTIONS, marketCodes, marketFile, planSkill, scanPrompt, section } from "../lib/prompts.mjs";

// Manus rejects a message whose text is over ~5,000 estimated tokens; leave room for the job and the scan JSON.
const MANUS_SKILL_MAX_TOKENS = 3000;

// lib/markets.ts is TypeScript: read the codes from its source.
const codes = [...fs.readFileSync("lib/markets.ts", "utf8").matchAll(/code: "([A-Z]{2})"/g)].map((m) => m[1]);
const errors = [];

for (const code of codes) {
  const md = marketFile(code);
  if (!md) {
    errors.push(`${code}: prompts/markets/${code.toLowerCase()}.md is missing`);
    continue;
  }
  const [title, formats] = md.split("\n").filter((l) => l.trim());
  if (!title.startsWith("# ") || !title.includes(`(${code})`)) errors.push(`${code}: first line must be "# <Name> (${code})"`);
  if (!/^Copy language:.*Currency:.*Date:/.test(formats ?? "")) errors.push(`${code}: second line must list Copy language, Currency and Date`);
  const headings = md.split("\n").filter((l) => l.startsWith("## ")).map((l) => l.slice(3).trim());
  if (headings.join("|") !== MARKET_SECTIONS.join("|"))
    errors.push(`${code}: headings are [${headings.join(", ")}], expected [${MARKET_SECTIONS.join(", ")}]`);
  if (!section(md, "Protect").includes("- ")) errors.push(`${code}: Protect has no bullets`);
}
for (const code of marketCodes()) if (!codes.includes(code)) errors.push(`${code}: market file without a market in lib/markets.ts`);

const scan = scanPrompt(codes);
const skill = planSkill();
// ~4 characters per token for English text.
const tokens = (s) => Math.round(s.length / 4);
if (/\{\{\w+\}\}/.test(scan)) errors.push("scan prompt has an unfilled {{placeholder}}");
if (tokens(skill) > MANUS_SKILL_MAX_TOKENS) errors.push(`Manus skill text is ~${tokens(skill)} tokens (max ${MANUS_SKILL_MAX_TOKENS}): move content into the market files`);
const files = codes.map((c) => `${c} ~${tokens(marketFile(c) ?? "")}`).join(", ");
console.log(`Markets: ${codes.join(", ")}. Scan prompt ~${tokens(scan)} tokens; Manus skill text ~${tokens(skill)} tokens; market files (attached): ${files}.`);
if (process.argv.includes("--print")) console.log(`\n===== SCAN PROMPT =====\n${scan}\n\n===== MANUS SKILL =====\n${skill}`);

if (errors.length) {
  console.error(errors.map((e) => `✗ ${e}`).join("\n"));
  process.exit(1);
}
console.log("✓ Prompt files OK");
