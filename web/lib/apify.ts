// Instagram intake through Apify actors (user's own APIFY_TOKEN).
// Profile: apify/instagram-profile-scraper. Posts: instagram-scraper/fast-instagram-post-scraper
// (apify/instagram-post-scraper stops at 12 posts: Instagram blocks its feed paging, seen 2026-10-14).
// Field names follow the actors' dataset output (checked 2026-10-14); anything missing is treated as optional.
// Image posts only: Reels/video posts and video slides inside carousels are dropped here.

import { oneAtATime } from "./pool";

const API = "https://api.apify.com/v2";
const PROFILE_ACTOR = "apify~instagram-profile-scraper";
const POSTS_ACTOR = "instagram-scraper~fast-instagram-post-scraper";

export type Profile = {
  handle: string;
  fullName: string;
  bio: string;
  followers: number;
  posts: number;
  verified: boolean;
  private: boolean;
  avatarUrl?: string; // Instagram CDN, expires; the profile route saves a local copy
  imageShare?: number; // share of image posts among the latest posts (the actor returns ~12); sizes the scrape
};

// Verified profiles, kept 10 minutes: the profile route answers repeat checks from here (each check is a
// paid actor run), and the scrape reads imageShare from here.
const PROFILE_TTL = 10 * 60 * 1000;
const g = globalThis as unknown as { __profiles?: Map<string, { at: number; profile: Profile }> };
const profiles = (g.__profiles ??= new Map());
export const rememberProfile = (profile: Profile) => profiles.set(profile.handle, { at: Date.now(), profile });
// USD of profile checks not yet billed to a job (resolves once Apify settles the charge).
const gc = globalThis as unknown as { __checkCosts?: Map<string, Promise<number>> };
const checkCosts = (gc.__checkCosts ??= new Map());
// The account check runs before a job exists; the job that follows pays for it (once).
export function takeCheckCost(handle: string): Promise<number> {
  const cost = checkCosts.get(handle) ?? Promise.resolve(0);
  checkCosts.delete(handle);
  return cost;
}
export function knownProfile(handle: string): Profile | undefined {
  const hit = profiles.get(handle);
  return hit && Date.now() - hit.at < PROFILE_TTL ? hit.profile : undefined;
}

// One image post, normalized from the posts actor. `slides` = image URLs (1 = single image).
export type ScrapedPost = {
  shortCode: string;
  url: string;
  caption: string;
  likes: number;
  timestamp?: string;
  slides: string[];
};

export class ApifyError extends Error {}

export const hasApify = () => Boolean(process.env.APIFY_TOKEN);

type EventPrice = { isPrimaryEvent?: boolean; eventPriceUsd?: number; eventTieredPricingUsd?: Record<string, { tieredEventPriceUsd: number }> };
type Run = {
  id: string;
  status: string;
  defaultDatasetId: string;
  usageTotalUsd?: number;
  statusMessage?: string;
  pricingInfo?: { pricingPerEvent?: { actorChargeEvents?: Record<string, EventPrice> } };
};

// Least a pay-per-event run can cost for `n` results: n × the primary event's cheapest tier price.
function resultFloor(run: Run, n: number): number {
  const primary = Object.values(run.pricingInfo?.pricingPerEvent?.actorChargeEvents ?? {}).find((e) => e.isPrimaryEvent);
  const tiers = Object.values(primary?.eventTieredPricingUsd ?? {}).map((t) => t.tieredEventPriceUsd);
  return n * (primary?.eventPriceUsd ?? (tiers.length ? Math.min(...tiers) : 0));
}

