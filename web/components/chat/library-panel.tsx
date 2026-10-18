"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, Check, ChevronDown, Images, LayoutGrid, List } from "lucide-react";
import { scanCost, usd } from "@/lib/cost";
import { market } from "@/lib/markets";
import { cn } from "@/lib/utils";
import { isActionable, needsLocalizing, relevantFindings } from "@/lib/findings";
import { CountUp } from "./count-up";
import { PostDetail, FINDING_LABEL } from "./post-detail";
import type { MarketCode } from "@/lib/markets";
import type { Job, LibraryItem, PostType, Tier } from "@/lib/types";

const FILTERS = [
  ["flagged", "Needs localizing"],
  ["B", "Visual"],
  ["A", "Text only"],
  ["all", "All"],
] as const;
type Filter = (typeof FILTERS)[number][0];
type View = "grid" | "list";

const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });

// Tiers of the changes that count (actionable findings for the job's markets).
const tiers = (i: LibraryItem, markets: MarketCode[]): Tier[] => {
  const t = new Set(relevantFindings(i, markets).filter(isActionable).map((f) => f.tier));
  return (["A", "B"] as Tier[]).filter((x) => t.has(x));
};

// Short summary of what a post needs, e.g. "Text, Place".
const needs = (i: LibraryItem, markets: MarketCode[]) =>
  [...new Set(relevantFindings(i, markets).filter(isActionable).map((f) => FINDING_LABEL[f.type]))].join(", ");

const flagsOf = (i: LibraryItem, markets: MarketCode[]) =>
  [...new Set(relevantFindings(i, markets).filter(isActionable).flatMap((f) => f.markets))].filter((m) => markets.includes(m));

