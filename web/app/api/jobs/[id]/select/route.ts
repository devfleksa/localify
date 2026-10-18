import { NextResponse, type NextRequest } from "next/server";
import { isAuthed, unauthorized } from "@/lib/auth";
import { getJob } from "@/lib/store";
import { engine } from "@/lib/engine";
import { needsLocalizing } from "@/lib/findings";

// The user picked a post (image or carousel) from the library to localize.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthed(req)) return unauthorized();
  // Read the body first: no await may sit between the status check and select() setting "running",
  // or two quick clicks would both pass the check and plan (and pay) twice.
  const { itemId } = (await req.json().catch(() => ({}))) as { itemId?: string };
  const job = getJob((await params).id);
  if (!job) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (job.status !== "ready" && job.status !== "done") {
    return NextResponse.json({ error: "The agent is busy; finish the current post first" }, { status: 409 });
  }
  const item = job.library.find((i) => i.id === itemId);
  if (!item || !needsLocalizing(item, job.markets)) return NextResponse.json({ error: "Nothing to localize in this post" }, { status: 400 });
  await engine().select(job, item.id);
  return NextResponse.json({ ok: true });
}
