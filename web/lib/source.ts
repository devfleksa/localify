import type { Platform, Source } from "./types";

// Accepts "instagram.com/brand", "https://www.tiktok.com/@brand", "@brand" (Instagram by default).
export function parseSource(input: string): Source | null {
  const raw = input.trim();
  if (!raw) return null;
  let platform: Platform = "instagram";
  let handle = raw;
  const m = raw.match(/(?:https?:\/\/)?(?:www\.|m\.)?(instagram\.com|tiktok\.com)\/@?([^/?#\s]+)/i);
  if (m) {
    platform = m[1].toLowerCase().startsWith("tiktok") ? "tiktok" : "instagram";
    handle = m[2];
  } else if (/\s|\//.test(raw)) {
    return null;
  }
  handle = handle.replace(/^@/, "").toLowerCase();
  if (!/^[a-z0-9._]{1,30}$/.test(handle)) return null;
  const url = platform === "tiktok" ? `https://www.tiktok.com/@${handle}` : `https://www.instagram.com/${handle}`;
  return { url, platform, handle };
}

export const PLATFORM_NAME: Record<Platform, string> = { instagram: "Instagram", tiktok: "TikTok" };
