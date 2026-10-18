import { NextResponse, type NextRequest } from "next/server";
import { isAuthed, unauthorized } from "@/lib/auth";
import { ApifyError, getProfile, hasApify, knownProfile, rememberProfile } from "@/lib/apify";
import { saveAvatar } from "@/lib/importer";
import { parseSource } from "@/lib/source";

// Verifies an Instagram account before a run: exists, public, how many posts.
// Cached per handle for 10 minutes in lib/apify.ts (each check is a paid Apify actor run).

export async function POST(req: NextRequest) {
  if (!isAuthed(req)) return unauthorized();
  if (!hasApify()) return NextResponse.json({ error: "APIFY_TOKEN is not set", code: "no_apify" }, { status: 501 });
  const { url } = (await req.json().catch(() => ({}))) as { url?: string };
  const source = parseSource(url ?? "");
  if (!source) return NextResponse.json({ error: "Enter an Instagram handle or profile URL" }, { status: 400 });
  if (source.platform !== "instagram") return NextResponse.json({ error: "Only Instagram is supported for now" }, { status: 400 });

  const hit = knownProfile(source.handle);
  if (hit) return NextResponse.json(hit);
  try {
    const profile = await getProfile(source.handle);
    if (!profile) return NextResponse.json({ error: `@${source.handle} doesn't exist` }, { status: 404 });
    profile.avatarUrl = await saveAvatar(profile.handle, profile.avatarUrl);
    rememberProfile(profile);
    return NextResponse.json(profile);
  } catch (e) {
    const status = e instanceof ApifyError ? 502 : 500;
    return NextResponse.json({ error: (e as Error).message }, { status });
  }
}
