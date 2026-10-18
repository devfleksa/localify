"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, BadgeCheck, Check, Loader2, Lock, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { MARKETS, type MarketCode } from "@/lib/markets";
import { parseSource } from "@/lib/source";
import type { Profile } from "@/lib/apify";
import { cn } from "@/lib/utils";
import { SetupBanner, useSetup } from "./setup-banner";
import { IS_SHOWCASE, READ_ONLY_HINT } from "@/lib/showcase";

const MAX_POSTS = 200;
const QUICK = [12, 24, 50, 100, 200];
const LIMITS = [50, 100, 200]; // no Apify token: how many local posts to load
const compact = (n: number) => Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);

// Copy language per market (docs/decisions.md, "Market rules").
const LANGUAGE: Record<MarketCode, string> = {
  US: "English",
  TR: "Türkçe",
  JP: "日本語",
  SA: "العربية",
  IN: "हिन्दी",
  BR: "Português",
};

// Who approves the edits: chosen in the bottom bar, next to the start button.
const MODES = [
  { review: true, label: "Review", button: "Scan & review", text: "You approve each market's plan before any edit." },
  { review: false, label: "Auto", button: "Scan & auto-edit", text: "The agent localizes every flagged post, one after another. Stop any time." },
];

type Account =
  | { state: "empty" }
  | { state: "checking" }
  | { state: "error"; message: string }
  | { state: "verified"; profile: Profile }
  | { state: "local" }; // no APIFY_TOKEN: runs on posts already in data/uploads/library/

