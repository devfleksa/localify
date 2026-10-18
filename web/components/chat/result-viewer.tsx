"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CompareSlider } from "./compare-slider";
import { Filmstrip } from "./slide-stage";
import { KindBadge } from "./kind-badge";
import { DownloadMenu } from "./result-actions";
import { market } from "@/lib/markets";
import { cn } from "@/lib/utils";
import type { MarketCode } from "@/lib/markets";
import type { Message } from "@/lib/types";

type ResultsMessage = Extract<Message, { kind: "results" }>;

// Full-screen before/after: big compare slider on the left, the culture report (why each change) on the right.
// Market tabs on top switch countries; arrows (buttons, ← →, PageUp/PageDown) switch slides. Esc closes.
export function ResultViewer({
  message,
  handle,
  start,
  onClose,
}: {
  message: ResultsMessage;
  handle: string;
  start: { market: MarketCode; slide: number };
  onClose: () => void;
}) {
  const [code, setCode] = useState(start.market);
  const [slide, setSlide] = useState(start.slide);
  const r = message.results.find((x) => x.market === code) ?? message.results[0];
  const originals = message.originalImages ?? [];
  const count = originals.length;
  const m = market(r.market);
  const before = originals[slide - 1];
  const after = r.imageUrls?.[slide - 1] ?? before;
  // Only the reasons for the slide on screen; a reason without slides applies to every slide.
  const notes = r.report.filter((n) => !n.slides?.length || n.slides.includes(slide));
  const urls = Array.from({ length: count }, (_, i) => r.imageUrls?.[i] ?? originals[i]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (count < 2) return;
      const inRange = (e.target as HTMLElement)?.tagName === "INPUT";
      if (e.key === "PageDown" || (!inRange && e.key === "ArrowRight")) setSlide((s) => Math.min(count, s + 1));
      if (e.key === "PageUp" || (!inRange && e.key === "ArrowLeft")) setSlide((s) => Math.max(1, s - 1));
    };
    window.addEventListener("keydown", key);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", key);
      document.body.style.overflow = "";
    };
  }, [onClose, count]);

  // Portal: chat bubbles animate with a transform, which would trap a fixed overlay inside the bubble.
  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col bg-deep animate-in fade-in duration-200" role="dialog" aria-modal="true" aria-label="Localized versions">
      <div className="flex items-center gap-2 px-4 py-3">
        <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto">
          {message.results.map((x) => (
            <button
              key={x.market}
              onClick={() => setCode(x.market)}
              className={cn(
                "press shrink-0 rounded-full px-3.5 py-1.5 text-sm",
                x.market === r.market ? "bg-primary text-primary-foreground" : "bg-raised text-foreground/85 hover:bg-lift",
              )}
            >
              {market(x.market).flag} {market(x.market).name}
            </button>
          ))}
        </div>
        <DownloadMenu message={message} handle={handle} code={r.market} slide={slide} disabled={!after || after === before} big />
        <Button size="icon" variant="ghost" onClick={onClose} aria-label="Close">
          <X />
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-4">
          {before && (
            <div key={`${r.market}-${slide}`} className="flex min-h-0 w-full justify-center animate-in fade-in zoom-in-[0.98] duration-300">
              <CompareSlider before={before} after={after} label={`${m.flag} ${m.name}`} fit={count > 1 ? "(100dvh - 12rem)" : "(100dvh - 7rem)"} />
            </div>
          )}
          {count > 1 && (
            <>
              <Button
                size="icon-lg"
                variant="secondary"
                className="absolute top-1/2 left-6 -translate-y-1/2"
                disabled={slide === 1}
                onClick={() => setSlide(slide - 1)}
                aria-label="Previous slide"
              >
                <ChevronLeft />
              </Button>
              <Button
                size="icon-lg"
                variant="secondary"
                className="absolute top-1/2 right-6 -translate-y-1/2"
                disabled={slide === count}
                onClick={() => setSlide(slide + 1)}
                aria-label="Next slide"
              >
                <ChevronRight />
              </Button>
              <Filmstrip
                srcs={urls}
                index={slide - 1}
                onIndex={(i) => setSlide(i + 1)}
                marked={urls.map((u, i) => u !== originals[i])}
              />
            </>
          )}
        </div>

        <aside className="max-h-[40vh] w-full shrink-0 overflow-y-auto bg-raised p-6 lg:max-h-none lg:w-[400px]">
          <p className="text-2xl font-light tracking-[-0.02em]">
            {m.flag} {m.name}
          </p>
          <p className="mt-1 mb-6 text-[15px] text-muted-foreground">
            {count > 1 && `Slide ${slide} · `}
            {before === after ? "This slide is unchanged in this market." : "Why this version changed."}
          </p>
          <ul className="space-y-5">
            {notes.map((item, i) => (
              <li key={`${r.market}-${slide}-${i}`} className="rise space-y-1" style={{ "--i": i } as React.CSSProperties}>
                <KindBadge kind={item.kind} />
                <p className="text-[15px] leading-relaxed" dir="auto">{item.text}</p>
              </li>
            ))}
            {notes.length === 0 && (
              <p className="text-[15px] text-muted-foreground">
                {r.report.length === 0 ? "No changes for this market." : "No changes on this slide."}
              </p>
            )}
          </ul>
          <p className="mt-8 text-[13px] text-muted-foreground">Drag across the image to compare. ← → switch slides, Esc closes.</p>
        </aside>
      </div>
    </div>,
    document.body,
  );
}
