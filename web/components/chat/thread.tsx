"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Play, Plus, Square } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { AgentActivity, AgentRow, ErrorMessage, UserMessage } from "./messages";
import { LibraryPanel } from "./library-panel";
import { PlanCard } from "./plan-card";
import { ResultsGrid } from "./results-grid";
import { cn } from "@/lib/utils";
import { autoQueue } from "@/lib/findings";
import type { Job, Message } from "@/lib/types";
import { IS_SHOWCASE, READ_ONLY_HINT, apiGet } from "@/lib/showcase";

type AgentText = Extract<Message, { kind: "agent_text" }>;
type Block = { kind: "activity"; id: string; messages: AgentText[] } | { kind: "single"; message: Message };

// Runs of agent text become one activity feed; cards and user/error messages stand on their own.
function blocks(messages: Message[]): Block[] {
  const out: Block[] = [];
  for (const m of messages) {
    const last = out[out.length - 1];
    if (m.kind === "agent_text") {
      if (last?.kind === "activity") last.messages.push(m);
      else out.push({ kind: "activity", id: m.id, messages: [m] });
    } else out.push({ kind: "single", message: m });
  }
  return out;
}

// Job screen: agent chat on the left, the brand's library on the right (tabs on small screens).
export function Thread({ jobId }: { jobId: string }) {
  const [job, setJob] = useState<Job | null>(null);
  const [missing, setMissing] = useState(false);
  const [tab, setTab] = useState<"chat" | "library">("chat");
  const bottom = useRef<HTMLDivElement>(null);
  const busy = job?.status === "running" || job?.status === "awaiting_review";

  const load = useCallback(async () => {
    const res = await apiGet(`/api/jobs/${jobId}`).catch(() => null);
    if (!res) return;
    if (res.status === 404) return setMissing(true);
    if (res.ok) setJob(await res.json());
  }, [jobId]);

  // Poll fast while the agent works, slowly otherwise (the user can pick another post any time). The replay loads once.
  useEffect(() => {
    load();
    if (IS_SHOWCASE) return;
    const t = setInterval(load, busy || !job ? 1000 : 4000);
    return () => clearInterval(t);
  }, [load, busy, job === null]); // eslint-disable-line react-hooks/exhaustive-deps

  const count = job?.messages.length ?? 0;
  useEffect(() => {
    if (IS_SHOWCASE) return; // the replay reads from the top: request, scan, plans, results
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [count]);

  async function select(itemId: string) {
    if (IS_SHOWCASE) return toast(READ_ONLY_HINT);
    const res = await fetch(`/api/jobs/${jobId}/select`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return toast.error(data.error ?? "Could not start this post");
    setTab("chat");
    load();
  }

  if (missing)
    return (
      <div className="m-auto space-y-4 text-center">
        <p className="text-[15px] text-muted-foreground">This brand doesn&apos;t exist any more.</p>
        <Button asChild><Link href="/"><Plus /> New brand</Link></Button>
      </div>
    );
  if (!job) return <ThreadSkeleton />;

  const item = (id: string) => job.library.find((i) => i.id === id);
  const working = job.status === "running";
  // Only the newest pending step shimmers, and only while the agent runs.
  const liveId = working ? job.messages.findLast((m) => m.kind === "agent_text" && m.pending)?.id : undefined;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex gap-1 bg-sidebar p-1.5 lg:hidden" role="tablist">
        {(["chat", "library"] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={cn(
              "press flex-1 rounded-full py-2 text-sm",
              tab === t ? "bg-raised text-foreground" : "text-muted-foreground",
            )}
          >
            {t === "library" ? `Library · ${job.library.length}` : "Agent"}
          </button>
        ))}
      </div>
      <div className="flex min-h-0 flex-1">
        <main
          className={cn(
            "min-h-0 w-full flex-col overflow-y-auto lg:flex lg:w-1/2 lg:shrink-0",
            tab === "chat" ? "flex" : "hidden",
          )}
        >
          <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6 sm:px-6">
            {blocks(job.messages).map((b) => {
              if (b.kind === "activity") return <AgentActivity key={b.id} messages={b.messages} liveId={liveId} running={working} />;
              const m = b.message;
              switch (m.kind) {
                case "user":
                  return <UserMessage key={m.id} message={m} />;
                case "plan":
                  return <PlanCard key={m.id} jobId={job.id} message={m} item={item(m.itemId)} />;
                case "results":
                  return <ResultsGrid key={m.id} jobId={job.id} message={m} item={item(m.itemId)} handle={job.source.handle} />;
                case "error":
                  return <ErrorMessage key={m.id} text={m.text} />;
                default:
                  return null;
              }
            })}
            {working && !liveId && (
              <AgentRow avatar={false}>
                <p className="shimmer-text text-[15px]">Working</p>
              </AgentRow>
            )}
            {job.status === "failed" && (
              <div className="flex justify-center pt-4">
                <Button asChild variant="secondary">
                  <Link href="/"><Plus /> Start over</Link>
                </Button>
              </div>
            )}
            <div ref={bottom} />
          </div>
          <AutoBar job={job} onChange={load} />
        </main>
        <div className={cn("min-h-0 min-w-0 flex-1 lg:flex", tab === "library" ? "flex" : "hidden")}>
          <LibraryPanel job={job} onSelect={select} />
        </div>
      </div>
    </div>
  );
}