// Starts an actor run, waits for it, and returns its dataset items plus what the run cost (usageTotalUsd).
// The charge settles ~10 s after the run ends (seen 2026-10-14), so `cost` resolves later, in the background.
async function runActor<T>(actor: string, input: object, timeoutSec: number): Promise<{ items: T[]; cost: Promise<number> }> {
  const token = process.env.APIFY_TOKEN;
  if (!token) throw new ApifyError("APIFY_TOKEN is not set (see web/.env.example)");
  const name = actor.split("~")[1];
  const call = async <R>(pathname: string, init: RequestInit = {}): Promise<R> => {
    const res = await fetch(`${API}/${pathname}`, {
      ...init,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...init.headers },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      const msg = body.match(/"message"\s*:\s*"([^"]+)"/)?.[1] ?? `HTTP ${res.status}`;
      throw new ApifyError(`Apify ${name}: ${msg}`);
    }
    return (await res.json()) as R;
  };

  // waitForFinish is capped at 60 s per request, so long runs are polled.
  let run = (await call<{ data: Run }>(`acts/${actor}/runs?timeout=${timeoutSec}&waitForFinish=60`, { method: "POST", body: JSON.stringify(input) })).data;
  const deadline = Date.now() + (timeoutSec + 60) * 1000;
  while (["READY", "RUNNING"].includes(run.status) && Date.now() < deadline)
    run = (await call<{ data: Run }>(`actor-runs/${run.id}?waitForFinish=60`)).data;
  if (run.status !== "SUCCEEDED") throw new ApifyError(`Apify ${name}: run ${run.status.toLowerCase()}${run.statusMessage ? ` (${run.statusMessage})` : ""}`);

  const items = await call<T[]>(`datasets/${run.defaultDatasetId}/items?clean=true&format=json`);
  const floor = resultFloor(run, items.length);
  return { items, cost: settledCost(run.id, floor, (pathname) => call<{ data: Run }>(pathname)) };
}

// Polls a finished run until usageTotalUsd covers its results (the start fee is billed first, the
// per-result fees seconds later) and is unchanged on two reads; max ~40 s. Never reports below `floor`.
async function settledCost(runId: string, floor: number, get: (pathname: string) => Promise<{ data: Run }>): Promise<number> {
  let last = -1;
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const usd = (await get(`actor-runs/${runId}`).catch(() => null))?.data.usageTotalUsd ?? 0;
    if (usd > 0 && usd >= floor * 0.99 && usd === last) return usd;
    last = usd;
  }
  return Math.max(last, floor);
}

type RawProfile = {
  username?: string;
  fullName?: string;
  biography?: string;
  followersCount?: number;
  postsCount?: number;
  verified?: boolean;
  private?: boolean;
  profilePicUrlHD?: string;
  profilePicUrl?: string;
  latestPosts?: { type?: string; childPosts?: { type?: string }[] }[];
  error?: string;
};

// null = the account doesn't exist.
export async function getProfile(handle: string): Promise<Profile | null> {
  const { items, cost } = await runActor<RawProfile>(PROFILE_ACTOR, { usernames: [handle] }, 120);
  checkCosts.set(handle, cost);
  const [p] = items;
  if (!p || p.error || !p.username) return null;
  return {
    handle: p.username.toLowerCase(),
    fullName: p.fullName ?? "",
    bio: p.biography ?? "",
    followers: p.followersCount ?? 0,
    posts: p.postsCount ?? 0,
    verified: Boolean(p.verified),
    private: Boolean(p.private),
    avatarUrl: p.profilePicUrlHD || p.profilePicUrl,
    imageShare: p.latestPosts?.length
      ? p.latestPosts.filter((x) => x.type === "Image" || (x.type === "Sidecar" && x.childPosts?.some((c) => c.type !== "Video"))).length /
        p.latestPosts.length
      : undefined,
  };
}

type Candidate = { url: string; width?: number; height?: number };
type RawMedia = { media_type?: number; image_versions2?: { candidates?: Candidate[] } };
type RawPost = {
  shortcode?: string;
  type?: string; // "Image" | "Video"
  product_type?: string; // "feed" | "carousel_container" | "clips"
  post_url?: string;
  caption?: string | null;
  like_count?: number | null;
  date?: string;
  images?: Candidate[];
  carousel_media?: RawMedia[] | null;
};

// Instagram lists each image in many sizes and crops. Keep the original's aspect ratio (the first, largest
// candidate) and take the biggest one at most 1440 px wide (full-size originals can be 4096 px).
function bestUrl(cands: Candidate[] = []): string | undefined {
  const first = cands[0];
  if (!first?.width || !first.height) return first?.url;
  const ratio = first.width / first.height;
  const same = cands.filter((c) => c.width && c.height && Math.abs(c.width / c.height - ratio) < 0.01);
  return (same.filter((c) => c.width! <= 1440).sort((a, b) => b.width! - a.width!)[0] ?? first).url;
}

