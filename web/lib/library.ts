import fs from "node:fs";
import path from "node:path";
import { UPLOAD_DIR, writeJson } from "./store";
import { pool } from "./pool";
import type { LibraryItem, Scan, Source } from "./types";

// Brand libraries live in data/uploads/library/<handle>/.
// Each folder: images, carousel subfolders (one folder of images = one carousel post),
// optional manifest.json, and scan.json (scan snapshot, written once).
// Scraped brands are filled by lib/importer.ts. Image posts only: video files are ignored.
const LIB_DIR = path.join(UPLOAD_DIR, "library");
const IMAGE = /\.(jpe?g|png|webp)$/i;
const SKIP_DIRS = new Set(["thumbs"]);

// `file` = one image; `files` = carousel images (paths relative to the library folder).
export type ManifestEntry = {
  file?: string;
  files?: string[];
  caption?: string;
  views?: number;
  postedAt?: string;
  shortCode?: string; // scraped posts (lib/importer.ts)
  permalink?: string;
};

const isMedia = (f: string) => IMAGE.test(f);

const hasMedia = (dir: string) => fs.readdirSync(dir).some((f) => isMedia(f) || isCarouselDir(dir, f));

// The handle's folder, or null when it doesn't exist or has no images (e.g. every download of an import failed).
export function libraryFolder(handle: string): string | null {
  const own = path.join(LIB_DIR, handle);
  return fs.existsSync(own) && hasMedia(own) ? handle : null;
}

function isCarouselDir(dir: string, name: string) {
  const p = path.join(dir, name);
  return !SKIP_DIRS.has(name) && fs.statSync(p).isDirectory() && fs.readdirSync(p).some((f) => IMAGE.test(f));
}

const fileUrl = (folder: string, rel: string) =>
  `/api/files/library/${folder}/${rel.split("/").map(encodeURIComponent).join("/")}`;
const idOf = (rel: string) => rel.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_-]/g, "_");
const nameOf = (rel: string) => rel.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ");

// Without a manifest: every image file is a post, every subfolder of images is a carousel.
function discover(dir: string): ManifestEntry[] {
  const entries: ManifestEntry[] = [];
  for (const f of fs.readdirSync(dir).sort()) {
    if (isMedia(f)) entries.push({ file: f });
    else if (isCarouselDir(dir, f)) {
      const imgs = fs.readdirSync(path.join(dir, f)).filter((x) => IMAGE.test(x)).sort();
      entries.push({ files: imgs.map((x) => `${f}/${x}`), caption: nameOf(f) });
    }
  }
  return entries;
}

async function toItem(folder: string, dir: string, e: ManifestEntry, scans: Record<string, Scan>): Promise<LibraryItem> {
  const files = e.files ?? (e.file ? [e.file] : []);
  const first = files[0];
  const base = { caption: e.caption ?? nameOf(first), views: e.views ?? 0, postedAt: e.postedAt, permalink: e.permalink };

  const dir0 = path.dirname(first);
  const id = idOf(e.files && dir0 !== "." ? dir0 : first);
  const imageUrls = files.map((f) => fileUrl(folder, f));
  return { ...base, id, type: files.length > 1 ? "carousel" : "image", imageUrls, thumbUrl: imageUrls[0], scan: scans[id] };
}

// The brand's posts in stored order; scan results come from the snapshot if present.
export async function loadLibrary(source: Source, limit: number): Promise<{ items: LibraryItem[]; folder: string | null }> {
  const folder = libraryFolder(source.handle);
  if (!folder) return { items: [], folder: null };

  const dir = path.join(LIB_DIR, folder);
  const manifestFile = path.join(dir, "manifest.json");
  const manifest: ManifestEntry[] = fs.existsSync(manifestFile) ? JSON.parse(fs.readFileSync(manifestFile, "utf8")) : discover(dir);
  const entries = manifest
    .filter((e) => {
      const files = e.files ?? (e.file ? [e.file] : []);
      return files.length > 0 && files.every((f) => IMAGE.test(f) && fs.existsSync(path.join(dir, f)));
    })
    .slice(0, limit);
  const scans = readScans(folder);
  const items = await pool(entries, 4, (e) => toItem(folder, dir, e, scans));
  return { items, folder };
}

export function readScans(folder: string): Record<string, Scan> {
  const file = path.join(LIB_DIR, folder, "scan.json");
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
}

export function writeScan(folder: string, id: string, scan: Scan) {
  const file = path.join(LIB_DIR, folder, "scan.json");
  const all = readScans(folder);
  all[id] = scan;
  writeJson(file, all);
}
