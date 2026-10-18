import { NextResponse, type NextRequest } from "next/server";
import { isAuthed, unauthorized } from "@/lib/auth";
import { getJob } from "@/lib/store";
import { engine } from "@/lib/engine";
import { isMarket } from "@/lib/markets";

// Results: re-run the edit for one slide of one market.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthed(req)) return unauthorized();
  const job = getJob((await params).id);
  if (!job) return NextResponse.json({ error: "not found" }, { status: 404 });
  const { resultsId, market, slide } = (await req.json().catch(() => ({}))) as { resultsId?: string; market?: string; slide?: number };
  if (!resultsId || !market || !isMarket(market) || !Number.isInteger(slide) || slide! < 1) {
    return NextResponse.json({ error: "resultsId, market and slide are required" }, { status: 400 });
  }
  try {
    await engine().regenerate(job, resultsId, market, slide!);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
