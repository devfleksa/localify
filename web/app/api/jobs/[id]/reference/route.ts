import { NextResponse, type NextRequest } from "next/server";
import { isAuthed, unauthorized } from "@/lib/auth";
import { getJob } from "@/lib/store";
import { engine } from "@/lib/engine";

// Review screen: generate an AI reference image for one visual change card (on demand).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthed(req)) return unauthorized();
  const job = getJob((await params).id);
  if (!job) return NextResponse.json({ error: "not found" }, { status: 404 });
  const { changeId } = (await req.json().catch(() => ({}))) as { changeId?: string };
  if (!changeId) return NextResponse.json({ error: "changeId missing" }, { status: 400 });
  try {
    return NextResponse.json({ url: await engine().reference(job, changeId) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
