// Builds the prompts from web/prompts/ (shared rules, scan prompt, Manus skill, one file per market).
// Plain JS so the node test scripts (scripts/*.mjs) build exactly the same prompts as the app.
import fs from "node:fs";
import path from "node:path";

const DIR = path.join(process.cwd(), "prompts");

// Headings every prompts/markets/<code>.md must have, in this order (scripts/check-prompts.mjs).
export const MARKET_SECTIONS = ["Protect", "Language & formats", "Objects & food", "Places", "Keep it real", "Never"];

export const readPrompt = (name) => fs.readFileSync(path.join(DIR, name), "utf8");

const marketPath = (code) => path.join(DIR, "markets", `${code.toLowerCase()}.md`);

// Market codes that have a file (used by the scripts, which can't import the TS market list).
export const marketCodes = () =>
  fs
    .readdirSync(path.join(DIR, "markets"))
    .filter((f) => /^[a-z]{2}\.md$/.test(f))
    .map((f) => f.slice(0, 2).toUpperCase());

// The market's file, or null if it has none.
export const marketFile = (code) => (fs.existsSync(marketPath(code)) ? fs.readFileSync(marketPath(code), "utf8") : null);

// Body of a "## <heading>" section (up to the next "## "), trimmed; "" if missing.
export function section(md, heading) {
  const lines = md.split("\n");
  const start = lines.findIndex((l) => l.trim() === `## ${heading}`);
  if (start < 0) return "";
  const end = lines.findIndex((l, i) => i > start && l.startsWith("## "));
  return lines.slice(start + 1, end < 0 ? undefined : end).join("\n").trim();
}

// Title + format line + Protect rules of one market, for the scan prompt.
function scanBlock(code) {
  const md = marketFile(code);
  if (!md) return `## ${code}\n(no market file)`;
  const [title, formats] = md.split("\n").filter((l) => l.trim());
  return `${title.replace(/^# /, "## ")}\n${formats}\nProtect (\`must\` here):\n${section(md, "Protect")}`;
}

// Scan prompt for every supported market: the scan is cached per post and reused by any job.
export const scanPrompt = (codes) =>
  readPrompt("scan.md")
    .replace("{{RULES}}", readPrompt("rules.md"))
    .replace("{{CODES}}", codes.join(", "))
    .replace("{{MARKETS}}", codes.map(scanBlock).join("\n\n"));

// Manus skill text: planning steps + shared rules. Manus caps a message's text at ~5,000 tokens, so the market
// files go in as attachments (marketAttachments), which don't count toward that limit.
export const planSkill = () => `${readPrompt("plan-post.md")}\n\n${readPrompt("rules.md")}`;

// The job's market files as Manus file parts (inline base64), named market-<code>.md.
export function marketAttachments(codes) {
  return codes.flatMap((code) => {
    const md = marketFile(code);
    if (!md) {
      console.warn(`No prompts/markets/${code.toLowerCase()}.md: Manus plans ${code} without market knowledge`);
      return [];
    }
    const filename = `market-${code.toLowerCase()}.md`;
    return [{ type: "file", filename, mime_type: "text/markdown", file_data: `data:text/markdown;base64,${Buffer.from(md).toString("base64")}` }];
  });
}