// New brand: three guided steps (account → posts → markets & mode) that unlock in order, then one Start button.
export function BrandSetup() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [account, setAccount] = useState<Account>({ state: "empty" });
  const [apify, setApify] = useState(true);
  const [limit, setLimit] = useState(24);
  const [markets, setMarkets] = useState<MarketCode[]>(MARKETS.map((m) => m.code));
  const [review, setReview] = useState(true);
  const [starting, setStarting] = useState(false);
  // Each account check gets a number; an answer for an older check (the handle changed since) is ignored.
  const check = useRef(0);

  const source = parseSource(url);
  const profile = account.state === "verified" ? account.profile : null;
  const blocked = !!profile && (profile.private || profile.posts === 0);
  const ready = (account.state === "verified" && !blocked) || account.state === "local";
  const maxPosts = profile ? Math.max(1, Math.min(profile.posts, MAX_POSTS)) : MAX_POSTS;
  const posts = Math.min(limit, maxPosts);
  // Manus and fal are needed for every run; without Apify the app can still use posts saved on disk.
  const setup = useSetup();
  const keysOk = !setup || setup.checks.every((c) => c.ok || c.key === "APIFY_TOKEN");
  const canStart = ready && markets.length > 0 && !starting && keysOk;

  function changeUrl(v: string) {
    setUrl(v);
    check.current++;
    if (account.state !== "empty") setAccount({ state: "empty" });
  }

  async function verify() {
    if (!source || account.state === "checking") return;
    if (IS_SHOWCASE) return toast(READ_ONLY_HINT);
    if (source.platform !== "instagram") return setAccount({ state: "error", message: "Only Instagram is supported for now." });
    if (!apify) return setAccount({ state: "local" });
    setAccount({ state: "checking" });
    const id = ++check.current;
    const res = await fetch("/api/instagram/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    if (id !== check.current) return; // the handle changed while this check ran
    if (res?.status === 501) {
      setApify(false);
      setLimit(100);
      return setAccount({ state: "local" });
    }
    if (!res?.ok) return setAccount({ state: "error", message: data.error ?? "Could not check the account." });
    const p = data as Profile;
    setLimit(Math.min(p.posts, 24) || 1);
    setAccount({ state: "verified", profile: p });
  }

  async function start() {
    if (!canStart) return;
    if (IS_SHOWCASE) return toast(READ_ONLY_HINT);
    setStarting(true);
    const res = await fetch("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, markets, limit: posts, mode: review ? "review" : "auto" }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data.error ?? "Could not start");
      setStarting(false);
      return;
    }
    router.push(`/jobs/${data.id}`);
  }

  const toggle = (code: MarketCode) =>
    setMarkets((m) => (m.includes(code) ? m.filter((x) => x !== code) : [...m, code]));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto grid w-full max-w-6xl gap-10 px-5 pt-10 pb-16 sm:px-8 lg:grid-cols-12 lg:gap-12 lg:pt-20">
          <header className="@container lg:col-span-5 lg:sticky lg:top-20 lg:self-start">
            {/* Sized by its column (cqi), so "Localize a brand's" always fits on one line and the headline stays two lines. */}
            <h1 className="text-[clamp(1.75rem,11cqi,3.75rem)] font-light leading-[1.02] tracking-[-0.035em]">
              <span className="mask-line"><span style={{ "--i": 0 } as React.CSSProperties}>Localize a brand&apos;s</span></span>
              <span className="mask-line"><span style={{ "--i": 1 } as React.CSSProperties}>whole library</span></span>
            </h1>
            <p className="rise mt-6 max-w-[38ch] text-[17px] leading-relaxed text-foreground/85" style={{ "--i": 4 } as React.CSSProperties}>
              Connect an Instagram account. The agent scans every image post, finds what has to change for each
              market, and rebuilds the posts you pick.
            </p>
            <ul className="rise mt-8 hidden space-y-3 text-[15px] text-muted-foreground lg:block" style={{ "--i": 6 } as React.CSSProperties}>
              <li><span className="text-foreground">Scan</span> costs cents per post: text, prices, places, objects.</li>
              <li><span className="text-foreground">Plan</span> per market by Manus, with the reason for each change.</li>
              <li><span className="text-foreground">Edit</span> only what you approve, slide by slide.</li>
            </ul>
          </header>

          <div className="space-y-3 lg:col-span-7">
            <SetupBanner setup={setup} />
            {/* Account */}
            <Step title="Instagram account" done={ready} index={0}>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  verify();
                }}
                className="flex items-center gap-2 rounded-xl bg-background p-1.5 pl-4 ring-1 ring-input transition-shadow focus-within:ring-2 focus-within:ring-primary"
              >
                <span className="text-muted-foreground">@</span>
                <input
                  value={url}
                  onChange={(e) => changeUrl(e.target.value)}
                  placeholder="lego or instagram.com/lego"
                  aria-label="Instagram handle or profile URL"
                  autoFocus
                  spellCheck={false}
                  className="h-10 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground/70"
                />
                {ready ? (
                  <span className="flex h-10 items-center gap-1.5 px-3 text-sm text-primary animate-in fade-in zoom-in-95">
                    <Check className="size-4" /> {account.state === "local" ? "Local posts" : "Verified"}
                  </span>
                ) : (
                  <Button type="submit" className="h-10 px-5" disabled={!source || account.state === "checking"}>
                    {account.state === "checking" ? <Loader2 className="animate-spin" /> : null}
                    {account.state === "checking" ? "Checking" : "Verify"}
                  </Button>
                )}
              </form>
              {url && !source && <p className="mt-2 text-sm text-muted-foreground">Type a handle like @lego or paste the profile link.</p>}

              <div className="unfold" data-open={account.state !== "empty"}>
                <div>
                  <div className="pt-3">
                    {account.state === "checking" && <ProfileSkeleton />}
                    {account.state === "error" && (
                      <p className="rounded-xl bg-destructive/10 px-4 py-3 text-[15px] text-destructive animate-in fade-in">{account.message}</p>
                    )}
                    {profile && <ProfileCard profile={profile} onClear={() => changeUrl("")} />}
                    {account.state === "local" && (
                      <p className="rounded-xl bg-lift/60 px-4 py-3 text-[15px] text-foreground/85 animate-in fade-in">
                        No Apify token set, so the account can&apos;t be checked. The run uses the posts already saved in{" "}
                        <code className="text-sm">data/uploads/library/</code>.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </Step>

            {/* Posts */}
            <Step title="How many posts" done={ready} locked={!ready} index={1}>
              {profile || !apify ? (
                <div className="space-y-4">
                  <p className="flex items-baseline gap-2">
                    <span className="text-5xl font-light tracking-[-0.03em] tabular-nums">{posts}</span>
                    <span className="text-muted-foreground">latest image posts</span>
                  </p>
                  {profile ? (
                    <>
                      <input
                        type="range"
                        min={1}
                        max={maxPosts}
                        value={posts}
                        onChange={(e) => setLimit(Number(e.target.value))}
                        aria-label="Number of posts"
                        className="w-full accent-primary"
                      />
                      <Chips
                        options={QUICK.filter((n) => n < maxPosts).concat(maxPosts)}
                        value={posts}
                        onChange={setLimit}
                        label={(n) => (n === maxPosts && n !== 200 ? `All ${n}` : `${n}`)}
                      />
                    </>
                  ) : (
                    <Chips options={LIMITS} value={limit} onChange={setLimit} label={(n) => `${n}`} />
                  )}
                  <p className="text-sm text-muted-foreground">Reels are skipped. Posts already downloaded are never fetched twice.</p>
                </div>
              ) : (
                <p className="text-[15px] text-muted-foreground">Verify the account first.</p>
              )}
            </Step>

            {/* Markets + mode */}
            <Step title="Markets" done={ready && markets.length > 0} locked={!ready} index={2}>
              <div className="mb-3 flex items-center justify-between">
                <p className="text-[15px] text-muted-foreground">
                  {markets.length} of {MARKETS.length} selected
                </p>
                <button
                  type="button"
                  className="press rounded-full px-3 py-1 text-sm text-muted-foreground hover:bg-lift hover:text-foreground"
                  onClick={() => setMarkets(markets.length === MARKETS.length ? [] : MARKETS.map((m) => m.code))}
                >
                  {markets.length === MARKETS.length ? "Clear" : "Select all"}
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {MARKETS.map((m) => {
                  const on = markets.includes(m.code);
                  return (
                    <button
                      key={m.code}
                      type="button"
                      onClick={() => toggle(m.code)}
                      aria-pressed={on}
                      className={cn(
                        "press relative flex flex-col items-start gap-3 rounded-xl p-4 text-left",
                        on ? "bg-primary/15 text-foreground" : "bg-lift/40 text-muted-foreground hover:bg-lift/80",
                      )}
                    >
                      <span className={cn("text-3xl leading-none transition-[filter,opacity]", !on && "opacity-60 grayscale")}>{m.flag}</span>
                      <span>
                        <span className="block text-[15px] font-medium text-foreground">{m.name}</span>
                        <span className="block text-sm">{LANGUAGE[m.code]}</span>
                      </span>
                      <span
                        className={cn(
                          "absolute top-3 right-3 flex size-5 items-center justify-center rounded-full transition-[transform,scale,background-color] duration-200",
                          on ? "scale-100 bg-primary text-primary-foreground" : "scale-75 bg-lift",
                        )}
                      >
                        {on && <Check className="size-3.5" strokeWidth={3} />}
                      </span>
                    </button>
                  );
                })}
              </div>
            </Step>

          </div>
        </div>
      </div>

      {/* Summary + mode + start: always on screen, so the Review/Auto choice is seen right where the run starts. */}
      <div className="bg-raised">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-5 py-4 sm:px-8">
          <div className="min-w-0 flex-1 basis-72">
            <p className="text-[15px] text-muted-foreground">
              {ready ? (
                <>
                  Scan <span className="text-foreground">{posts} posts</span> from{" "}
                  <span className="text-foreground">@{profile?.handle ?? source?.handle}</span> for{" "}
                  <span className="text-foreground">
                    {markets.length ? markets.map((c) => MARKETS.find((m) => m.code === c)!.flag).join(" ") : "no markets"}
                  </span>
                </>
              ) : (
                "Start by verifying an Instagram account."
              )}
            </p>
            <p key={String(review)} className="h-10 text-sm leading-5 text-muted-foreground/80 animate-in fade-in duration-300 sm:h-5 sm:truncate">
              {MODES.find((m) => m.review === review)!.text}
            </p>
          </div>
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <div className="flex shrink-0 rounded-full bg-lift/70 p-1" role="radiogroup" aria-label="Who approves the edits">
              {MODES.map((m) => {
                const active = review === m.review;
                return (
                  <button
                    key={m.label}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    title={m.text}
                    onClick={() => setReview(m.review)}
                    className={cn(
                      "press rounded-full px-4 py-2 text-sm",
                      active ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {m.label}
                  </button>
                );
              })}
            </div>
            <Button size="lg" className="flex-1 sm:flex-none" disabled={!canStart} onClick={start}>
              <span className="grid">
                {MODES.map((m) => (
                  <span
                    key={m.label}
                    aria-hidden={m.review !== review}
                    className={cn(
                      "col-start-1 row-start-1 flex items-center justify-center gap-2 transition-opacity duration-200",
                      m.review === review ? "opacity-100" : "opacity-0",
                    )}
                  >
                    {starting && m.review === review ? <Loader2 className="animate-spin" /> : null}
                    {starting ? "Starting" : m.button}
                    {!starting && <ArrowRight />}
                  </span>
                ))}
              </span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Step({
  title,
  done,
  locked,
  index,
  children,
}: {
  title: string;
  done: boolean;
  locked?: boolean;
  index: number;
  children: React.ReactNode;
}) {
  return (
    <section
      className={cn("rise rounded-2xl bg-raised p-5 transition-opacity duration-300 sm:p-6", locked && "pointer-events-none opacity-45")}
      style={{ "--i": index + 2 } as React.CSSProperties}
      inert={locked}
    >
      <h2 className="mb-4 flex items-center gap-2.5 text-lg font-medium tracking-[-0.01em]">
        <span
          className={cn(
            "flex size-5 items-center justify-center rounded-full transition-colors duration-300",
            done ? "bg-primary text-primary-foreground" : "ring-1 ring-muted-foreground/50",
          )}
        >
          {done && <Check className="size-3 animate-in zoom-in-50" strokeWidth={3} />}
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Chips({
  options,
  value,
  onChange,
  label,
}: {
  options: number[];
  value: number;
  onChange: (n: number) => void;
  label: (n: number) => string;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          aria-pressed={value === n}
          className={cn(
            "press rounded-full px-3.5 py-1.5 text-sm tabular-nums",
            value === n ? "bg-primary text-primary-foreground" : "bg-lift/70 text-muted-foreground hover:bg-lift hover:text-foreground",
          )}
        >
          {label(n)}
        </button>
      ))}
    </div>
  );
}

function ProfileSkeleton() {
  return (
    <div className="shimmer flex items-center gap-4 rounded-xl bg-lift/50 p-4" aria-label="Checking the account">
      <div className="size-14 shrink-0 rounded-full bg-lift" />
      <div className="flex-1 space-y-2">
        <div className="h-4 w-40 rounded bg-lift" />
        <div className="h-3.5 w-56 rounded bg-lift" />
      </div>
      <span className="shimmer-text hidden text-sm sm:block">Looking up the account</span>
    </div>
  );
}

function ProfileCard({ profile, onClear }: { profile: Profile; onClear: () => void }) {
  return (
    <div className="flex items-center gap-4 rounded-xl bg-lift/50 p-4 animate-in fade-in slide-in-from-bottom-2 duration-500">
      {profile.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={profile.avatarUrl} alt="" className="size-14 shrink-0 rounded-full bg-lift object-cover" />
      ) : (
        <div className="flex size-14 shrink-0 items-center justify-center rounded-full bg-lift text-lg uppercase">{profile.handle.slice(0, 2)}</div>
      )}
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 truncate text-[17px] font-medium">
          {profile.fullName || `@${profile.handle}`}
          {profile.verified && <BadgeCheck className="size-4 shrink-0 text-textual" aria-label="Verified" />}
        </p>
        <p className="truncate text-sm text-muted-foreground">
          @{profile.handle} · <span className="text-foreground/85">{compact(profile.followers)}</span> followers ·{" "}
          <span className="text-foreground/85">{compact(profile.posts)}</span> posts
        </p>
        {profile.private && (
          <p className="mt-1 flex items-center gap-1.5 text-sm text-destructive">
            <Lock className="size-3.5" /> Private account: its posts can&apos;t be read.
          </p>
        )}
        {!profile.private && profile.posts === 0 && <p className="mt-1 text-sm text-destructive">This account has no posts.</p>}
      </div>
      <button onClick={onClear} aria-label="Use another account" className="press rounded-full p-2 text-muted-foreground hover:bg-lift hover:text-foreground">
        <X className="size-4" />
      </button>
    </div>
  );
}
