"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { PanelLeftClose, PanelLeftOpen, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "./logo";
import { market, type MarketCode } from "@/lib/markets";
import { cn } from "@/lib/utils";
import type { JobStatus } from "@/lib/types";
import { IS_SHOWCASE, apiGet } from "@/lib/showcase";
import { REPO_NAME, REPO_URL } from "@/lib/brand";

type JobSummary = { id: string; title: string; status: JobStatus; createdAt: number; markets?: MarketCode[]; avatar?: string };

export const STATUS_TEXT: Record<JobStatus, string> = {
  running: "Agent working",
  ready: "Pick a post",
  awaiting_review: "Plan to review",
  done: "Localized",
  failed: "Stopped",
};

// Status as a small dot: jade + pulse while running, sand while waiting for the user, red when failed.
export function StatusDot({ status, className }: { status: JobStatus; className?: string }) {
  return (
    <span
      className={cn(
        "inline-block size-2 shrink-0 rounded-full",
        status === "running" && "pulse-dot bg-primary",
        status === "awaiting_review" && "bg-protect",
        status === "ready" && "bg-textual",
        status === "done" && "bg-muted-foreground/60",
        status === "failed" && "bg-destructive",
        className,
      )}
    />
  );
}

const ago = (t: number) => {
  const s = (Date.now() - t) / 1000;
  // The replay is an archive: "4 h ago" would soon read "3 months ago", so it shows the run's date.
  if (IS_SHOWCASE) return new Date(t).toLocaleDateString("en", { day: "numeric", month: "short", year: "numeric" });
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(t).toLocaleDateString("en", { day: "numeric", month: "short" });
};

// One shared poll of /api/jobs for the sidebar and the phone's brand row (both are mounted; CSS shows one).
type JobsState = { jobs: JobSummary[] | null; offline: boolean };
let jobsState: JobsState = { jobs: null, offline: false };
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;
let inflight: Promise<void> | undefined;

function refreshJobs() {
  inflight ??= apiGet("/api/jobs")
    .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
    .then((jobs: JobSummary[]) => (jobsState = { jobs, offline: false }))
    .catch(() => (jobsState = { jobs: jobsState.jobs ?? [], offline: true }))
    .then(() => listeners.forEach((l) => l()))
    .finally(() => (inflight = undefined));
  return inflight;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    void refreshJobs();
    if (!IS_SHOWCASE) timer = setInterval(refreshJobs, 3000);
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size) clearInterval(timer);
  };
}

const SERVER_STATE: JobsState = { jobs: null, offline: false };

function useJobs(pathname: string): JobsState {
  const state = useSyncExternalStore(subscribe, () => jobsState, () => SERVER_STATE);
  // A new job shows up as soon as you navigate to it, not on the next tick.
  useEffect(() => {
    void refreshJobs();
  }, [pathname]);
  return state;
}

// The current path without the trailing slash the static replay adds.
const usePath = () => usePathname().replace(/(.)\/$/, "$1");

