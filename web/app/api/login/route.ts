import { NextResponse, type NextRequest } from "next/server";
import { ACCESS_CODE, COOKIE } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const { code } = (await req.json().catch(() => ({}))) as { code?: string };
  if (!ACCESS_CODE) return NextResponse.json({ ok: true });
  if (code?.trim() !== ACCESS_CODE) {
    return NextResponse.json({ error: "Wrong access code" }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, ACCESS_CODE, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}
