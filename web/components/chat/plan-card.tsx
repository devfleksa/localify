"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, ChevronDown, Loader2, RefreshCw, Sparkles, Type, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { AgentRow } from "./messages";
import { KindBadge } from "./kind-badge";
import { market, type MarketCode } from "@/lib/markets";
import { cn } from "@/lib/utils";
import { IS_SHOWCASE, READ_ONLY_HINT } from "@/lib/showcase";
import { VISUAL_TYPES, type Change, type ChangeType, type LibraryItem, type Message, type RefSource, type ReviewChoice } from "@/lib/types";

type PlanMessage = Extract<Message, { kind: "plan" }>;
type Choice = { skipped: boolean; ref: RefSource; refUrl?: string; text: string };

const TYPE_LABEL: Record<ChangeType, string> = {
  background: "Background",
  object: "Object swap",
  text: "Translation",
  price: "Price",
  cta: "Call to action",
  date: "Date",
  review: "Needs a person",
};

const REF_LABEL: Record<RefSource, string> = { prompt: "From the prompt", ai: "AI reference", upload: "My image" };
const REF_ICON: Record<RefSource, React.ElementType> = { prompt: Type, ai: Sparkles, upload: Upload };

export function PlanCard({ jobId, message, item }: { jobId: string; message: PlanMessage; item?: LibraryItem }) {
  const locked = message.approved;
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<MarketCode | undefined>(message.plans[0]?.market);
  // An approved plan folds into its header line; it can be opened again to look back.
  const [open, setOpen] = useState(!locked);
  useEffect(() => {
    if (locked) setOpen(false);
  }, [locked]);
  const [choices, setChoices] = useState<Record<string, Choice>>(() =>
    Object.fromEntries(
      message.plans
        .flatMap((p) => p.changes)
        .map((c) => [c.id, { skipped: !!c.skipped, ref: c.ref, refUrl: c.refUrl, text: c.text ?? c.replacement }]),
    ),
  );
  const set = (id: string, patch: Partial<Choice>) => setChoices((s) => ({ ...s, [id]: { ...s[id], ...patch } }));
  const onCount = (changes: Change[]) => changes.filter((c) => c.type !== "review" && !choices[c.id]?.skipped).length;
  const active = onCount(message.plans.flatMap((p) => p.changes));
  const plan = message.plans.find((p) => p.market === tab) ?? message.plans[0];

  async function approve() {
    if (IS_SHOWCASE) return toast(READ_ONLY_HINT);
    setBusy(true);
    const body: ReviewChoice[] = Object.entries(choices).map(([changeId, c]) => ({
      changeId,
      skipped: c.skipped,
      ref: c.ref,
      refUrl: c.ref === "prompt" ? "" : c.refUrl,
      text: c.text,
    }));
    const res = await fetch(`/api/jobs/${jobId}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ choices: body }),
    });
    if (!res.ok) {
      toast.error("Could not approve the plan");
      setBusy(false);
    }
  }

  return (
    <AgentRow>
      <div className="rounded-2xl bg-raised">
        <div
          className={cn("flex items-center gap-3 px-4 pt-4", open ? "pb-3" : "pb-4", locked && "cursor-pointer")}
          onClick={locked ? () => setOpen((o) => !o) : undefined}
        >
          {item?.thumbUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.thumbUrl} alt="" className="h-12 w-[38px] shrink-0 rounded-md object-cover" />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-medium">Localization plan</p>
            {locked && !open ? (
              <p className="truncate text-sm text-muted-foreground">
                {active} {active === 1 ? "change" : "changes"} · {message.plans.map((p) => market(p.market).flag).join(" ")}
              </p>
            ) : (
              item && <p className="truncate text-sm text-muted-foreground" dir="auto">{item.caption}</p>
            )}
          </div>
          {locked && (
            <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-primary/15 px-3 py-1 text-sm text-primary animate-in fade-in zoom-in-95">
              <Check className="size-3.5" /> Approved
            </span>
          )}
          {locked && (
            <button
              type="button"
              aria-expanded={open}
              aria-label={open ? "Hide the plan" : "Show the plan"}
              className="press shrink-0 rounded-full p-1.5 text-muted-foreground hover:bg-lift hover:text-foreground"
            >
              <ChevronDown className={cn("size-4 transition-transform duration-300", open && "rotate-180")} />
            </button>
          )}
        </div>

        <div className="unfold" data-open={open} inert={!open}>
        <div>
        {message.plans.length > 1 && (
          <div className="flex gap-1.5 overflow-x-auto px-4 pb-3" role="tablist" aria-label="Markets">
            {message.plans.map((p) => {
              const on = p.market === plan?.market;
              const n = onCount(p.changes);
              return (
                <button
                  key={p.market}
                  role="tab"
                  aria-selected={on}
                  onClick={() => setTab(p.market)}
                  className={cn(
                    "press flex shrink-0 items-center gap-2 rounded-full py-1.5 pr-1.5 pl-3 text-sm",
                    on ? "bg-primary text-primary-foreground" : "bg-lift text-foreground/85 hover:bg-accent",
                  )}
                >
                  {market(p.market).flag} {market(p.market).name}
                  <span
                    className={cn(
                      "min-w-6 rounded-full px-1.5 py-px text-center text-[13px] tabular-nums",
                      on ? "bg-primary-foreground/15" : "bg-raised text-muted-foreground",
                    )}
                  >
                    {n}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {plan && (
          <div key={plan.market} className="space-y-2 px-4 pb-4">
            {plan.changes.length === 0 && (
              <p className="rounded-xl bg-lift/50 px-4 py-3 text-[15px] text-muted-foreground">Nothing to change for {market(plan.market).name}.</p>
            )}
            {plan.changes.map((c, i) => (
              <ChangeRow
                key={c.id}
                index={i}
                jobId={jobId}
                change={c}
                images={item?.imageUrls}
                choice={choices[c.id]}
                locked={locked}
                onChange={(patch) => set(c.id, patch)}
              />
            ))}
          </div>
        )}

        </div>
        </div>

        {!locked && (
          <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 rounded-b-2xl bg-raised px-4 py-3.5">
            <p className="text-sm text-muted-foreground">
              <span className="text-foreground tabular-nums">{active}</span> {active === 1 ? "change" : "changes"} on across{" "}
              {message.plans.length} {message.plans.length === 1 ? "market" : "markets"}. Nothing is edited until you approve.
            </p>
            <Button onClick={approve} disabled={busy || active === 0} className="px-5">
              {busy ? <Loader2 className="animate-spin" /> : <Check />} Approve and localize
            </Button>
          </div>
        )}
      </div>
    </AgentRow>
  );
}

function ChangeRow({
  index,
  jobId,
  change,
  images,
  choice,
  locked,
  onChange,
}: {
  index: number;
  jobId: string;
  change: Change;
  images?: string[];
  choice: Choice;
  locked: boolean;
  onChange: (patch: Partial<Choice>) => void;
}) {
  const file = useRef<HTMLInputElement>(null);
  const [working, setWorking] = useState<RefSource | null>(null);
  const review = change.type === "review";
  const visual = VISUAL_TYPES.includes(change.type);
  const off = choice.skipped || review;
  const carousel = (images?.length ?? 0) > 1;

  async function generate() {
    if (IS_SHOWCASE) return toast(READ_ONLY_HINT);
    setWorking("ai");
    const res = await fetch(`/api/jobs/${jobId}/reference`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ changeId: change.id }),
    });
    const data = await res.json().catch(() => ({}));
    setWorking(null);
    if (!res.ok) return toast.error(data.error ?? "Could not generate the reference image");
    onChange({ ref: "ai", refUrl: data.url });
  }

  async function upload(f?: File) {
    if (!f) return;
    if (IS_SHOWCASE) return toast(READ_ONLY_HINT);
    setWorking("upload");
    const form = new FormData();
    form.append("file", f);
    const res = await fetch("/api/uploads", { method: "POST", body: form });
    const data = await res.json().catch(() => ({}));
    setWorking(null);
    if (!res.ok) return toast.error(data.error ?? "Upload failed");
    onChange({ ref: "upload", refUrl: data.url });
  }

  function pickRef(ref: RefSource) {
    if (ref === "prompt") return onChange({ ref, refUrl: undefined });
    if (ref === "upload") return file.current?.click();
    void generate();
  }

  return (
    <div
      className={cn("rise rounded-xl bg-lift/50 p-4 transition-opacity duration-200", off && "opacity-55")}
      style={{ "--i": index } as React.CSSProperties}
    >
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1 space-y-1.5">
          <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] text-muted-foreground">
            {review ? <span className="font-medium text-protect">A person decides</span> : <KindBadge kind={change.kind} />}
            <span>{TYPE_LABEL[change.type]}</span>
            {carousel && !change.slides.length && <span>All slides</span>}
          </p>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[15px] font-medium">
            <span className="text-muted-foreground line-through decoration-muted-foreground/40" dir="auto">{change.target}</span>
            {!review && <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />}
            {!review && <span dir="auto">{visual ? change.replacement : choice.text}</span>}
          </p>
          <p className="text-[15px] leading-relaxed text-foreground/75">{change.reason}</p>
          {review && <p className="text-sm text-muted-foreground">Not edited: people and clothing are never changed by AI.</p>}
        </div>
        {carousel && change.slides.length > 0 && (
          <SlideThumbs images={images!} slides={change.slides} />
        )}
        {!review && (
          <Switch
            checked={!choice.skipped}
            disabled={locked}
            onCheckedChange={(on) => onChange({ skipped: !on })}
            aria-label={choice.skipped ? "Turn this change on" : "Turn this change off"}
            className="mt-1"
          />
        )}
      </div>

      <div className="unfold" data-open={!off}>
        <div>
          {visual && (
            <div className="space-y-3 pt-4">
              <div className="inline-flex flex-wrap gap-1 rounded-full bg-raised p-1" role="radiogroup" aria-label="Where the look comes from">
                {(Object.keys(REF_LABEL) as RefSource[]).map((r) => {
                  const Icon = REF_ICON[r];
                  const on = choice.ref === r;
                  return (
                    <button
                      key={r}
                      role="radio"
                      aria-checked={on}
                      disabled={locked || !!working}
                      onClick={() => pickRef(r)}
                      className={cn(
                        "press flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] disabled:opacity-60",
                        on ? "bg-lift text-foreground" : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {working === r ? <Loader2 className="size-3.5 animate-spin" /> : <Icon className="size-3.5" />}
                      {REF_LABEL[r]}
                    </button>
                  );
                })}
              </div>
              <input ref={file} type="file" accept="image/*" hidden onChange={(e) => upload(e.target.files?.[0])} />
              {working && <div className="shimmer size-28 rounded-lg bg-raised" aria-label="Preparing the reference image" />}
              {!working && choice.ref !== "prompt" && choice.refUrl && (
                <div className="flex items-end gap-2 animate-in fade-in zoom-in-95 duration-300">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={choice.refUrl} alt="Reference" className="size-28 rounded-lg object-cover" />
                  {choice.ref === "ai" && !locked && (
                    <Button size="sm" variant="ghost" onClick={generate}>
                      <RefreshCw /> Another one
                    </Button>
                  )}
                </div>
              )}
              {choice.ref === "prompt" && (
                <p className="text-sm text-muted-foreground">The edit model draws it from Manus&apos;s description.</p>
              )}
            </div>
          )}

          {!visual && !review && (
            <div className="space-y-1.5 pt-4">
              <input
                value={choice.text}
                disabled={locked}
                dir="auto"
                onChange={(e) => onChange({ text: e.target.value })}
                aria-label="Text that goes on the image"
                className="h-10 w-full rounded-lg bg-raised px-3 text-[15px] outline-none ring-1 ring-input transition-shadow focus:ring-2 focus:ring-primary disabled:opacity-70"
              />
              <p className="text-[13px] text-muted-foreground">
                {choice.text.trim() === change.replacement ? "AI text. Type over it to use your own." : "Your own text."}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Which carousel slides a change is on, as small numbered thumbnails (easier to match than "slide 2, 3").
function SlideThumbs({ images, slides }: { images: string[]; slides: number[] }) {
  return (
    <div className="flex shrink-0 gap-1" aria-label={`On slide ${slides.join(", ")}`}>
      {slides.slice(0, 3).map((n) => (
        <div key={n} className="relative h-10 w-8 overflow-hidden rounded-md bg-raised">
          {images[n - 1] && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={images[n - 1]} alt="" className="size-full object-cover" />
          )}
          <span className="absolute right-0.5 bottom-0.5 rounded bg-deep/80 px-1 text-[11px] leading-4 text-foreground tabular-nums">
            {n}
          </span>
        </div>
      ))}
      {slides.length > 3 && (
        <span className="flex h-10 items-center px-1 text-[13px] text-muted-foreground tabular-nums">+{slides.length - 3}</span>
      )}
    </div>
  );
}
