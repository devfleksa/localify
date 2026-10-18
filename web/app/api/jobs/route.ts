import { NextResponse, type NextRequest } from "next/server";
import { isAuthed, unauthorized } from "@/lib/auth";
import { isMarket } from "@/lib/markets";
import { parseSource } from "@/lib/source";
import { listJobs, newId, saveJob } from "@/lib/store";
import { engine } from "@/lib/engine";
import { avatarOf } from "@/lib/importer";
import type { Job, Mode } from "@/lib/types";

export async function GET(req: NextRequest) {
  if (!isAuthed(req)) return unauthorized();
  return NextResponse.json(
    listJobs().map(({ id, title, status, createdAt, markets, source }) => ({
      id,
      title,
      status,
      createdAt,
      markets,
      source,
      avatar: avatarOf(source.handle),
    })),
  );
}

export async function POST(req: NextRequest) {
  if (!isAuthed(req)) return unauthorized();
  const body = (await req.json().catch(() => ({}))) as { url?: string; markets?: string[]; mode?: string; limit?: number };
  const source = parseSource(body.url ?? "");
  const markets = (body.markets ?? []).filter(isMarket);
  const mode: Mode = body.mode === "auto" ? "auto" : "review";
  const limit = Math.min(Math.max(Math.round(Number(body.limit) || 100), 1), 500);

  if (!source) return NextResponse.json({ error: "Enter an Instagram handle or profile URL" }, { status: 400 });
  if (source.platform !== "instagram")
    return NextResponse.json({ error: "Only Instagram is supported for now" }, { status: 400 });
  if (markets.length === 0) return NextResponse.json({ error: "Pick at least one market" }, { status: 400 });

  const id = newId();
  const job: Job = {
    id,
    createdAt: Date.now(),
    title: `@${source.handle}`,
    status: "running",
    mode,
    markets,
    source,
    limit,
    library: [],
    messages: [{ id: newId(), at: Date.now(), kind: "user", source, limit, markets, mode }],
  };
  saveJob(job);
  await engine().start(job);
  return NextResponse.json({ id });
}
