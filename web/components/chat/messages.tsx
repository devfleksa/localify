import { ArrowUpRight, Check, CircleAlert } from "lucide-react";
import { market } from "@/lib/markets";
import { cn } from "@/lib/utils";
import type { Message } from "@/lib/types";
import { BASE_PATH } from "@/lib/showcase";

type AgentTextMessage = Extract<Message, { kind: "agent_text" }>;

export function AgentAvatar() {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={`${BASE_PATH}/logo.svg`} alt="" aria-hidden="true" className="mt-0.5 size-7 shrink-0" />
  );
}

// Agent row: avatar column + content. Used by the activity feed and the rich cards.
export function AgentRow({ children, avatar = true }: { children: React.ReactNode; avatar?: boolean }) {
  return (
    <div className="rise flex gap-3">
      {avatar ? <AgentAvatar /> : <span className="w-7 shrink-0" />}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

// Consecutive agent messages read as one feed of steps: finished steps get a quiet check, the step the agent
// is on now shimmers. "Manus: …" lines are the planner thinking aloud and sit indented under the step.
export function AgentActivity({ messages, liveId, running }: { messages: AgentTextMessage[]; liveId?: string; running: boolean }) {
  return (
    <AgentRow>
      <ol className="space-y-2.5 pt-0.5">
        {messages.map((m) => {
          const live = m.id === liveId;
          const manus = m.text.startsWith("Manus:");
          return (
            <li key={m.id} className={cn("rise flex gap-2.5", manus && "pl-6")}>
              {!manus && (
                <span className="mt-[7px] flex size-3.5 shrink-0 items-center justify-center">
                  {live ? (
                    <span className="pulse-dot size-2 rounded-full bg-primary" />
                  ) : m.pending && !running ? (
                    <span className="size-2 rounded-full ring-1 ring-muted-foreground" title="Didn't finish" />
                  ) : (
                    <Check className="size-3.5 text-muted-foreground" strokeWidth={2.5} />
                  )}
                </span>
              )}
              <div className="min-w-0">
                <p
                  className={cn(
                    "text-[15px] leading-relaxed",
                    manus ? "text-muted-foreground" : "text-foreground/90",
                    live && "shimmer-text",
                  )}
                  dir="auto"
                >
                  {manus ? m.text.replace(/^Manus:\s*/, "") : m.text}
                </p>
                {m.link && (
                  <a
                    href={m.link.href}
                    target="_blank"
                    rel="noreferrer"
                    className="press mt-0.5 inline-flex items-center gap-1 text-sm text-primary underline decoration-transparent underline-offset-4 hover:decoration-current"
                  >
                    {m.link.label} <ArrowUpRight className="size-3.5" />
                  </a>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </AgentRow>
  );
}

export function UserMessage({ message }: { message: Extract<Message, { kind: "user" }> }) {
  return (
    <div className="rise flex justify-end">
      <div className="w-full max-w-md rounded-2xl rounded-tr-md bg-lift px-4 py-3.5">
        <p className="text-[15px]">
          Scan the latest <span className="font-medium">{message.limit} image posts</span> from{" "}
          <a href={message.source.url} target="_blank" rel="noreferrer" className="font-medium underline decoration-foreground/30 underline-offset-4 hover:decoration-foreground">
            @{message.source.handle}
          </a>{" "}
          and localize them for:
        </p>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {message.markets.map((c) => (
            <span key={c} className="rounded-full bg-raised px-2.5 py-1 text-[13px]">
              {market(c).flag} {market(c).name}
            </span>
          ))}
        </div>
        <p className="mt-2.5 text-[13px] text-muted-foreground">
          {message.mode === "review" ? "Review mode: I approve each plan." : "Auto mode: the agent localizes every flagged post."}
        </p>
      </div>
    </div>
  );
}

export function ErrorMessage({ text }: { text: string }) {
  return (
    <AgentRow>
      <p className="flex items-start gap-2.5 rounded-xl bg-destructive/10 px-4 py-3 text-[15px] text-destructive">
        <CircleAlert className="mt-0.5 size-4 shrink-0" /> {text}
      </p>
    </AgentRow>
  );
}
