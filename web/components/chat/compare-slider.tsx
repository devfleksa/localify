"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronsLeftRight } from "lucide-react";
import { cn } from "@/lib/utils";

// Before/after slider: the localized image underneath, the original on top clipped to the left of the handle.
// Drag anywhere on the image (mouse or touch); arrow keys move the handle when it has focus.
// On first show the handle sweeps in from the right, so the change reveals itself once.
export function CompareSlider({
  before,
  after,
  label,
  dim,
  className = "aspect-[4/5] w-full",
  fit,
  intro = true,
}: {
  fit?: string; // full screen: max height (CSS length); the box then takes the image's own aspect ratio
  before: string;
  after: string;
  label: string;
  dim?: boolean;
  className?: string; // size of the box (images are contained inside it)
  intro?: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(intro ? 100 : 50);
  const [dragging, setDragging] = useState(false);
  const [ratio, setRatio] = useState(1);
  const [loaded, setLoaded] = useState(false);
  const touched = useRef(false); // the user moved the handle: the intro must not move it back

  // Sweep once the original has loaded (or failed to): nothing to reveal before that.
  useEffect(() => {
    if (!intro || !loaded) return;
    const t = setTimeout(() => !touched.current && setPos(50), 250);
    return () => clearTimeout(t);
  }, [intro, loaded]);

  function move(clientX: number) {
    touched.current = true;
    const r = box.current?.getBoundingClientRect();
    if (r) setPos(Math.min(100, Math.max(0, ((clientX - r.left) / r.width) * 100)));
  }

  const ease = dragging ? "none" : "clip-path 1100ms var(--ease-in-out), left 1100ms var(--ease-in-out)";

  return (
    <div
      ref={box}
      style={fit ? { aspectRatio: ratio, width: `min(100%, calc(${fit} * ${ratio}))` } : undefined}
      className={cn(
        "group/compare relative cursor-ew-resize touch-none select-none overflow-hidden bg-deep transition-opacity",
        !fit && className,
        dim && "opacity-40",
      )}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        setDragging(true);
        move(e.clientX);
      }}
      onPointerMove={(e) => e.buttons === 1 && move(e.clientX)}
      onPointerUp={() => setDragging(false)}
      onPointerCancel={() => setDragging(false)}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={after} alt={label} draggable={false} className="absolute inset-0 size-full object-contain" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={before}
        alt="Original"
        draggable={false}
        onLoad={(e) => {
          setRatio(e.currentTarget.naturalWidth / e.currentTarget.naturalHeight || 1);
          setLoaded(true);
        }}
        onError={() => setLoaded(true)}
        className="absolute inset-0 size-full object-contain"
        style={{ clipPath: `inset(0 ${100 - pos}% 0 0)`, transition: ease }}
      />
      <span className="pointer-events-none absolute top-3 left-3 rounded-full bg-black/55 px-2.5 py-1 text-[13px] text-white">Original</span>
      <span className="pointer-events-none absolute top-3 right-3 rounded-full bg-black/55 px-2.5 py-1 text-[13px] text-white">{label}</span>
      <div className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-white/90" style={{ left: `${pos}%`, transition: ease }}>
        <span /* taste-skill-ignore: handle floats over a photo */ className="absolute top-1/2 left-1/2 flex size-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-black shadow-lg transition-transform duration-150 group-active/compare:scale-90">
          <ChevronsLeftRight className="size-4" />
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={Math.round(pos)}
        onChange={(e) => {
          touched.current = true;
          setPos(Number(e.target.value));
        }}
        aria-label="Compare original and localized"
        className="absolute inset-0 size-full cursor-ew-resize opacity-0"
        onPointerDown={(e) => e.preventDefault()}
      />
    </div>
  );
}