// Auto mode: progress through the flagged posts with Stop while the loop runs, Resume once it stopped with posts left.
function AutoBar({ job, onChange }: { job: Job; onChange: () => void }) {
  const [sending, setSending] = useState(false);
  if (job.mode !== "auto" || IS_SHOWCASE) return null; // the replay shows what the loop did, not its controls
  // Auto jobs from before the loop (2026-10-15) have no `auto` yet: they can still be resumed.
  const { running = false, stopping = false, done = [] } = job.auto ?? {};
  const left = autoQueue(job).length;
  const idle = job.status === "ready" || job.status === "done";
  if (!running && (!left || !idle)) return null;
  const scanning = running && !job.library.some((i) => i.scan);

  async function send(run: boolean) {
    setSending(true);
    const res = await fetch(`/api/jobs/${job.id}/auto`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ run }),
    }).catch(() => null);
    const data = await res?.json().catch(() => ({}));
    if (!res?.ok) toast.error(data?.error ?? "Could not reach the server");
    setSending(false);
    onChange();
  }

  return (
    <div className="sticky bottom-0 mt-auto bg-background/90 px-4 pb-4 pt-2 backdrop-blur sm:px-6" /* taste-skill-ignore: the page's one sticky bar */>
      <div className="mx-auto flex w-full max-w-3xl items-center gap-3 rounded-2xl bg-raised py-2.5 pr-2.5 pl-4">
        <span className={cn("size-2 shrink-0 rounded-full", running ? "pulse-dot bg-primary" : "bg-muted-foreground/60")} />
        <p className={cn("min-w-0 flex-1 truncate text-[15px]", running && !stopping && "shimmer-text")}>
          {stopping
            ? "Stopping after the current step…"
            : scanning
              ? "Auto mode · scanning the library"
              : running
                ? `Auto mode · post ${Math.min(done.length + 1, done.length + left)} of ${done.length + left}`
                : `Auto mode paused · ${left} ${left === 1 ? "post" : "posts"} left`}
        </p>
        {running ? (
          <Button size="sm" variant="secondary" disabled={sending || stopping} onClick={() => send(false)}>
            <Square className="fill-current" /> Stop
          </Button>
        ) : (
          <Button size="sm" disabled={sending} onClick={() => send(true)}>
            <Play className="fill-current" /> Resume
          </Button>
        )}
      </div>
    </div>
  );
}

function ThreadSkeleton() {
  return (
    <div className="flex min-h-0 flex-1">
      <div className="w-full space-y-4 p-6 lg:w-1/2">
        <div className="shimmer ml-auto h-28 max-w-md rounded-2xl bg-raised" />
        {[0.7, 0.5, 0.6].map((w, i) => (
          <div key={i} className="shimmer h-4 rounded bg-raised" style={{ width: `${w * 100}%` }} />
        ))}
      </div>
      <div className="hidden flex-1 bg-raised p-5 lg:block">
        <div className="grid grid-cols-3 gap-2">
          {Array.from({ length: 9 }, (_, i) => (
            <div key={i} className="shimmer aspect-[4/5] rounded-lg bg-lift/60" />
          ))}
        </div>
      </div>
    </div>
  );
}
