import { NextResponse, type NextRequest } from "next/server";
import { ACCESS_CODE, isAuthed } from "@/lib/auth";

// Pages only. API routes check the cookie themselves, so large uploads
// don't pass through middleware, and /api/files stays public for fal.
export function middleware(req: NextRequest) {
  const login = req.nextUrl.pathname === "/login";
  // No access code set: there is nothing to log in to.
  if (login) return ACCESS_CODE ? NextResponse.next() : NextResponse.redirect(new URL("/", req.url));
  if (isAuthed(req)) return NextResponse.next();
  return NextResponse.redirect(new URL("/login", req.url));
}

export const config = {
  matcher: ["/((?!api|_next|favicon.ico|.*\\..*).*)"],
};
