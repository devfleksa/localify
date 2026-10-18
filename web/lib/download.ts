// Save images to the user's disk. Result images live on fal's CDN (another origin), where the
// <a download> attribute is ignored, so files are fetched as blobs first. If that fails (CORS, network),
// a toast offers to open the image: a popup opened here, after the await, would be blocked.
import { toast } from "sonner";

async function fetchImage(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(String(res.status));
  const blob = await res.blob();
  const ext = blob.type.split("/")[1]?.replace("jpeg", "jpg") || url.split(".").pop()?.split("?")[0] || "jpg";
  return { blob, ext };
}

function save(blob: Blob, file: string) {
  const href = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href, download: file });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}

export async function downloadImage(url: string, name: string) {
  try {
    const { blob, ext } = await fetchImage(url);
    save(blob, `${name}.${ext}`);
  } catch {
    toast.error("Couldn't download the image", {
      action: { label: "Open it", onClick: () => window.open(url, "_blank", "noopener") },
    });
  }
}

// Several images in one .zip; `path` is the name inside the zip without extension (may contain "folder/").
export async function downloadZip(files: { url: string; path: string }[], name: string) {
  const id = toast.loading(`Preparing ${files.length} images…`);
  try {
    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    await Promise.all(
      files.map(async (f) => {
        const { blob, ext } = await fetchImage(f.url);
        zip.file(`${f.path}.${ext}`, blob);
      }),
    );
    save(await zip.generateAsync({ type: "blob" }), `${name}.zip`);
    toast.dismiss(id);
  } catch {
    toast.error("Couldn't build the zip", { id });
  }
}

// File name: brand-market-slide, e.g. "toyota-tr-slide-2".
export const fileName = (handle: string, market: string, slide: number, slides: number) =>
  [handle, market.toLowerCase(), slides > 1 ? `slide-${slide}` : ""].filter(Boolean).join("-");
