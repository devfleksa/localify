import { NextResponse, type NextRequest } from "next/server";

// One shared access code, no registration. The cookie holds the code itself (demo-grade).
export const COOKIE = "access";
// Unset (local use): no login. Set it when the app is reachable by others, so strangers can't spend your credits.
export const ACCESS_CODE = process.env.ACCESS_CODE?.trim() || "";

export const isAuthed = (req: NextRequest) => !ACCESS_CODE || req.cookies.get(COOKIE)?.value === ACCESS_CODE;

export const unauthorized = () => NextResponse.json({ error: "unauthorized" }, { status: 401 });
