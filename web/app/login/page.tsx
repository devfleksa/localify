"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/chat/logo";
import { MARKETS } from "@/lib/markets";
import { TAGLINE } from "@/lib/brand";
import { cn } from "@/lib/utils";

export default function LoginPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    if (res.ok) {
      router.replace("/");
      router.refresh();
    } else {
      setError("That code doesn't work.");
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-dvh flex-col px-5 py-6 sm:px-8">
      <Logo className="text-[17px]" />
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-16">
        <h1 className="text-[clamp(2.5rem,1.8rem+3vw,4rem)] font-light leading-[1.02] tracking-[-0.035em]">
          <span className="mask-line"><span style={{ "--i": 0 } as React.CSSProperties}>Translate</span></span>
          <span className="mask-line"><span style={{ "--i": 1 } as React.CSSProperties}>the culture</span></span>
        </h1>
        <p className="rise mt-5 text-[17px] leading-relaxed text-foreground/85" style={{ "--i": 4 } as React.CSSProperties}>
          {TAGLINE}
        </p>
        <form onSubmit={submit} className="rise mt-10 space-y-3" style={{ "--i": 6 } as React.CSSProperties}>
          <div
            className={cn(
              "flex items-center gap-2 rounded-full bg-raised p-1.5 pl-5 ring-1 ring-input transition-shadow focus-within:ring-2 focus-within:ring-primary",
              error && "ring-destructive animate-[shake_360ms_var(--ease-out)]",
            )}
          >
            <input
              autoFocus
              type="password"
              placeholder="Access code"
              aria-label="Access code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="h-10 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground/70"
            />
            <Button type="submit" className="h-10 px-5" disabled={!code || busy}>
              {busy ? <Loader2 className="animate-spin" /> : <>Enter <ArrowRight /></>}
            </Button>
          </div>
          {error && <p className="pl-5 text-sm text-destructive">{error}</p>}
        </form>
      </div>
      <p className="rise text-2xl tracking-[0.2em]" style={{ "--i": 8 } as React.CSSProperties} aria-label="Six markets">
        {MARKETS.map((m) => m.flag).join(" ")}
      </p>
    </main>
  );
}
