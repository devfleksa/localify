import fs from "node:fs";
import path from "node:path";
import { Thread } from "@/components/chat/thread";

// Replay build (static export): one page per exported run. The normal app renders any job on demand.
export async function generateStaticParams() {
  if (process.env.NEXT_PUBLIC_SHOWCASE !== "1") return [];
  const runs = JSON.parse(fs.readFileSync(path.join(process.cwd(), "showcase", "runs", "index.json"), "utf8")) as { id: string }[];
  return runs.map(({ id }) => ({ id }));
}

export default async function JobPage({ params }: { params: Promise<{ id: string }> }) {
  return <Thread jobId={(await params).id} />;
}
