"use client";

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { IS_SHOWCASE } from "@/lib/showcase";

type Setup = { ok: boolean; checks: { key: string; name: string; ok: boolean; detail: string }[] };

// Live key checks from /api/setup (same checks as `npm run setup -- --check`), loaded once.
export function useSetup() {
  const [setup, setSetup] = useState<Setup | null>(null);
  useEffect(() => {
    if (IS_SHOWCASE) return; // no server in the replay
    let alive = true;
    fetch("/api/setup", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => alive && setSetup(s))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return setup;
}

// Start page: which key is missing or broken, and the command that fixes it.
export function SetupBanner({ setup }: { setup: Setup | null }) {
  const bad = setup?.checks.filter((c) => !c.ok) ?? [];
  if (!bad.length) return null;
  return (
    <div className="flex items-start gap-3 rounded-2xl bg-destructive/10 px-5 py-4 text-[15px] text-destructive animate-in fade-in">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 space-y-1">
        {bad.map((c) => (
          <p key={c.key}>
            <span className="font-medium">{c.name}</span>: {c.detail}
          </p>
        ))}
        <p className="text-foreground/85">
          Run <code className="rounded bg-lift px-1.5 py-0.5 text-sm">npm run setup</code> in <code className="text-sm">web/</code>, then restart the server.
        </p>
      </div>
    </div>
  );
}
