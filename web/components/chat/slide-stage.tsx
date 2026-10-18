"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

// One slide at a time, large: arrows on the sides, a counter, and a filmstrip of every slide underneath.
// Used for carousels in the library detail, the results card and the full-screen viewer.
export function SlideStage({
  count,
  index,
  onIndex,
  children,
  className,
}: {
  count: number;
  index: number; // 0-based
  onIndex: (i: number) => void;
  children: React.ReactNode; // the current slide
  className?: string;
}) {
  const go = (d: number) => onIndex(Math.min(count - 1, Math.max(0, index + d)));
  return (
    <div
      className={cn("group/stage relative", className)}
      onKeyDown={(e) => {
        if (count < 2 || (e.target as HTMLElement).tagName === "INPUT") return;
        if (e.key === "ArrowRight") go(1);
        if (e.key === "ArrowLeft") go(-1);
      }}
    >
      <div key={index} className="animate-in fade-in duration-300">
        {children}
      </div>
      {count > 1 && (
        <>
          <StageArrow side="left" disabled={index === 0} onClick={() => go(-1)} />
          <StageArrow side="right" disabled={index === count - 1} onClick={() => go(1)} />
          <span className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/55 px-2.5 py-1 text-[13px] text-white tabular-nums">
            {index + 1} / {count}
          </span>
        </>
      )}
    </div>
  );
}

function StageArrow({ side, disabled, onClick }: { side: "left" | "right"; disabled: boolean; onClick: () => void }) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={side === "left" ? "Previous slide" : "Next slide"}
      className={cn(
        "press absolute top-1/2 z-10 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white hover:bg-black/75 disabled:opacity-0",
        "opacity-100 transition-opacity md:opacity-0 md:group-hover/stage:opacity-100 md:focus-visible:opacity-100",
        side === "left" ? "left-3" : "right-3",
      )}
    >
      <Icon className="size-5" />
    </button>
  );
}

// Filmstrip: a thumbnail per slide; the current one is outlined, edited ones carry a jade dot.
export function Filmstrip({
  srcs,
  index,
  onIndex,
  marked,
  busy,
  className,
}: {
  srcs: string[];
  index: number;
  onIndex: (i: number) => void;
  marked?: boolean[];
  busy?: boolean[];
  className?: string;
}) {
  if (srcs.length < 2) return null;
  return (
    <div className={cn("flex gap-1.5 overflow-x-auto p-0.5 pb-1", className)}>
      {srcs.map((src, i) => (
        <button
          key={i}
          type="button"
          onClick={() => onIndex(i)}
          aria-label={`Slide ${i + 1}`}
          aria-current={i === index}
          className={cn(
            "press relative h-16 w-[51px] shrink-0 overflow-hidden rounded-md bg-deep",
            i === index ? "ring-2 ring-primary" : "opacity-60 hover:opacity-100",
            busy?.[i] && "shimmer",
          )}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt="" loading="lazy" className="size-full object-cover" />
          {marked?.[i] && <span className="absolute right-1 bottom-1 size-2 rounded-full bg-primary ring-2 ring-deep" />}
        </button>
      ))}
    </div>
  );
}
