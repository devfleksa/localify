// Test the fal scanners on posts from a library folder.
// Usage (from web/): node --env-file=.env.local scripts/scan-test.mjs <handle> [model=google/gemini-2.5-flash]
// Uploads each image post / carousel to fal storage (fal can't reach localhost) and runs the app's scan prompt
// (prompts/scan.md + rules.md + every prompts/markets/<code>.md, built by lib/prompts.mjs)
// on openrouter/router/vision (model arg). Prints the parsed JSON + cost. Does not write scan.json.
import fs from "node:fs";
import path from "node:path";
import { fal } from "@fal-ai/client";
import { marketCodes, scanPrompt } from "../lib/prompts.mjs";

const folder = process.argv[2];
if (!folder) {
  console.error("Usage: node --env-file=.env.local scripts/scan-test.mjs <handle> [model]  (an imported folder in data/uploads/library/)");
  process.exit(1);
}
const model = process.argv[3] ?? "google/gemini-2.5-flash";
const dir = path.join("data/uploads/library", folder);
const prompt = scanPrompt(marketCodes());
fal.config({ credentials: process.env.FAL_KEY });

const IMAGE = /\.(jpe?g|png|webp)$/i;
const manifestFile = path.join(dir, "manifest.json");
const posts = fs.existsSync(manifestFile)
  ? JSON.parse(fs.readFileSync(manifestFile, "utf8")).map((e) => e.files ?? [e.file])
  : fs.readdirSync(dir).filter((f) => IMAGE.test(f)).map((f) => [f]);

const parse = (out) => {
  try {
    return JSON.parse(out.replace(/^```(?:json)?\s*|\s*```$/g, ""));
  } catch {
    return null;
  }
};

let total = 0;
for (const files of posts.filter((p) => p.every((f) => IMAGE.test(f)))) {
  const urls = [];
  for (const f of files) {
    const type = f.endsWith(".png") ? "image/png" : f.endsWith(".webp") ? "image/webp" : "image/jpeg";
    urls.push(await fal.storage.upload(new Blob([fs.readFileSync(path.join(dir, f))], { type })));
  }
  const t0 = Date.now();
  const { data } = await fal.subscribe("openrouter/router/vision", {
    input: { model, prompt, image_urls: urls, temperature: 0 },
  });
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  const cost = data.usage?.cost ?? 0;
  total += cost;
  console.log(`\n=== ${files.length} image(s): ${files[0]}${files.length > 1 ? " …" : ""}`);
  console.log(`model ${model} · ${secs}s · cost $${cost} · tokens ${JSON.stringify(data.usage ?? {})}`);
  const json = parse(data.output);
  console.log(json ? JSON.stringify(json, null, 2) : "NOT VALID JSON:\n" + data.output);
}
console.log(`\nTotal cost: $${total.toFixed(5)}`);
