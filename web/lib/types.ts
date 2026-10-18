import type { MarketCode } from "./markets";

export type Mode = "auto" | "review";

export type JobStatus =
  | "running" // engine is working (scanning, planning or editing)
  | "ready" // library scanned, waiting for the user to pick a post
  | "awaiting_review" // plan ready, waiting for the user (Review mode)
  | "done" // at least one post localized; more can be picked
  | "failed";

export type Platform = "instagram" | "tiktok";

// The brand account the library comes from.
export type Source = { url: string; platform: Platform; handle: string };

// Tier A = text-level (reliable, cheap); Tier B = visual change: object/scene in the image (the wow).
export type Tier = "A" | "B";

// One localizable thing the scan found in a post (mirrors the JSON asked for in prompts/scan.md;
// what counts and how strong it is follows prompts/rules.md).
export type Strength = "must" | "strong" | "weak";
export type Finding = {
  type: "on_screen_text" | "price" | "cta" | "date" | "object" | "food" | "gesture" | "setting" | "other";
  what: string;
  slides?: number[]; // 1-based images it appears on
  slide?: number; // older scans (before 2026-10-14): one finding per slide
  why: string;
  strength?: Strength; // missing in older scans = "strong"
  review?: boolean; // people/clothing: shown for a human to check, never edited, doesn't flag a post on its own
  tier: Tier;
  markets: MarketCode[]; // markets where this needs a change
};

// `localizable` = the post has an editable must/strong finding for some market; whether it needs localizing for
// a job depends on the job's markets (lib/findings.ts). cost: real $ reported by fal. markets: the markets the scan
// prompt covered (missing in scans from before 2026-10-14 = the original six).
export type Scan = { summary: string; localizable: boolean; findings: Finding[]; cost?: number; markets?: MarketCode[] };

// Image posts only: a single image or a carousel of images. Reels and video slides are skipped
// at import (docs/decisions.md, "Image posts only").
export type PostType = "image" | "carousel";

// One post from the brand's library.
export type LibraryItem = {
  id: string;
  type: PostType;
  imageUrls?: string[]; // image (1) and carousel (2+) posts
  thumbUrl?: string;
  caption: string;
  views: number; // likes
  postedAt?: string;
  permalink?: string; // original post on Instagram (scraped posts)
  scan?: Scan; // missing until scanned
  scanError?: string; // the scan failed; the next run of this brand tries again (it isn't in scan.json)
};

// What a change card edits. "review" = people/clothing issue: shown to the user, never edited.
export type ChangeType = "background" | "object" | "text" | "price" | "cta" | "date" | "review";
export const VISUAL_TYPES: ChangeType[] = ["background", "object"];

// Where a visual change gets its look from: described in the prompt only (default), an AI reference image
// generated on demand, or the user's own upload.
export type RefSource = "prompt" | "ai" | "upload";

// One change card proposed by Manus for one market (mirrors the structured output in lib/engine/manus.ts).
export type Change = {
  id: string;
  type: ChangeType;
  slides: number[]; // 1-based slides this applies to; empty = every slide
  target: string; // what is in the image now (or the original text)
  replacement: string; // what it becomes (or the localized text)
  kind: "protect" | "resonate";
  reason: string;
  prompt: string; // Manus's instruction sentence for the image-edit model (visual cards)
  ref: RefSource;
  refUrl?: string; // AI reference or upload
  text?: string; // the user's own text for text-like cards (overrides `replacement`)
  skipped?: boolean;
};

export type MarketPlan = { market: MarketCode; changes: Change[] };

export type MarketResult = {
  market: MarketCode;
  pending?: number[]; // slides (1-based) being regenerated
  imageUrls?: string[];
  report: { kind: Change["kind"]; text: string; slides?: number[] }[]; // slides: as on the change (empty = every slide); missing in jobs before 2026-10-15
};

export type Message =
  | { id: string; at: number; kind: "user"; source: Source; limit: number; markets: MarketCode[]; mode: Mode }
  | { id: string; at: number; kind: "agent_text"; text: string; pending?: boolean; link?: { href: string; label: string } }
  | { id: string; at: number; kind: "plan"; itemId: string; plans: MarketPlan[]; approved: boolean }
  | { id: string; at: number; kind: "results"; itemId: string; postType: PostType; originalImages?: string[]; results: MarketResult[] }
  | { id: string; at: number; kind: "error"; text: string };

// What a job has spent so far (live): USD for Apify runs, fal scans and fal image edits/references;
// Manus bills in credits (task.detail credit_usage), shown next to the dollar total.
export type Costs = { apify: number; scan: number; edit: number; manusCredits: number };

export type Job = {
  id: string;
  createdAt: number;
  title: string;
  status: JobStatus;
  mode: Mode;
  markets: MarketCode[];
  source: Source;
  limit: number;
  library: LibraryItem[];
  selectedId?: string; // post currently being planned / localized
  auto?: AutoRun; // Auto mode's loop over every flagged post (missing until an Auto job starts)
  costs?: Costs; // missing on jobs from before 2026-10-14
  messages: Message[];
};

// Auto mode localizes every flagged post one after another, most liked first. done = post ids already tried
// (localized, nothing to change or failed); stopping = the user pressed Stop and the loop ends after the current step.
export type AutoRun = { running: boolean; stopping?: boolean; done: string[] };

// Review choices sent back by the PlanCard.
export type ReviewChoice = { changeId: string; skipped?: boolean; ref?: RefSource; refUrl?: string; text?: string };

export type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;
export type NewMessage = DistributiveOmit<Message, "id" | "at">;
