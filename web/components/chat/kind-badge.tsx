import { cn } from "@/lib/utils";
import type { Change } from "@/lib/types";

// Protect = avoids a cultural mistake, Resonate = adds a local touch.
export function KindBadge({ kind, className }: { kind: Change["kind"]; className?: string }) {
  const protect = kind === "protect";
  return (
    <span
      title={protect ? "Avoids a cultural mistake" : "Adds a local touch"}
      className={cn(
        "inline-flex items-center gap-1.5 text-[13px] font-medium",
        protect ? "text-protect" : "text-resonate",
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", protect ? "bg-protect" : "bg-resonate")} />
      {protect ? "Protect" : "Resonate"}
    </span>
  );
}
