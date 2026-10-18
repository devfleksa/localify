import { NextResponse, type NextRequest } from "next/server";
import { isAuthed, unauthorized } from "@/lib/auth";
import { getJob } from "@/lib/store";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthed(req)) return unauthorized();
  const job = getJob((await params).id);
  if (!job) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(job);
}
