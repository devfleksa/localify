import type { LibraryItem } from "./types";

// Image posts: fal openrouter/router/vision with google/gemini-2.5-flash, billed per token.
// Measured 2026-10-12: 4-image carousel = $0.0024 (~$0.0006 per image). Real runs report usage.cost.
export const IMAGE_SCAN_COST_ESTIMATE = 0.0006;

export function scanCost(item: LibraryItem): number {
  if (item.scan?.cost !== undefined) return item.scan.cost;
  return (item.imageUrls?.length || (item.type === "carousel" ? 4 : 1)) * IMAGE_SCAN_COST_ESTIMATE;
}

export const POST_NOUN: Record<LibraryItem["type"], string> = { image: "image post", carousel: "carousel" };

// Scan costs are fractions of a cent per image: show 4 decimals below $0.10.
export const usd = (n: number) => `$${n.toFixed(n < 0.1 ? 4 : 2)}`;