// null = a Reel/video post, or a carousel without image slides.
function normalize(p: RawPost): ScrapedPost | null {
  if (!p.shortcode || p.type === "Video" || p.product_type === "clips") return null;
  const slides =
    p.product_type === "carousel_container"
      ? (p.carousel_media ?? []).filter((m) => m.media_type === 1).map((m) => bestUrl(m.image_versions2?.candidates))
      : [bestUrl(p.images)];
  const urls = slides.filter((u): u is string => Boolean(u));
  if (!urls.length) return null;
  return {
    shortCode: p.shortcode,
    url: p.post_url ?? `https://www.instagram.com/p/${p.shortcode}/`,
    caption: (p.caption ?? "").trim(),
    likes: p.like_count ?? 0,
    timestamp: p.date,
    slides: urls,
  };
}

// Latest `limit` image posts, newest first. The actor's limit counts Reels too (each one is billed), so the
// first run is sized by the image share from the verified profile's latest posts: limit / share + 20%,
// between limit + 5 and 2× (12 posts are a noisy sample, so it only ever saves; without a profile: 2×).
// If that's short and the account has more posts, one more run sized by the image share seen so far
// (at most 6× or 500 posts). `scanned` = how many recent posts were looked at; `capped` = the actor
// returned fewer posts than asked (the account has no more, or Instagram blocked it).
// One scrape per handle at a time: two simultaneous runs for one profile made Instagram cut one off, and the
// actor's own retry then returned 1 of 24 posts as a success (run ruhuChcrewhVuc7KX, 2026-10-15).
export function getImagePosts(handle: string, limit: number): ReturnType<typeof scrapeImagePosts> {
  return oneAtATime("scrape", handle, () => scrapeImagePosts(handle, limit));
}

async function scrapeImagePosts(handle: string, limit: number): Promise<{ posts: ScrapedPost[]; scanned: number; videos: number; capped: boolean; cost: Promise<number> }> {
  const costs: Promise<number>[] = [];
  // A run can end "succeeded" with only part of the posts (the actor's retry after an Instagram cut-off loses
  // them). A short result is retried when the account has more posts (verified profile), up to 2 more runs,
  // keeping the biggest. Without a profile: one retry; the same count twice means the account has no more.
  const total = knownProfile(handle)?.posts;
  const fetchPosts = async (n: number) => {
    let best: RawPost[] = [];
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt) console.warn(`[apify] @${handle}: got ${best.length} of ${n} posts, retrying the scrape (${attempt}/2)`);
      const run = await runActor<RawPost>(POSTS_ACTOR, { instagramUsernames: [handle], postsPerProfile: n }, 300);
      costs.push(run.cost);
      const items = run.items.filter((p) => p.shortcode);
      if (items.length > best.length) best = items;
      if (best.length >= n || (total !== undefined && best.length >= total) || (total === undefined && attempt >= 1)) break;
    }
    return best.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  };

  const share = knownProfile(handle)?.imageShare;
  let fetched = share ? Math.min(Math.max(Math.ceil((limit / share) * 1.2), limit + 5), limit * 2) : limit * 2;
  let items = await fetchPosts(fetched);
  let posts = items.map(normalize).filter((p): p is ScrapedPost => p !== null);
  if (posts.length < limit && items.length >= fetched) {
    const seen = Math.max(posts.length / items.length, 0.1);
    fetched = Math.min(Math.ceil((limit / seen) * 1.3), limit * 6, 500);
    if (fetched > items.length) {
      items = await fetchPosts(fetched);
      posts = items.map(normalize).filter((p): p is ScrapedPost => p !== null);
    }
  }
  return { posts: posts.slice(0, limit), scanned: items.length, videos: items.length - posts.length, capped: items.length < fetched, cost: Promise.all(costs).then((c) => c.reduce((a, b) => a + b, 0)) };
}