export function LibraryPanel({ job, onSelect }: { job: Job; onSelect: (itemId: string) => void }) {
  const [filter, setFilter] = useState<Filter>("flagged");
  const [sort, setSort] = useState<"views" | "newest">("views");
  const [kind, setKind] = useState<"all" | PostType>("all");
  const [view, setView] = useState<View>("grid");
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    try {
      const v = localStorage.getItem("library-view");
      if (v === "list" || v === "grid") setView(v);
    } catch {}
  }, []);
  const changeView = (v: View) => {
    setView(v);
    try {
      localStorage.setItem("library-view", v);
    } catch {}
  };

  const lib = job.library;
  const scanned = lib.filter((i) => i.scan);
  const markets = job.markets;
  const flagged = scanned.filter((i) => needsLocalizing(i, markets));
  const tierB = flagged.filter((i) => tiers(i, markets).includes("B"));
  // Live cost of this job (Apify + fal in USD, Manus in credits). Jobs from before live costs show scan cost.
  const c = job.costs;
  const spent = c ? c.apify + c.scan + c.edit : scanned.reduce((s, i) => s + scanCost(i), 0);
  const costTitle = c
    ? `Apify ${usd(c.apify)} · fal scan ${usd(c.scan)} · fal edits ${usd(c.edit)} · Manus ${c.manusCredits} credits`
    : "Scan cost only";
  const carousels = lib.filter((i) => i.type === "carousel").length;
  const failed = lib.filter((i) => !i.scan && i.scanError).length;
  const scanning = lib.length > 0 && scanned.length + failed < lib.length;
  const waiting = lib.length - scanned.length - failed; // shown under "Needs localizing" until scanned
  // Why a post can't be localized right now (undefined = it can).
  const blocked = canPickReason(job);
  const localized = new Set(job.messages.flatMap((m) => (m.kind === "results" ? [m.itemId] : [])));
  const open = lib.find((i) => i.id === openId);

  const rows = useMemo(() => {
    const list = lib.filter((i) => {
      if (kind !== "all" && i.type !== kind) return false;
      if (filter === "all") return true;
      if (!i.scan) return filter === "flagged" && !i.scanError; // still scanning: keep it in view so the shimmer shows progress
      if (!needsLocalizing(i, markets)) return false;
      if (filter === "A") return !tiers(i, markets).includes("B");
      if (filter === "B") return tiers(i, markets).includes("B");
      return true;
    });
    return sort === "views" ? [...list].sort((a, b) => b.views - a.views) : list;
  }, [lib, filter, sort, kind, markets]);

  const count = (f: Filter) =>
    f === "all" ? lib.length : f === "flagged" ? flagged.length + waiting : f === "B" ? tierB.length : flagged.length - tierB.length;

  return (
    <section className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-raised">
      <div className="space-y-5 px-5 pt-5 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <a
              href={job.source.url}
              target="_blank"
              rel="noreferrer"
              className="press group inline-flex items-center gap-1 text-2xl font-light tracking-[-0.02em]"
            >
              @{job.source.handle}
              <ArrowUpRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </a>
            <p className="text-sm text-muted-foreground">
              {lib.length ? `${lib.length - carousels} single images · ${carousels} carousels` : "Importing posts"}
            </p>
          </div>
          <div className="shrink-0 text-right" title={costTitle}>
            <p className="text-lg tabular-nums">
              <CountUp value={spent} format={usd} />
            </p>
            <p className="text-[13px] text-muted-foreground">
              spent{c?.manusCredits ? ` + ${c.manusCredits} Manus credits` : ""}
            </p>
          </div>
        </div>

        {/* Funnel: posts → scanned → need localizing */}
        <div className="grid grid-cols-3 gap-4">
          <Figure label="posts" value={lib.length} />
          <Figure
            label={failed ? `scanned · ${failed} failed` : "scanned"}
            value={scanned.length}
            progress={lib.length ? scanned.length / lib.length : 0}
            live={scanning || lib.length === 0}
          />
          <Figure
            label={`need localizing${tierB.length ? ` · ${tierB.length} visual` : ""}`}
            value={flagged.length}
            accent
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1">
            {FILTERS.map(([key, label]) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                aria-pressed={filter === key}
                className={cn(
                  "press flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px]",
                  filter === key ? "bg-foreground text-background" : "text-muted-foreground hover:bg-lift hover:text-foreground",
                )}
              >
                {label}
                <span className={cn("tabular-nums", filter === key ? "text-background/60" : "text-muted-foreground/70")}>{count(key)}</span>
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <Select value={kind} onChange={(v) => setKind(v as typeof kind)} label="Post type">
              <option value="all">All posts</option>
              <option value="image">Single images</option>
              <option value="carousel">Carousels</option>
            </Select>
            <Select value={sort} onChange={(v) => setSort(v as typeof sort)} label="Sort">
              <option value="views">Most liked</option>
              <option value="newest">Newest</option>
            </Select>
            <div className="flex rounded-full bg-lift/70 p-0.5">
              {(["grid", "list"] as const).map((v) => {
                const Icon = v === "grid" ? LayoutGrid : List;
                return (
                  <button
                    key={v}
                    onClick={() => changeView(v)}
                    aria-label={v === "grid" ? "Grid view" : "List view"}
                    aria-pressed={view === v}
                    className={cn("press rounded-full p-1.5", view === v ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground")}
                  >
                    <Icon className="size-4" />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-1 pb-6">
        {lib.length === 0 && (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {Array.from({ length: 12 }, (_, i) => (
              <div key={i} className="shimmer aspect-[4/5] rounded-lg bg-lift/60" style={{ animationDelay: `${i * 60}ms` }} />
            ))}
          </div>
        )}
        {lib.length > 0 && rows.length === 0 && (
          <p className="py-12 text-center text-[15px] text-muted-foreground">No posts in this view.</p>
        )}

        {view === "grid" ? (
          <ul className="grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-3 2xl:grid-cols-4">
            {rows.map((item, i) => (
              <Tile
                key={item.id}
                i={i}
                item={item}
                markets={markets}
                selected={job.selectedId === item.id}
                done={localized.has(item.id)}
                onOpen={() => setOpenId(item.id)}
              />
            ))}
          </ul>
        ) : (
          <ul className="-mx-2 space-y-0.5">
            {rows.map((item, i) => (
              <Row
                key={item.id}
                i={i}
                item={item}
                markets={markets}
                selected={job.selectedId === item.id}
                done={localized.has(item.id)}
                onOpen={() => setOpenId(item.id)}
              />
            ))}
          </ul>
        )}
      </div>

      {open && (
        <PostDetail
          item={open}
          markets={markets}
          blocked={blocked}
          done={localized.has(open.id)}
          onClose={() => setOpenId(null)}
          onLocalize={() => {
            onSelect(open.id);
            setOpenId(null);
          }}
        />
      )}
    </section>
  );
}

function canPickReason(job: Job): string | undefined {
  switch (job.status) {
    case "ready":
    case "done":
      return undefined;
    case "failed":
      return "This run stopped. Start a new one to localize";
    case "awaiting_review":
      return "Approve or finish the open plan first";
    case "running":
      if (job.auto?.running) return "Auto mode is running. Stop it to pick a post yourself";
      return job.selectedId ? "The agent is busy with another post" : "Wait for the library scan to finish";
  }
}

function Figure({ label, value, progress, accent, live }: { label: string; value: number; progress?: number; accent?: boolean; live?: boolean }) {
  return (
    <div className="min-w-0">
      <p className={cn("text-4xl font-light tracking-[-0.03em]", accent && "text-primary")}>
        <CountUp value={value} />
      </p>
      <p className={cn("truncate text-[13px] text-muted-foreground", live && "shimmer-text")}>{label}</p>
      {progress !== undefined && progress < 1 && (
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-lift">
          <div className="shimmer h-full rounded-full bg-primary transition-[width] duration-700 ease-[var(--ease-out)]" style={{ width: `${progress * 100}%` }} />
        </div>
      )}
    </div>
  );
}

function Select({ value, onChange, label, children }: { value: string; onChange: (v: string) => void; label: string; children: React.ReactNode }) {
  return (
    <span className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className="h-8 cursor-pointer appearance-none rounded-full bg-lift/70 pr-8 pl-3 text-[13px] text-foreground/90 outline-none hover:bg-lift focus-visible:ring-2 focus-visible:ring-primary"
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
    </span>
  );
}

type ItemProps = {
  i: number;
  item: LibraryItem;
  markets: MarketCode[];
  selected: boolean;
  done: boolean;
  onOpen: () => void;
};

function StateNote({ item, markets }: { item: LibraryItem; markets: MarketCode[] }) {
  if (!item.scan && item.scanError) return <span className="text-destructive">Scan failed, retried next run</span>;
  if (!item.scan) return <span className="shimmer-text">Scanning</span>;
  if (!needsLocalizing(item, markets)) return <span>Nothing to localize</span>;
  return <span className="text-foreground/85">{needs(item, markets)}</span>;
}

function Tile({ i, item, markets, selected, done, onOpen }: ItemProps) {
  const flag = item.scan && needsLocalizing(item, markets);
  const flags = flagsOf(item, markets);
  return (
    <li className="rise" style={{ "--i": Math.min(i, 12) } as React.CSSProperties}>
      <button onClick={onOpen} className="press group block w-full text-left">
        <div
          className={cn(
            "relative aspect-[4/5] overflow-hidden rounded-lg bg-lift",
            !item.scan && !item.scanError && "shimmer",
            selected && "ring-2 ring-primary ring-offset-2 ring-offset-raised",
          )}
        >
          {item.thumbUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.thumbUrl}
              alt=""
              loading="lazy"
              className={cn(
                "size-full object-cover transition-[transform,scale,opacity,filter] duration-500 ease-[var(--ease-out)] group-hover:scale-[1.04]",
                item.scan && !flag && "opacity-40 grayscale",
              )}
            />
          )}
          {item.type === "carousel" && (
            <span className="absolute top-2 right-2 flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[13px] text-white">
              <Images className="size-3.5" /> {item.imageUrls?.length ?? ""}
            </span>
          )}
          {done && (
            <span className="absolute top-2 left-2 flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[13px] font-medium text-primary-foreground">
              <Check className="size-3.5" strokeWidth={3} /> Localized
            </span>
          )}
          {flags.length > 0 && (
            <span className="absolute bottom-2 left-2 rounded-full bg-black/55 px-2 py-0.5 text-[13px] tracking-tight">
              {flags.map((c) => market(c).flag).join("")}
            </span>
          )}
        </div>
        <p className="mt-1.5 flex items-center justify-between gap-2 text-[13px] text-muted-foreground">
          <span className="min-w-0 truncate"><StateNote item={item} markets={markets} /></span>
          <span className="shrink-0 tabular-nums">{compact.format(item.views)}</span>
        </p>
      </button>
    </li>
  );
}

function Row({ i, item, markets, selected, done, onOpen }: ItemProps) {
  const flag = item.scan && needsLocalizing(item, markets);
  const flags = flagsOf(item, markets);
  return (
    <li className="rise" style={{ "--i": Math.min(i, 12) } as React.CSSProperties}>
      <button
        onClick={onOpen}
        className={cn("press flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-lift/60", selected && "bg-primary/10")}
      >
        <span className={cn("relative h-16 w-[51px] shrink-0 overflow-hidden rounded-md bg-lift", !item.scan && !item.scanError && "shimmer")}>
          {item.thumbUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.thumbUrl} alt="" loading="lazy" className={cn("size-full object-cover", item.scan && !flag && "opacity-40 grayscale")} />
          )}
          {item.type === "carousel" && (
            <Images /* taste-skill-ignore: icon over a photo */ className="absolute top-1 right-1 size-3.5 text-white drop-shadow" aria-label="Carousel" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px]" dir="auto">{item.caption || "No caption"}</span>
          <span className="block truncate text-[13px] text-muted-foreground"><StateNote item={item} markets={markets} /></span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-0.5 text-[13px]">
          <span className="tabular-nums text-muted-foreground">{compact.format(item.views)} likes</span>
          {done ? (
            <span className="flex items-center gap-1 text-primary"><Check className="size-3.5" /> Localized</span>
          ) : (
            flags.length > 0 && <span className="tracking-tight">{flags.map((c) => market(c).flag).join("")}</span>
          )}
        </span>
      </button>
    </li>
  );
}
