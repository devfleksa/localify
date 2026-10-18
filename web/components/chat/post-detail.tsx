"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, ArrowUpRight, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Filmstrip, SlideStage } from "./slide-stage";
import { market, type MarketCode } from "@/lib/markets";
import { findingSlides, findingStrength, isActionable, needsLocalizing, relevantFindings } from "@/lib/findings";
import { cn } from "@/lib/utils";
import { IS_SHOWCASE } from "@/lib/showcase";
import type { Finding, LibraryItem } from "@/lib/types";

export const FINDING_LABEL: Record<Finding["type"], string> = {
  on_screen_text: "Text",
  price: "Price",
  cta: "Call to action",
  date: "Date",
  object: "Object",
  food: "Food",
  gesture: "Gesture",
  setting: "Place",
  other: "Theme",
};

const STRENGTH: Record<string, string> = { must: "Must change", strong: "Should change", weak: "Optional" };

// One post, opened from the library: the slides large (a real carousel), what the scan found on each slide,
// and the one action: localize it.
export function PostDetail({
  item,
  markets,
  blocked,
  done,
  onClose,
  onLocalize,
}: {
  item: LibraryItem;
  markets: MarketCode[];
  blocked?: string; // why it can't be localized right now (scanning, another post running, plan open, run stopped)
  done: boolean;
  onClose: () => void;
  onLocalize: () => void;
}) {
  const [slide, setSlide] = useState(0);
  const [starting, setStarting] = useState(false);
  const urls = item.imageUrls?.length ? item.imageUrls : item.thumbUrl ? [item.thumbUrl] : [];
  const findings = relevantFindings(item, markets);
  const flag = needsLocalizing(item, markets);
  const onSlide = (f: Finding) => {
    const s = findingSlides(f);
    return s.length === 0 || s.includes(slide + 1);
  };

  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);

  const action = !item.scan
    ? "Waiting for the scan"
    : !flag
      ? "Nothing to localize"
      : blocked
        ? blocked
        : done
          ? "Localize again"
          : `Localize for ${markets.length} ${markets.length === 1 ? "market" : "markets"}`;

  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-raised animate-in fade-in slide-in-from-right-6 duration-300" role="dialog" aria-label="Post">
      <div className="flex items-center justify-between gap-2 px-3 py-3">
        <Button variant="ghost" size="sm" onClick={onClose}>
          <ArrowLeft /> Library
        </Button>
        {item.permalink && (
          <a
            href={item.permalink}
            target="_blank"
            rel="noreferrer"
            className="press inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-sm text-muted-foreground hover:bg-lift hover:text-foreground"
          >
            On Instagram <ArrowUpRight className="size-3.5" />
          </a>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6">
        <div className="mx-auto max-w-md">
          <SlideStage count={urls.length} index={slide} onIndex={setSlide} className="overflow-hidden rounded-xl">
            {urls[slide] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={urls[slide]} alt={`Slide ${slide + 1}`} className="aspect-[4/5] w-full bg-deep object-contain" />
            ) : (
              <div className="aspect-[4/5] w-full bg-deep" />
            )}
          </SlideStage>
          <Filmstrip
            srcs={urls}
            index={slide}
            onIndex={setSlide}
            marked={urls.map((_, i) => findings.some((f) => isActionable(f) && findingSlides(f).includes(i + 1)))}
            className="mt-2"
          />
        </div>

        <p className="mt-5 text-[15px] leading-relaxed whitespace-pre-line text-foreground/90 line-clamp-4" dir="auto">
          {item.caption || "No caption"}
        </p>
        <p className="mt-1 text-[13px] text-muted-foreground tabular-nums">
          {item.views.toLocaleString("en")} likes
          {item.postedAt && ` · ${new Date(item.postedAt).toLocaleDateString("en", { day: "numeric", month: "short", year: "numeric" })}`}
        </p>

        {item.scan && (
          <div className="mt-6 space-y-4">
            <p className="text-[15px] leading-relaxed text-foreground/80">{item.scan.summary}</p>
            {findings.length > 0 && (
              <>
                <p className="text-sm text-muted-foreground">
                  What the scan found{urls.length > 1 ? `, slide ${slide + 1} first` : ""}
                </p>
                <ul className="space-y-2">
                  {[...findings]
                    .sort((a, b) => Number(onSlide(b)) - Number(onSlide(a)))
                    .map((f, i) => (
                      <li
                        key={i}
                        className={cn("rise rounded-xl bg-lift/50 px-4 py-3 transition-opacity", !onSlide(f) && "opacity-50")}
                        style={{ "--i": i } as React.CSSProperties}
                      >
                        <p className="flex flex-wrap items-center gap-x-2.5 text-[13px] text-muted-foreground">
                          <span
                            className={cn(
                              "font-medium",
                              f.review ? "text-protect" : f.tier === "B" ? "text-resonate" : "text-textual",
                            )}
                          >
                            {f.review ? "A person decides" : FINDING_LABEL[f.type]}
                          </span>
                          {!f.review && <span>{STRENGTH[findingStrength(f)]}</span>}
                          {findingSlides(f).length > 0 && urls.length > 1 && <span>slide {findingSlides(f).join(", ")}</span>}
                          <span className="ml-auto tracking-tight">
                            {f.markets.filter((m) => markets.includes(m)).map((m) => market(m).flag).join("")}
                          </span>
                        </p>
                        <p className="mt-1 text-[15px] font-medium" dir="auto">{f.what}</p>
                        <p className="mt-0.5 text-sm leading-relaxed text-foreground/70">{f.why}</p>
                      </li>
                    ))}
                </ul>
              </>
            )}
          </div>
        )}
        {!item.scan && item.scanError && <p className="mt-6 text-[15px] text-destructive">The scan failed for this post. The next run of this brand tries again.</p>}
      </div>

      <div className="bg-raised px-5 py-4">
        <Button
          size="lg"
          className="w-full"
          disabled={!!blocked || !flag || starting}
          onClick={() => {
            if (!IS_SHOWCASE) setStarting(true); // the replay only shows the read-only hint
            onLocalize();
          }}
        >
          {starting ? <Loader2 className="animate-spin" /> : done ? <Check /> : null}
          {action}
          {!blocked && flag && !starting && <ArrowRight />}
        </Button>
      </div>
    </div>
  );
}
