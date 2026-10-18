import fs from "node:fs";
import path from "node:path";
import { fal } from "@fal-ai/client";
import { UPLOAD_DIR, newId } from "./store";
import { isActionable } from "./findings";
import { MARKETS } from "./markets";
import { scanPrompt } from "./prompts.mjs";
import type { Scan } from "./types";

// fal calls used by the engine (scan, edit, reference images); see docs/architecture.md.
fal.config({ credentials: process.env.FAL_KEY });

const VISION = "openrouter/router/vision";
const VISION_MODEL = "google/gemini-2.5-flash";
const EDIT = "fal-ai/nano-banana-pro/edit";
const IMAGE = "fal-ai/nano-banana-pro";
// A fal call that hasn't answered after this long is given up (fal's own `timeout` option isn't enforced);
// a hung edit once kept a job "running" for good. Edits normally take ~25 s.
const timeout = () => AbortSignal.timeout(3 * 60_000);

// Image prices from fal's pricing API (USD per image), fetched once; $0.15 = listed price on 2026-10-14.
const PRICE_FALLBACK = 0.15;
const g = globalThis as unknown as { __falPrices?: Promise<Record<string, number>>; __falUrls?: Map<string, string> };
function prices(): Promise<Record<string, number>> {
  g.__falPrices ??= fetch(`https://api.fal.ai/v1/models/pricing?endpoint_id=${EDIT}&endpoint_id=${IMAGE}`, {
    headers: { Authorization: `Key ${process.env.FAL_KEY}` },
  })
    .then((r) => r.json())
    .then((d: { prices?: { endpoint_id: string; unit_price: number }[] }) =>
      Object.fromEntries((d.prices ?? []).map((p) => [p.endpoint_id, p.unit_price])),
    )
    .catch(() => {
      g.__falPrices = undefined; // retry next time
      return {};
    });
  return g.__falPrices;
}
export const editPrice = async () => (await prices())[EDIT] ?? PRICE_FALLBACK;
export const referencePrice = async () => (await prices())[IMAGE] ?? PRICE_FALLBACK;

const TYPES: Record<string, string> = { ".png": "image/png", ".webp": "image/webp" };

// fal can't reach localhost: app files (/api/files/...) are uploaded to fal storage once per process.
const cache = (g.__falUrls ??= new Map());

