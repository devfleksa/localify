// Exports finished jobs for the read-only replay (npm run build:showcase, GitHub Pages).
// Usage (from web/): node scripts/export-run.mjs <jobId> [<jobId>…]   (sidebar order = argument order)
// Writes showcase/runs/<id>.json, showcase/runs/index.json (what /api/jobs returns) and every file the jobs use
// into showcase/media/ (same paths as under data/uploads/, resized for the web). Replaces the previous export.
// URLs stay "/api/files/…"; the replay maps them to the media folder when it loads a job (lib/showcase.ts).
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const ids = process.argv.slice(2);
if (!ids.length) {
  console.error("Usage: node scripts/export-run.mjs <jobId> [<jobId>…]");
  process.exit(1);
}

const OUT = path.join("showcase");
const UPLOADS = path.join("data", "uploads");
const MAX_SIDE = 1280; // px; the full-screen viewer is the largest place an image is shown
const FILE_URL = /\/api\/files\/[^"\\]+/g;

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, "runs"), { recursive: true });

// Keys the replay doesn't need: Manus task links (private to the account that ran them).
const DROP = new Set(["link"]);
const clean = (v) =>
  Array.isArray(v)
    ? v.map(clean)
    : v && typeof v === "object"
      ? Object.fromEntries(Object.entries(v).filter(([k]) => !DROP.has(k)).map(([k, x]) => [k, clean(x)]))
      : v;

const files = new Set();
const index = [];
for (const id of ids) {
  const job = JSON.parse(fs.readFileSync(path.join("data", "jobs", `${id}.json`), "utf8"));
  if (job.status === "running" || job.status === "awaiting_review") throw new Error(`${id} is still ${job.status}; finish or stop it first`);
  if (job.auto) job.auto = { ...job.auto, running: false, stopping: false };
  const out = clean(job);
  const text = JSON.stringify(out);
  for (const url of text.match(FILE_URL) ?? []) files.add(url);
  const remote = text.match(/https:\/\/(?:v\d+\.)?fal\.media\/[^"\\]+/g);
  if (remote) console.warn(`${id}: ${remote.length} image(s) still on fal (they expire): ${remote[0]}`);
  fs.writeFileSync(path.join(OUT, "runs", `${id}.json`), text);
  const { title, status, createdAt, markets, source } = out;
  // Profile picture for the sidebar (saved by the account check; see avatarOf in lib/importer.ts).
  const avatar = fs.existsSync(path.join(UPLOADS, "avatars", `${source.handle}.jpg`)) ? `/api/files/avatars/${source.handle}.jpg` : undefined;
  if (avatar) files.add(avatar);
  index.push({ id, title, status, createdAt, markets, source, avatar });
}
fs.writeFileSync(path.join(OUT, "runs", "index.json"), JSON.stringify(index));

let before = 0;
let after = 0;
for (const url of files) {
  const rel = decodeURIComponent(url.slice("/api/files/".length));
  const src = path.join(UPLOADS, rel);
  const dst = path.join(OUT, "media", rel);
  if (!fs.existsSync(src)) throw new Error(`Missing file ${src} (used by an exported job)`);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  const img = sharp(src).rotate().resize(MAX_SIDE, MAX_SIDE, { fit: "inside", withoutEnlargement: true });
  const ext = path.extname(rel).toLowerCase();
  await (ext === ".png" ? img.png({ compressionLevel: 9 }) : ext === ".webp" ? img.webp({ quality: 82 }) : img.jpeg({ quality: 80, mozjpeg: true })).toFile(dst);
  before += fs.statSync(src).size;
  after += fs.statSync(dst).size;
}

const mb = (n) => `${(n / 1e6).toFixed(1)} MB`;
console.log(`Exported ${ids.length} job(s), ${files.size} files: ${mb(before)} → ${mb(after)} in ${OUT}/`);
