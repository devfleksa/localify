import fs from "node:fs";
import path from "node:path";
import type { NextRequest } from "next/server";
import { UPLOAD_DIR } from "@/lib/store";

// Public on purpose (img tags, downloads); fal gets files through fal storage instead. File names carry random ids.
const TYPES: Record<string, string> = {
  ".mp4": "video/mp4", ".mov": "video/quicktime", ".webm": "video/webm",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif",
};

// Pull-based stream: reads only when the client wants more, and closes the file when the
// client aborts (browsers cancel video requests all the time). Readable.toWeb crashes then.
function fileStream(file: string, start: number, end: number): ReadableStream<Uint8Array> {
  let handle: fs.promises.FileHandle | undefined;
  let pos = start;
  return new ReadableStream({
    type: "bytes",
    async start() {
      handle = await fs.promises.open(file, "r");
    },
    async pull(controller) {
      const len = Math.min(64 * 1024, end - pos + 1);
      if (len <= 0) {
        await handle?.close();
        handle = undefined;
        return controller.close();
      }
      const buf = new Uint8Array(len);
      const { bytesRead } = await handle!.read(buf, 0, len, pos);
      if (bytesRead === 0) {
        await handle?.close();
        handle = undefined;
        return controller.close();
      }
      pos += bytesRead;
      controller.enqueue(buf.subarray(0, bytesRead));
    },
    async cancel() {
      await handle?.close();
      handle = undefined;
    },
  });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const file = path.join(UPLOAD_DIR, ...(await params).path);
  if (!file.startsWith(UPLOAD_DIR + path.sep) || !fs.existsSync(file)) return new Response("not found", { status: 404 });

  const size = fs.statSync(file).size;
  const headers: Record<string, string> = {
    "Content-Type": TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream",
    "Accept-Ranges": "bytes",
    "Cache-Control": "public, max-age=3600",
  };

  // Range requests let browsers (Safari especially) seek in videos.
  const range = req.headers.get("range")?.match(/bytes=(\d*)-(\d*)/);
  if (range && (range[1] || range[2])) {
    // "bytes=-N" means the last N bytes.
    const suffix = !range[1];
    const start = suffix ? Math.max(size - Number(range[2]), 0) : Number(range[1]);
    const end = suffix || !range[2] ? size - 1 : Math.min(Number(range[2]), size - 1);
    if (start >= size || start > end) {
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    }
    const stream = fileStream(file, start, end);
    return new Response(stream, {
      status: 206,
      headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) },
    });
  }
  const stream = fileStream(file, 0, size - 1);
  return new Response(stream, { headers: { ...headers, "Content-Length": String(size) } });
}