// Local file behind an app URL (/api/files/...).
function localFile(appUrl: string): string {
  const rel = appUrl.replace(/^\/api\/files\//, "").split("/").map(decodeURIComponent);
  const file = path.join(UPLOAD_DIR, ...rel);
  if (!file.startsWith(UPLOAD_DIR)) throw new Error("Bad file path");
  return file;
}

export async function falUrl(appUrl: string): Promise<string> {
  if (/^https?:\/\//.test(appUrl)) return appUrl;
  const hit = cache.get(appUrl);
  if (hit) return hit;
  const file = localFile(appUrl);
  const type = TYPES[path.extname(file).toLowerCase()] ?? "image/jpeg";
  const url = await fal.storage.upload(new Blob([fs.readFileSync(file)], { type }));
  cache.set(appUrl, url);
  return url;
}

// fal output URLs expire, so generated images are saved under data/uploads/<folder>/ and served by the app.
// The fal URL is remembered, so using the image again (e.g. a reference in an edit) doesn't upload it twice.
// If the download fails the fal URL is kept: the result still shows now, it just won't last.
async function keepLocal(falImage: string, folder: string): Promise<string> {
  try {
    const res = await fetch(falImage, { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const dir = path.join(UPLOAD_DIR, folder);
    fs.mkdirSync(dir, { recursive: true });
    const name = `${newId()}.jpg`;
    fs.writeFileSync(path.join(dir, name), Buffer.from(await res.arrayBuffer()));
    const appUrl = `/api/files/${folder}/${name}`;
    cache.set(appUrl, falImage);
    return appUrl;
  } catch (e) {
    console.error("saving fal image failed, keeping the fal URL", falImage, e);
    return falImage;
  }
}

// Aspect ratios the edit model accepts (fal OpenAPI schema, 2026-10-14).
const RATIOS = ["21:9", "16:9", "3:2", "4:3", "5:4", "1:1", "4:5", "3:4", "2:3", "9:16"] as const;
type Ratio = (typeof RATIOS)[number] | "auto";

// Width/height from a JPEG, PNG or WebP header; null if unknown.
function imageSize(b: Buffer): { w: number; h: number } | null {
  if (b.readUInt32BE(0) === 0x89504e47) return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  if (b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP") {
    const chunk = b.toString("ascii", 12, 16);
    if (chunk === "VP8 ") return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
    if (chunk === "VP8L") {
      const bits = b.readUInt32LE(21);
      return { w: (bits & 0x3fff) + 1, h: ((bits >> 14) & 0x3fff) + 1 };
    }
    if (chunk === "VP8X") return { w: b.readUIntLE(24, 3) + 1, h: b.readUIntLE(27, 3) + 1 };
    return null;
  }
  if (b[0] !== 0xff || b[1] !== 0xd8) return null;
  for (let i = 2; i + 9 < b.length; ) {
    if (b[i] !== 0xff) return null;
    const marker = b[i + 1];
    // SOF0–SOF15 (not DHT C4, JPG C8, DAC CC) carry the frame size.
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
    i += 2 + b.readUInt16BE(i + 2);
  }
  return null;
}

// The original's aspect ratio for the edit model (it would otherwise pick its own and squeeze ad frames);
// "auto" if the image is not an app file or no supported ratio is within 3% (e.g. 1.91:1 landscape posts).
function aspectRatio(appUrl: string): Ratio {
  if (/^https?:\/\//.test(appUrl)) return "auto";
  try {
    const size = imageSize(fs.readFileSync(localFile(appUrl)));
    if (!size?.w || !size.h) return "auto";
    const r = size.w / size.h;
    const [best] = RATIOS.map((s) => {
      const [a, b] = s.split(":").map(Number);
      return { s, off: Math.abs(a / b / r - 1) };
    }).sort((x, y) => x.off - y.off);
    return best.off <= 0.03 ? best.s : "auto";
  } catch {
    return "auto";
  }
}

// The vision model sometimes writes slightly broken JSON (seen 2026-10-14: a trailing comma in 1 of 90 posts).
// Parse leniently: keep only the outer {...}, drop trailing commas. Throws if it still doesn't parse.
function parseScan(output: string): Scan {
  const body = output.slice(output.indexOf("{"), output.lastIndexOf("}") + 1);
  let json: Scan;
  try {
    json = JSON.parse(body) as Scan;
  } catch {
    json = JSON.parse(body.replace(/,(\s*[}\]])/g, "$1")) as Scan;
  }
  const findings = json.findings ?? [];
  // Don't trust the model's own flag: localizable = at least one editable must/strong finding.
  return { summary: json.summary ?? "", findings, localizable: findings.some(isActionable) };
}

// Scans for every supported market (prompts/scan.md + rules.md + each market's Protect rules), so the cached scan
// serves any job.
export async function scanImages(appUrls: string[]): Promise<Scan> {
  const image_urls = await Promise.all(appUrls.map(falUrl));
  const markets = MARKETS.map((m) => m.code);
  const prompt = scanPrompt(markets);
  const run = async (temperature: number) => {
    const { data } = await fal.subscribe(VISION, { input: { model: VISION_MODEL, prompt, image_urls, temperature }, abortSignal: timeout() });
    return data as { output: string; usage?: { cost?: number } };
  };
  const first = await run(0);
  try {
    return { ...parseScan(first.output), cost: first.usage?.cost, markets };
  } catch {
    // Same input at temperature 0 gives the same broken output, so retry once with a little randomness.
    const second = await run(0.3);
    return { ...parseScan(second.output), cost: (first.usage?.cost ?? 0) + (second.usage?.cost ?? 0), markets };
  }
}

// Edits one slide. refs = reference images (already described in the prompt as image 2, 3…).
export async function editImage(appUrl: string, prompt: string, refs: string[] = []): Promise<string> {
  const image_urls = await Promise.all([appUrl, ...refs].map(falUrl));
  const { data } = await fal.subscribe(EDIT, {
    input: { prompt, image_urls, aspect_ratio: aspectRatio(appUrl), output_format: "jpeg", seed: Math.floor(Math.random() * 1e9) },
    abortSignal: timeout(),
  });
  const url = (data as { images?: { url: string }[] }).images?.[0]?.url;
  if (!url) throw new Error("Image edit returned no image");
  return keepLocal(url, "results");
}

// On-demand AI reference image for a visual change card. like = the slide whose aspect ratio it copies
// (backgrounds, so the place is framed like the photo it goes into); objects are square.
export async function referenceImage(prompt: string, like?: string): Promise<string> {
  const ratio = like ? aspectRatio(like) : "1:1";
  const { data } = await fal.subscribe(IMAGE, {
    input: { prompt, aspect_ratio: ratio === "auto" ? "1:1" : ratio, output_format: "jpeg" },
    abortSignal: timeout(),
  });
  const url = (data as { images?: { url: string }[] }).images?.[0]?.url;
  if (!url) throw new Error("Reference image generation returned no image");
  return keepLocal(url, "references");
}
