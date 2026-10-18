// Read-only replay (GitHub Pages): a static build of the app that shows exported runs (scripts/export-run.mjs)
// instead of talking to the server. Built by `npm run build:showcase`, which sets these variables.
export const IS_SHOWCASE = process.env.NEXT_PUBLIC_SHOWCASE === "1";
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
export const READ_ONLY_HINT = "Disabled in the replay. Clone the repo to run it with your own keys.";

// Where a GET goes: the app's API, or in the replay the exported JSON (/api/jobs → runs/index.json, /api/jobs/<id> → runs/<id>.json).
function source(path: string): string | null {
  if (!IS_SHOWCASE) return path;
  if (path === "/api/jobs") return `${BASE_PATH}/runs/index.json`;
  const job = path.match(/^\/api\/jobs\/([\w-]+)$/);
  return job ? `${BASE_PATH}/runs/${job[1]}.json` : null;
}

// fetch() for reads. In the replay, file URLs in the JSON (/api/files/…) are mapped to the exported media folder,
// and anything else is a 404 (there is no server).
export async function apiGet(path: string): Promise<Response> {
  const url = source(path);
  if (!url) return new Response(null, { status: 404 });
  const res = await fetch(url);
  if (!IS_SHOWCASE || !res.ok) return res;
  const text = (await res.text()).replaceAll('"/api/files/', `"${BASE_PATH}/media/`);
  return new Response(text, { status: 200, headers: { "Content-Type": "application/json" } });
}
