import { NextResponse, type NextRequest } from "next/server";
import { isAuthed, unauthorized } from "@/lib/auth";
import { getJob } from "@/lib/store";
import { engine } from "@/lib/engine";
import { autoQueue } from "@/lib/findings";

// Auto mode's loop: { run: false } stops it after the current step, { run: true } resumes it.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthed(req)) return unauthorized();
  const job = getJob((await params).id);
  if (!job) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (job.mode !== "auto") return NextResponse.json({ error: "This brand runs in Review mode" }, { status: 400 });
  const { run } = (await req.json().catch(() => ({}))) as { run?: boolean };

  if (!run) {
    if (!job.auto?.running) return NextResponse.json({ error: "Auto mode isn't running" }, { status: 409 });
    if (!job.auto.stopping) await engine().auto(job, false);
    return NextResponse.json({ ok: true });
  }
  if (job.auto?.running || (job.status !== "ready" && job.status !== "done")) {
    return NextResponse.json({ error: "The agent is busy; wait for the current post to finish" }, { status: 409 });
  }
  if (!autoQueue(job).length) return NextResponse.json({ error: "Every flagged post is done" }, { status: 400 });
  await engine().auto(job, true);
  return NextResponse.json({ ok: true });
}
