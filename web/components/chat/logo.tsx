import { cn } from "@/lib/utils";
import { APP_NAME } from "@/lib/brand";
import { BASE_PATH } from "@/lib/showcase";

export function Logo({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2 font-semibold tracking-tight", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`${BASE_PATH}/logo.svg`} alt="" aria-hidden="true" className="size-[1.6em] shrink-0" />
      {APP_NAME}
    </div>
  );
}
