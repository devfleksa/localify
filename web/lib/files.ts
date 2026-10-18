import fs from "node:fs/promises";
import path from "node:path";
import { UPLOAD_DIR, newId } from "./store";

const safeName = (name: string) => name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80) || "file";

// Saves an uploaded file and returns its app-relative URL (served by /api/files).
export async function saveUpload(file: File, folder: string): Promise<string> {
  const dir = path.join(UPLOAD_DIR, folder);
  await fs.mkdir(dir, { recursive: true });
  const name = `${newId()}-${safeName(file.name)}`;
  await fs.writeFile(path.join(dir, name), Buffer.from(await file.arrayBuffer()));
  return `/api/files/${folder}/${name}`;
}