export function Sidebar() {
  const pathname = usePath();
  const { jobs, offline } = useJobs(pathname);
  const [collapsed, setCollapsed] = useState(false);

  // Remember the choice per browser (best effort: storage may be blocked).
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem("sidebar") === "collapsed");
    } catch {}
  }, []);
  const toggle = () =>
    setCollapsed((c) => {
      try {
        localStorage.setItem("sidebar", c ? "open" : "collapsed");
      } catch {}
      return !c;
    });


  if (collapsed) {
    return (
      <aside className="hidden w-16 shrink-0 flex-col items-center gap-3 bg-sidebar py-4 md:flex">
        <Button size="icon" variant="ghost" onClick={toggle} aria-label="Open sidebar">
          <PanelLeftOpen />
        </Button>
        <Button asChild size="icon" aria-label="New brand">
          <Link href="/"><Plus /></Link>
        </Button>
        <div className="mt-2 flex flex-col items-center gap-1">
          {jobs?.slice(0, 12).map((j) => (
            <Link
              key={j.id}
              href={`/jobs/${j.id}`}
              title={`${j.title} · ${STATUS_TEXT[j.status]}`}
              className={cn(
                "press relative flex size-10 items-center justify-center rounded-lg text-sm font-medium uppercase text-muted-foreground hover:bg-raised hover:text-foreground",
                pathname === `/jobs/${j.id}` && "bg-raised text-foreground",
              )}
            >
              <BrandMark job={j} className="size-8 text-[13px]" />
              <StatusDot status={j.status} className="absolute top-1 right-1 size-2 ring-2 ring-sidebar" />
            </Link>
          ))}
        </div>
        <Button asChild size="icon" variant="ghost" className="mt-auto" aria-label="Source code on GitHub" title={REPO_NAME}>
          <a href={REPO_URL} target="_blank" rel="noreferrer"><GitHubMark /></a>
        </Button>
      </aside>
    );
  }

  return (
    <aside className="hidden w-72 shrink-0 flex-col bg-sidebar md:flex">
      <div className="flex items-center justify-between px-5 pt-5 pb-4 pr-3">
        <Link href="/" className="press rounded-md">
          <Logo className="text-[17px]" />
        </Link>
        <Button size="icon" variant="ghost" onClick={toggle} aria-label="Close sidebar">
          <PanelLeftClose />
        </Button>
      </div>
      <div className="px-3">
        <Button asChild className="h-10 w-full justify-start px-4">
          <Link href="/"><Plus /> New brand</Link>
        </Button>
      </div>
      <p className="px-5 pt-7 pb-2 text-sm text-muted-foreground">Brands</p>
      <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-4">
        {jobs === null &&
          [0, 1, 2].map((i) => <div key={i} className="shimmer mx-1 my-1 h-12 rounded-lg bg-raised/60" />)}
        {offline && <p className="px-3 pb-2 text-sm text-destructive">Can&apos;t reach the server. Retrying…</p>}
        {jobs?.length === 0 && !offline && <p className="px-3 text-sm text-muted-foreground">No brands yet. Start with one above.</p>}
        {jobs?.map((j, i) => {
          const active = pathname === `/jobs/${j.id}`;
          return (
            <Link
              key={j.id}
              href={`/jobs/${j.id}`}
              style={{ "--i": Math.min(i, 8) } as React.CSSProperties}
              className={cn(
                "rise press group flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-raised",
                active && "bg-raised",
              )}
            >
              <BrandMark job={j} className="size-9 text-[13px]" />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate text-[15px]">{j.title}</span>
                  {j.markets && (
                    <span className="ml-auto shrink-0 text-xs tracking-tighter opacity-80">
                      {j.markets.slice(0, 4).map((c) => market(c).flag).join("")}
                      {j.markets.length > 4 && <span className="ml-0.5 text-muted-foreground">+{j.markets.length - 4}</span>}
                    </span>
                  )}
                </span>
                <span className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
                  <StatusDot status={j.status} />
                  <span className={cn(j.status === "running" && "shimmer-text")}>{STATUS_TEXT[j.status]}</span>
                  <span className="ml-auto shrink-0">{ago(j.createdAt)}</span>
                </span>
              </span>
            </Link>
          );
        })}
      </nav>
      <a
        href={REPO_URL}
        target="_blank"
        rel="noreferrer"
        className="press mx-3 mb-4 flex items-center gap-2.5 rounded-lg px-2 py-2 text-[13px] text-muted-foreground hover:bg-raised hover:text-foreground"
      >
        <GitHubMark className="size-4" />
        {REPO_NAME}
      </a>
    </aside>
  );
}

// Phones have no sidebar: the brands sit in one row under the top bar, scrolling sideways when there are many.
export function MobileBrands() {
  const pathname = usePath();
  const { jobs } = useJobs(pathname);
  if (!jobs?.length) return null;
  return (
    <nav aria-label="Brands" className="flex gap-2 overflow-x-auto bg-sidebar px-4 pb-3 [scrollbar-width:none] md:hidden">
      {jobs.map((j) => {
        const active = pathname === `/jobs/${j.id}`;
        return (
          <Link
            key={j.id}
            href={`/jobs/${j.id}`}
            aria-current={active ? "page" : undefined}
            className={cn(
              "press flex shrink-0 items-center gap-2 rounded-full py-1 pr-4 pl-1 text-[15px]",
              active ? "bg-raised text-foreground" : "text-muted-foreground hover:bg-raised hover:text-foreground",
            )}
          >
            <BrandMark job={j} className="size-8 text-[12px]" />
            {j.title}
          </Link>
        );
      })}
    </nav>
  );
}

// The brand's Instagram profile picture, or its first two letters when there is none (or it fails to load).
function BrandMark({ job, className }: { job: JobSummary; className?: string }) {
  const [broken, setBroken] = useState(false);
  if (job.avatar && !broken)
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={job.avatar} alt="" onError={() => setBroken(true)} className={cn("shrink-0 rounded-full bg-lift object-cover", className)} />
    );
  return (
    <span className={cn("flex shrink-0 items-center justify-center rounded-full bg-lift font-medium uppercase text-foreground/80", className)}>
      {job.title.replace(/^@/, "").slice(0, 2)}
    </span>
  );
}

// GitHub's mark (lucide no longer ships brand icons).
function GitHubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" className={cn("size-[18px]", className)}>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}
