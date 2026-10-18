import fs from "node:fs";
import path from "node:path";
import { UPLOAD_DIR, writeJson } from "./store";
import { oneAtATime, pool } from "./pool";
import type { ScrapedPost } from "./apify";
import type { ManifestEntry } from "./library";

// Downloads scraped posts into data/uploads/library/<handle>/ in the folder format lib/library.ts reads:
// image → <code>.jpg, carousel → <code>/01.jpg… plus manifest.json (newest first). Image posts only.
// Instagram media URLs expire within hours, so this runs right after the scrape.
// Incremental: posts already in the manifest (by shortCode) are not downloaded again.

const LIB_DIR = path.join(UPLOAD_DIR, "library");

async function download(url: string, file: string, tries = 3): Promise<void> {
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
      return;
    } catch (e) {
      if (i >= tries) throw e;
      await new Promise((r) => setTimeout(r, 1000 * i));
    }
  }
}

// Downloads one image post (single image or carousel image slides); returns its manifest entry.
async function savePost(dir: string, p: ScrapedPost): Promise<ManifestEntry> {
  const { slides } = p;
  const base = {
    caption: p.caption || p.shortCode,
    views: p.likes,
    postedAt: p.timestamp?.slice(0, 10),
    shortCode: p.shortCode,
    permalink: p.url,
  };
  if (slides.length === 1) {
    const file = `${p.shortCode}.jpg`;
    await download(slides[0], path.join(dir, file));
    return { ...base, file };
  }
  const files = slides.map((_, i) => `${p.shortCode}/${String(i + 1).padStart(2, "0")}.jpg`);
  await pool(slides, 3, (url, i) => download(url, path.join(dir, files[i])));
  return { ...base, files };
}

export type ImportResult = { added: number; skipped: number; failed: { shortCode: string; error: string }[] };

// One import per handle at a time: each one reads manifest.json, downloads for a while, then writes it back,
// so two overlapping imports of the same brand would each drop the other's new entries. The next import waits
// for the previous one and then sees its posts as already known (no double downloads).
export function importPosts(
  handle: string,
  posts: ScrapedPost[],
  onProgress: (done: number, total: number) => void,
): Promise<ImportResult> {
  return oneAtATime("import", handle, () => importNow(handle, posts, onProgress));
}

async function importNow(
  handle: string,
  posts: ScrapedPost[],
  onProgress: (done: number, total: number) => void,
): Promise<ImportResult> {
  const dir = path.join(LIB_DIR, handle);
  fs.mkdirSync(dir, { recursive: true });
  const manifestFile = path.join(dir, "manifest.json");
  const existing: ManifestEntry[] = fs.existsSync(manifestFile) ? JSON.parse(fs.readFileSync(manifestFile, "utf8")) : [];
  const known = new Set(existing.map((e) => e.shortCode).filter(Boolean));

  const todo = posts.filter((p) => !known.has(p.shortCode));
  const added: ManifestEntry[] = [];
  const failed: ImportResult["failed"] = [];
  let done = 0;
  await pool(todo, 4, async (p) => {
    try {
      added.push(await savePost(dir, p));
    } catch (e) {
      failed.push({ shortCode: p.shortCode, error: (e as Error).message });
    }
    onProgress(++done, todo.length);
  });

  // Refresh caption/views of known posts; keep everything sorted newest first.
  const fresh = new Map(posts.map((p) => [p.shortCode, p]));
  const merged = [...existing, ...added].map((e) => {
    const p = e.shortCode ? fresh.get(e.shortCode) : undefined;
    return p ? { ...e, views: p.likes, caption: p.caption || e.caption } : e;
  });
  merged.sort((a, b) => (b.postedAt ?? "").localeCompare(a.postedAt ?? ""));
  writeJson(manifestFile, merged); // atomic: a crash mid-write never leaves a half-written manifest
  return { added: added.length, skipped: posts.length - todo.length, failed };
}

// The saved profile picture of a handle (app URL), if there is one.
export function avatarOf(handle: string): string | undefined {
  return fs.existsSync(path.join(UPLOAD_DIR, "avatars", `${handle}.jpg`)) ? `/api/files/avatars/${handle}.jpg` : undefined;
}

// Saves the profile picture locally (Instagram CDN images can't be hotlinked). Returns an app URL.
export async function saveAvatar(handle: string, url?: string): Promise<string | undefined> {
  if (!url) return undefined;
  const file = path.join(UPLOAD_DIR, "avatars", `${handle}.jpg`);
  try {
    await download(url, file, 2);
    return `/api/files/avatars/${handle}.jpg?v=${Date.now()}`;
  } catch {
    return undefined;
  }
}
