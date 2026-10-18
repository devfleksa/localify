import type { MarketCode } from "./markets";
import type { Finding, Job, LibraryItem, Scan, Strength } from "./types";

// Which scan findings count (prompts/rules.md): editable (not review-only) and must/strong, for the job's markets.
// Shared by the engine and the library panel so both flag the same posts.

const RANK: Record<Strength, number> = { must: 0, strong: 1, weak: 2 };
const strength = (f: Finding): Strength => f.strength ?? "strong";

export const isActionable = (f: Finding) => !f.review && strength(f) !== "weak";

// Findings that concern the job's markets, most important first (must → strong → weak; review items last).
export function relevantFindings(item: LibraryItem, markets: MarketCode[]): Finding[] {
  return (item.scan?.findings ?? [])
    .filter((f) => f.markets.some((m) => markets.includes(m)))
    .sort((a, b) => Number(!!a.review) - Number(!!b.review) || RANK[strength(a)] - RANK[strength(b)]);
}

// A post needs localizing for a job if it has at least one actionable finding for one of the job's markets.
export const needsLocalizing = (item: LibraryItem, markets: MarketCode[]) =>
  relevantFindings(item, markets).some(isActionable);

export const findingSlides = (f: Finding) => f.slides ?? (f.slide ? [f.slide] : []);
export const findingStrength = strength;

// Scans from before the market files (2026-10-14) don't record their markets: they covered the original six.
const LEGACY_MARKETS: MarketCode[] = ["US", "TR", "JP", "SA", "IN", "BR"];
export const scanCovers = (scan: Scan, markets: MarketCode[]) => markets.every((m) => (scan.markets ?? LEGACY_MARKETS).includes(m));

// Auto mode's to-do list: flagged posts not tried yet and not localized by hand, most liked first.
export const autoQueue = (job: Job): LibraryItem[] =>
  job.library
    .filter(
      (i) =>
        needsLocalizing(i, job.markets) &&
        !job.auto?.done.includes(i.id) &&
        !job.messages.some((m) => m.kind === "results" && m.itemId === i.id),
    )
    .sort((a, b) => b.views - a.views);
