import { NextResponse, type NextRequest } from "next/server";
import { isAuthed, unauthorized } from "@/lib/auth";
import { checkSetup } from "@/lib/setup.mjs";

export const dynamic = "force-dynamic";

// Which keys are set and whether each one works (start-page banner; the terminal has npm run setup -- --check).
export async function GET(req: NextRequest) {
  if (!isAuthed(req)) return unauthorized();
  const checks = await checkSetup();
  return NextResponse.json({ ok: checks.every((c) => c.ok), checks });
}
