"use client";

import { useState } from "react";
import { ArrowUpRight, Maximize2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { AgentRow } from "./messages";
import { CompareSlider } from "./compare-slider";
import { Filmstrip, SlideStage } from "./slide-stage";
import { ResultViewer } from "./result-viewer";
import { DownloadMenu, RegenerateMenu, type SlideRef } from "./result-actions";
import { market } from "@/lib/markets";
import { cn } from "@/lib/utils";
import { IS_SHOWCASE, READ_ONLY_HINT } from "@/lib/showcase";
import type { MarketCode } from "@/lib/markets";
import type { LibraryItem, Message } from "@/lib/types";

type ResultsMessage = Extract<Message, { kind: "results" }>;

// Localized versions of one post: market tabs (each shows its own first slide), one big before/after stage,
// a filmstrip for carousels, and the culture report (why each change) under it.
export function ResultsGrid({
  jobId,
  message,
  item,
  handle,
}: {
  jobId: string;
  message: ResultsMessage;
  item?: LibraryItem;
  handle: string;
}) {
  const [code, setCode] = useState<MarketCode>(message.results[0]?.market);
  const [slide, setSlide] = useState(0);
  const [asked, setAsked] = useState<string[]>([]);
  const [viewer, setViewer] = useState(false);

  const r = message.results.find((x) => x.market === code) ?? message.results[0];
  if (!r) return null;
  const m = market(r.market);
  const originals = message.originalImages ?? [];
  const urls = r.imageUrls ?? [];
  const count = Math.max(urls.length, originals.length);
  const pendingOf = (c: MarketCode) => [
    ...(message.results.find((x) => x.market === c)?.pending ?? []),
    ...asked.filter((k) => k.startsWith(`${c}-`)).map((k) => Number(k.split("-")[1])),
  ];
  const pending = pendingOf(r.market);
  const before = originals[slide];
  const after = urls[slide];
  const edited = !!after && !!before && after !== before;
  const busy = pending.includes(slide + 1);
  const editedCount = urls.filter((u, i) => u !== originals[i]).length;

  // Each slide is its own request; the server answers at once and edits in the background.
  async function regenerate(slides: SlideRef[]) {
    if (IS_SHOWCASE) return toast(READ_ONLY_HINT);
    const keys = slides.map((s) => `${s.market}-${s.slide}`);
    setAsked((a) => [...a, ...keys]);
    const errors = await Promise.all(
      slides.map(async (s) => {
        const res = await fetch(`/api/jobs/${jobId}/regenerate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ resultsId: message.id, market: s.market, slide: s.slide }),
        });
        return res.ok ? null : (((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Could not regenerate");
      }),
    );
    const failed = errors.filter(Boolean);
    if (failed.length) toast.error(slides.length > 1 ? `${failed.length} of ${slides.length} slides could not be regenerated: ${failed[0]}` : failed[0]);
    setTimeout(() => setAsked((a) => a.filter((k) => !keys.includes(k))), 1500);
  }

  return (
    <AgentRow>
      {viewer && (
        <ResultViewer
          message={message}
          handle={handle}
          start={{ market: r.market, slide: slide + 1 }}
          onClose={() => setViewer(false)}
        />
      )}
      <div className="overflow-hidden rounded-2xl bg-raised">
        <div className="flex items-center gap-3 px-4 pt-4 pb-3">
          {item?.thumbUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.thumbUrl} alt="" className="h-12 w-[38px] shrink-0 rounded-md object-cover" />
          )}
          <div className="min-w-0">
            <p className="text-[15px] font-medium">
              Localized for {message.results.length} {message.results.length === 1 ? "market" : "markets"}
            </p>
            {item && <p className="truncate text-sm text-muted-foreground" dir="auto">{item.caption}</p>}
          </div>
        </div>

        {/* Market tabs */}
        {message.results.length > 1 && (
          <div className="flex gap-1.5 overflow-x-auto px-4 pb-3" role="tablist" aria-label="Markets">
            {message.results.map((x) => {
              const mk = market(x.market);
              const active = x.market === r.market;
              const thumb = x.imageUrls?.[0] ?? originals[0];
              return (
                <button
                  key={x.market}
                  role="tab"
                  aria-selected={active}
                  onClick={() => setCode(x.market)}
                  className={cn(
                    "press flex shrink-0 items-center gap-2 rounded-full py-1 pr-3.5 pl-1",
                    active ? "bg-primary text-primary-foreground" : "bg-lift text-foreground/85 hover:bg-accent",
                  )}
                >
                  {thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumb} alt="" className={cn("size-7 rounded-full object-cover", pendingOf(x.market).length && "opacity-50")} />
                  ) : (
                    <span className="size-7 rounded-full bg-deep" />
                  )}
                  <span className="text-sm">
                    {mk.flag} {mk.name}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Stage */}
        <SlideStage count={count} index={slide} onIndex={setSlide}>
          <div className={cn("relative", busy && "shimmer")}>
            {edited ? (
              <CompareSlider key={`${r.market}-${slide}`} before={before} after={after} label={`${m.flag} ${m.name}`} dim={busy} className="aspect-[4/5] max-h-[72vh] w-full" />
            ) : after || before ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={after ?? before} alt={`Slide ${slide + 1}`} className={cn("aspect-[4/5] max-h-[72vh] w-full bg-deep object-contain", busy && "opacity-40")} />
            ) : (
              <div className="shimmer aspect-[4/5] w-full bg-deep" />
            )}
            {busy && (
              <span className="shimmer-text pointer-events-none absolute inset-x-0 top-1/2 z-10 -translate-y-1/2 text-center text-[15px] font-medium">
                Generating a new version
              </span>
            )}
            {!edited && after && !busy && (
              <span className="pointer-events-none absolute top-3 left-3 rounded-full bg-black/55 px-2.5 py-1 text-[13px] text-white">
                Unchanged in {m.name}
              </span>
            )}
          </div>
        </SlideStage>

        {/* Filmstrip + actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-3 empty:hidden">
          <Filmstrip
            srcs={Array.from({ length: count }, (_, i) => urls[i] ?? originals[i])}
            index={slide}
            onIndex={setSlide}
            marked={Array.from({ length: count }, (_, i) => !!urls[i] && urls[i] !== originals[i])}
            busy={Array.from({ length: count }, (_, i) => pending.includes(i + 1))}
          />
          <div className="ml-auto flex items-center gap-1">
            <RegenerateMenu
              message={message}
              code={r.market}
              slide={slide + 1}
              isPending={(s) => pendingOf(s.market).includes(s.slide)}
              onRegenerate={regenerate}
            />
            <DownloadMenu message={message} handle={handle} code={r.market} slide={slide + 1} disabled={!after} />
            <Button size="icon-sm" variant="ghost" disabled={!before} onClick={() => setViewer(true)} aria-label="Full screen" title="Full screen">
              <Maximize2 />
            </Button>
          </div>
        </div>

        {/* The reasons (culture report) live in the full-screen viewer, so the chat stays compact. */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-3 pb-4">
          <p className="text-sm text-muted-foreground">
            {r.report.length
              ? `${r.report.length} ${r.report.length === 1 ? "change" : "changes"} for ${m.name}`
              : `No changes for ${m.name}`}
            {count > 1 && editedCount > 0 && ` · ${editedCount} of ${count} slides edited`}
          </p>
          {r.report.length > 0 && before && (
            <Button size="sm" variant="secondary" onClick={() => setViewer(true)}>
              Why these changes <ArrowUpRight />
            </Button>
          )}
        </div>
      </div>
    </AgentRow>
  );
}
