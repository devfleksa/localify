import { NextResponse, type NextRequest } from "next/server";
import { isAuthed, unauthorized } from "@/lib/auth";
import { getJob } from "@/lib/store";
import { engine } from "@/lib/engine";
import type { ReviewChoice } from "@/lib/types";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthed(req)) return unauthorized();
  // Body first, so nothing is awaited between the status check and approve() setting "running" (no double edits).
  const { choices } = (await req.json().catch(() => ({}))) as { choices?: ReviewChoice[] };
  const job = getJob((await params).id);
  if (!job) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (job.status !== "awaiting_review") return NextResponse.json({ error: "Job is not waiting for review" }, { status: 409 });

  await engine().approve(job, choices ?? []);
  return NextResponse.json({ ok: true });
}
