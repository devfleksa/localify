import fs from "node:fs";
import path from "node:path";
import type { Engine } from "./index";
import { market, type MarketCode } from "../markets";
import { PLATFORM_NAME } from "../source";
import { libraryFolder, loadLibrary, writeScan } from "../library";
import { POST_NOUN, scanCost, usd } from "../cost";
import { UPLOAD_DIR, addCost, addMessage, getJob, newId, updateJob, writeJson } from "../store";
import { editImage, editPrice, referenceImage, referencePrice, scanImages } from "../fal";
import { applyChoice } from "./shared";
import { pool } from "../pool";
import { autoQueue, needsLocalizing, relevantFindings, scanCovers } from "../findings";
import { marketAttachments, planSkill } from "../prompts.mjs";
import { getImagePosts, hasApify, takeCheckCost } from "../apify";
import { importPosts } from "../importer";
import { VISUAL_TYPES, type Change, type ChangeType, type Job, type LibraryItem, type MarketPlan, type Message } from "../types";

// Real engine: fal scans every post (cached in scan.json), Manus plans one picked post from the scan TEXT only
// (structured output = change cards), fal nano-banana-pro edits each slide per market.
// Image posts only (docs/decisions.md, "Image posts only").

const MANUS = "https://api.manus.ai/v2";
const MANUS_DEADLINE_MS = 10 * 60 * 1000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const itemOf = (job: Job, id: string) => job.library.find((i) => i.id === id);
const say = (jobId: string, text: string, pending = true) => addMessage(jobId, { kind: "agent_text", text, pending });
const hasResults = (job: Job) => job.messages.some((m) => m.kind === "results");

// Thrown when the user stops Auto mode while Manus is planning.
class Stopped extends Error {}
const stopping = (jobId: string) => !!getJob(jobId)?.auto?.stopping;

// After one post (or a stopped loop): done once anything was localized, else back to picking a post.
// A plan waiting for review keeps its status.
const settle = (jobId: string) =>
  updateJob(jobId, (j) => {
    if (j.status === "running") j.status = hasResults(j) ? "done" : "ready";
  });

// ---------- Scan ----------

// Scrape the latest posts with Apify and download them into the brand's library folder.
// Without APIFY_TOKEN the app uses whatever is already in data/uploads/library/<handle>/.
async function importLibrary(job: Job) {
  const { handle } = job.source;
  const msg = addMessage(job.id, { kind: "agent_text", text: `Scraping the latest ${plural(job.limit, "image post")} from Instagram @${handle} (Reels are skipped)…`, pending: true });
  const setText = (text: string) =>
    updateJob(job.id, (j) => {
      const m = j.messages.find((x) => x.id === msg?.id);
      if (m?.kind === "agent_text") m.text = text;
    });
  // Apify settles charges ~10 s after a run; they land on the job's cost in the background.
  void takeCheckCost(handle).then((usd) => addCost(job.id, "apify", usd));
  const { posts, scanned, videos, capped, cost } = await getImagePosts(handle, job.limit);
  void cost.then((usd) => addCost(job.id, "apify", usd));
  if (!posts.length)
    throw new Error(
      scanned ? `@${handle}'s latest ${plural(scanned, "post")} are all Reels/videos; only image posts are supported.` : `No posts found for @${handle} (private or empty account?)`,
    );
  setText(`Scraped ${plural(posts.length, "post")}. Downloading media…`);
  const res = await importPosts(handle, posts, (done, total) => setText(`Scraped ${plural(posts.length, "post")}. Downloading media ${done}/${total}…`));
  setText(
    `Imported ${plural(posts.length, "image post")} from @${handle}: ${res.added} new` +
      (res.skipped ? `, ${res.skipped} already downloaded` : "") +
      (res.failed.length ? `, ${res.failed.length} failed (${res.failed.map((f) => f.shortCode).join(", ")})` : "") +
      `. Skipped ${plural(videos, "Reel/video")} among the latest ${plural(scanned, "post")}` +
      (posts.length < job.limit ? `; only ${posts.length} image posts found there.` : ".") +
      (posts.length < job.limit && capped
        ? ` The account's latest ${plural(scanned, "post")} were all that could be read.`
        : ""),
  );
}

async function scanAll(job: Job) {
  if (hasApify() && job.source.platform === "instagram") await importLibrary(job);
  const { items, folder } = await loadLibrary(job.source, job.limit);
  if (!folder) throw new Error(`No posts for @${job.source.handle}: set APIFY_TOKEN (npm run setup) to scrape, or put posts in data/uploads/library/${job.source.handle}/`);
  updateJob(job.id, (j) => (j.library = items));
  // Not scanned yet, or scanned before one of the job's markets existed.
  const todo = items.filter((i) => !i.scan || !scanCovers(i.scan, job.markets));
  const carousels = items.filter((i) => i.type === "carousel").length;
  say(
    job.id,
    `Found ${plural(items.length, "post")} on ${PLATFORM_NAME[job.source.platform]} @${job.source.handle}: ` +
      `${plural(items.length - carousels, "single image")}, ${plural(carousels, "carousel")}.` +
      (todo.length ? ` Scanning ${todo.length} with the vision model…` : " All scanned before (saved snapshot)."),
  );
  await pool(todo, 4, async (it) => {
    try {
      const scan = await scanImages(it.imageUrls!);
      writeScan(folder, it.id, scan);
      addCost(job.id, "scan", scan.cost ?? scanCost(it));
      updateJob(job.id, (j) => {
        const x = itemOf(j, it.id);
        if (x) x.scan = scan;
      });
    } catch (e) {
      updateJob(job.id, (j) => {
        const x = itemOf(j, it.id);
        if (x) x.scanError = (e as Error).message;
      });
      addMessage(job.id, { kind: "error", text: `Scan failed for “${it.caption.slice(0, 40)}”: ${(e as Error).message}. It will be scanned again next time you run @${job.source.handle}.` });
    }
  });
  const done = getJob(job.id)!;
  const flagged = done.library.filter((i) => needsLocalizing(i, job.markets));
  const cost = done.library.reduce((s, i) => s + scanCost(i), 0);
  const auto = done.mode === "auto";
  say(
    job.id,
    `Scan done: ${flagged.length} of ${done.library.length} posts need localizing. Scan cost ${usd(cost)}. ` +
      (auto ? "" : `Pick an image post or carousel in the library to localize it.`),
    false,
  );
  if (auto) return autoRun(job.id);
  updateJob(job.id, (j) => (j.status = "ready"));
}

// ---------- Auto mode loop ----------

// Localizes every flagged post one after another, most liked first, until none is left or the user presses Stop.
// Stop ends a Manus plan at once; edits already sent to fal finish (~25 s) so no paid image is thrown away.
async function autoRun(jobId: string) {
  updateJob(jobId, (j) => {
    j.status = "running";
    j.auto = { running: true, stopping: j.auto?.stopping, done: j.auto?.done ?? [] };
  });
  let failures = 0;
  let finished = false;
  try {
    for (;;) {
      const job = getJob(jobId)!;
      if (job.auto?.stopping) break;
      const queue = autoQueue(job);
      if (!queue.length) {
        finished = true;
        break;
      }
      const item = queue[0];
      const n = job.auto!.done.length + 1;
      updateJob(jobId, (j) => (j.selectedId = item.id));
      try {
        await plan(jobId, item.id, `Post ${n} of ${n - 1 + queue.length}: `);
        failures = 0;
      } catch (e) {
        if (e instanceof Stopped) break;
        addMessage(jobId, { kind: "error", text: `Skipped “${item.caption.slice(0, 40)}”: ${(e as Error).message}` });
        if (++failures >= 3) {
          say(jobId, "Three posts in a row failed, so Auto mode paused. Resume it once the problem is fixed.", false);
          break;
        }
      }
      updateJob(jobId, (j) => j.auto!.done.push(item.id));
    }
  } finally {
    updateJob(jobId, (j) => (j.auto = { ...j.auto!, running: false, stopping: false }));
    settle(jobId);
  }
  const job = getJob(jobId)!;
  const tried = job.auto!.done.length;
  if (finished) say(jobId, tried ? `Auto mode finished: went through all ${plural(tried, "flagged post")}.` : "No post needs localizing for these markets.", false);
  else {
    const left = autoQueue(job).length;
    if (left) say(jobId, `Auto mode stopped. ${plural(left, "post")} left: press Resume, or pick a post yourself.`, false);
  }
}


// ---------- Plan (Manus) ----------

const CARD_TYPES: ChangeType[] = ["background", "object", "text", "price", "cta", "date", "review"];
const schemaFor = (markets: MarketCode[]) => ({
  type: "object",
  properties: {
    markets: {
      type: "array",
      items: {
        type: "object",
        properties: {
          market: { type: "string", enum: markets },
          changes: {
            type: "array",
            items: {
              type: "object",
              properties: {
                type: { type: "string", enum: CARD_TYPES },
                // Manus rejects an array nested this deep, so slides come as text: "1,3" or "all".
                slides: { type: "string", description: "Comma-separated 1-based slide numbers, or \"all\"" },
                target: { type: "string" },
                replacement: { type: "string" },
                kind: { type: "string", enum: ["protect", "resonate"] },
                reason: { type: "string" },
                prompt: { type: ["string", "null"], description: "Edit-model sentence for background/object cards; null otherwise" },
              },
              required: ["type", "slides", "target", "replacement", "kind", "reason", "prompt"],
              additionalProperties: false,
            },
          },
        },
        required: ["market", "changes"],
        additionalProperties: false,
      },
    },
  },
  required: ["markets"],
  additionalProperties: false,
});
type RawPlan = {
  markets: { market: MarketCode; changes: (Omit<Change, "id" | "ref" | "prompt" | "slides"> & { slides: string; prompt: string | null })[] }[];
};
// "1,3" / "1-3" / "all" → slide numbers ([] = every slide). null when numbers are given but none exists in the post,
// so the card is dropped instead of silently turning into an every-slide card.
function parseSlides(s: string, count: number): number[] | null {
  const nums = new Set<number>();
  for (const [, a, b] of s.matchAll(/(\d+)(?:\s*[-–]\s*(\d+))?/g)) {
    const from = Number(a);
    const to = b ? Number(b) : from;
    for (let n = Math.min(from, to); n <= Math.max(from, to) && n <= count; n++) if (n > 0) nums.add(n);
  }
  if (!nums.size) return /\d/.test(s) ? null : [];
  return [...nums].sort((x, y) => x - y);
}

async function manus<T>(pathname: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${MANUS}/${pathname}`, {
    ...init,
    headers: { "Content-Type": "application/json", "x-manus-api-key": process.env.MANUS_API_KEY ?? "", ...init.headers },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.ok === false) throw new Error(`Manus ${pathname.split("?")[0]} ${res.status}: ${JSON.stringify(body).slice(0, 200)}`);
  return body as T;
}

type ManusEvent = {
  id: string;
  type: string;
  status_update?: { agent_status: string };
  assistant_message?: { content?: string };
  structured_output_result?: { success: boolean; value: unknown };
};

// Accepts small variations (cards vs changes, RESONATE vs resonate, slides as list) and keeps only the job's markets.
function normalizePlan(value: unknown, markets: MarketCode[]): RawPlan | null {
  const list = (value as { markets?: unknown })?.markets;
  if (!Array.isArray(list)) return null;
  const out: RawPlan["markets"] = [];
  for (const m of list as Record<string, unknown>[]) {
    const code = String(m.market ?? "").toUpperCase() as MarketCode;
    if (!markets.includes(code)) continue;
    const raw = (m.changes ?? m.cards ?? []) as Record<string, unknown>[];
    const changes = raw
      .map((c) => ({
        type: String(c.type ?? "").toLowerCase() as ChangeType,
        slides: Array.isArray(c.slides) ? c.slides.join(",") : String(c.slides ?? ""),
        target: String(c.target ?? ""),
        replacement: String(c.replacement ?? ""),
        kind: (String(c.kind ?? "").toLowerCase() === "protect" ? "protect" : "resonate") as Change["kind"],
        reason: String(c.reason ?? ""),
        prompt: c.prompt ? String(c.prompt) : null,
      }))
      .filter((c) => CARD_TYPES.includes(c.type));
    out.push({ market: code, changes });
  }
  return out.length ? { markets: out } : null;
}

function planFromText(text: string, markets: MarketCode[]): RawPlan | null {
  const a = text.indexOf("{");
  const b = text.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  try {
    return normalizePlan(JSON.parse(text.slice(a, b + 1)), markets);
  } catch {
    return null;
  }
}

async function askManus(jobId: string, job: Job, item: LibraryItem): Promise<RawPlan> {
  // Skill + shared rules as text; each job market's file (prompts/markets/<code>.md) attached as market-<code>.md.
  const text = `${planSkill()}

## This job
Brand: @${job.source.handle} (${PLATFORM_NAME[job.source.platform]}). Caption: ${item.caption || "(none)"}
Target markets: ${job.markets.join(", ")}. Plan ONLY these markets; do not include any other market.
Market files (attached): ${job.markets.map((c) => `market-${c.toLowerCase()}.md`).join(", ")}. Read each before planning that market.
Number of slides: ${item.imageUrls?.length ?? 1}. You do not see the images; plan only from the scan below.

Scan result (JSON; findings for these markets only, most important first):
${JSON.stringify({ summary: item.scan?.summary, findings: relevantFindings(item, job.markets) })}

Do not create files or websites. Reply with the plan as one JSON object right away, in this shape:
{"markets":[{"market":"TR","changes":[{"type":"background","slides":"1","target":"…","replacement":"…","kind":"resonate","reason":"…","prompt":"…"}]}]}`;

  const created = await manus<{ task_id: string; task_url?: string }>("task.create", {
    method: "POST",
    body: JSON.stringify({
      message: { content: [{ type: "text", text }, ...marketAttachments(job.markets)] },
      agent_profile: "standard",
      interactive_mode: false,
      title: `localize-post: @${job.source.handle} ${item.id}`,
      structured_output_schema: schemaFor(job.markets),
    }),
  });
  addMessage(jobId, {
    kind: "agent_text",
    text: "Manus is planning. It reads the scan text only, no images…",
    link: { href: created.task_url ?? `https://manus.im/app/${created.task_id}`, label: "Open the Manus task" },
    pending: true,
  });

  // However this ends (plan, Stop, error, timeout), the task is stopped if still running and its credits are counted.
  let ended = false; // the task finished on its own
  try {
    const seen = new Set<string>();
    const deadline = Date.now() + MANUS_DEADLINE_MS;
    let pollErrors = 0;
    while (Date.now() < deadline) {
      await sleep(3000);
      if (stopping(jobId)) throw new Stopped("Stopped");
      let res: { messages?: ManusEvent[]; data?: ManusEvent[] };
      try {
        res = await manus(`task.listMessages?task_id=${created.task_id}&order=asc&limit=200`);
        pollErrors = 0;
      } catch (e) {
        // One failed status check is not a failed plan; give up after three in a row.
        if (++pollErrors >= 3) throw e;
        continue;
      }
      for (const e of res.messages ?? res.data ?? []) {
        if (seen.has(e.id)) continue;
        seen.add(e.id);
        const note = e.assistant_message?.content?.trim();
        // Manus writes the plan as a chat message within ~30 s, then spends minutes on the formal structured output.
        // Take the plan from the message as soon as it parses, and stop the task.
        const early = note ? planFromText(note, job.markets) : null;
        if (early) return early;
        if (note && !note.startsWith("```") && !note.startsWith("{") && note.length < 400) say(jobId, `Manus: ${note}`);
        if (e.type === "structured_output_result") {
          ended = true;
          const value = e.structured_output_result?.success ? normalizePlan(e.structured_output_result.value, job.markets) : null;
          if (!value) throw new Error("Manus returned no valid plan");
          return value;
        }
        if (e.status_update?.agent_status === "error") {
          ended = true;
          throw new Error("Manus task failed");
        }
      }
    }
    throw new Error("Manus took longer than 10 minutes");
  } finally {
    const stop = ended ? Promise.resolve() : manus("task.stop", { method: "POST", body: JSON.stringify({ task_id: created.task_id }) }).catch(() => {});
    void stop.then(() => trackCredits(jobId, created.task_id));
  }
}

// Manus bills in credits; task.detail reports them once the task has stopped (read after a short wait).
async function trackCredits(jobId: string, taskId: string) {
  await sleep(10_000);
  try {
    const { task } = await manus<{ task?: { credit_usage?: number } }>(`task.detail?task_id=${taskId}`);
    addCost(jobId, "manusCredits", task?.credit_usage ?? 0);
  } catch (e) {
    console.error("Manus credit usage", e);
  }
}

// Saved plans (per post) let a run be repeated instantly; PLAN_CACHE=prefer uses them first,
// otherwise they are only a fallback when Manus fails or is too slow.
const planFile = (job: Job, itemId: string) => {
  const folder = libraryFolder(job.source.handle);
  return folder && path.join(UPLOAD_DIR, "library", folder, "plans", `${itemId}.json`);
};

// Skill limit, enforced in case Manus ignores it: per slide at most 1 background and 2 object cards.
const LIMITS: Partial<Record<ChangeType, number>> = { background: 1, object: 2 };
function withinLimits(changes: Change[], slideCount: number): Change[] {
  const used = new Map<string, number>();
  return changes.filter((c) => {
    const max = LIMITS[c.type];
    if (max === undefined) return true;
    const slides = c.slides.length ? c.slides : Array.from({ length: slideCount }, (_, i) => i + 1);
    if (slides.some((n) => (used.get(`${c.type}-${n}`) ?? 0) >= max)) return false;
    for (const n of slides) used.set(`${c.type}-${n}`, (used.get(`${c.type}-${n}`) ?? 0) + 1);
    return true;
  });
}

// progress is set inside the Auto loop ("Post 3 of 12: "); the loop also changes the closing words.
async function plan(jobId: string, itemId: string, progress?: string) {
  const job = getJob(jobId)!;
  const item = itemOf(job, itemId)!;
  const loop = progress !== undefined;
  say(jobId, `${progress ?? ""}Planning ${POST_NOUN[item.type]} “${item.caption.slice(0, 60)}” for ${plural(job.markets.length, "market")}…`);

  const file = planFile(job, itemId);
  const saved = file && fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, "utf8")) as RawPlan) : null;
  // A saved plan only counts if it was made for every market of this job.
  const cached = saved && job.markets.every((code) => saved.markets.some((m) => m.market === code)) ? saved : null;
  let raw: RawPlan;
  if (cached && process.env.PLAN_CACHE === "prefer") {
    raw = cached;
    say(jobId, "Using the saved Manus plan for this post.");
  } else {
    try {
      raw = await askManus(jobId, job, item);
      if (file) {
        // Every job market gets an entry (empty = nothing to change); other markets saved before are kept.
        const planned = job.markets.map((code) => raw.markets.find((m) => m.market === code) ?? { market: code, changes: [] });
        const kept = (saved?.markets ?? []).filter((m) => !job.markets.includes(m.market));
        fs.mkdirSync(path.dirname(file), { recursive: true });
        writeJson(file, { markets: [...kept, ...planned] });
      }
    } catch (e) {
      if (!cached || e instanceof Stopped) throw e;
      say(jobId, `${(e as Error).message}. Using the saved plan for this post instead.`);
      raw = cached;
    }
  }

  const slideCount = item.imageUrls?.length ?? 1;
  const plans: MarketPlan[] = job.markets.map((code) => ({
    market: code,
    changes: withinLimits(
      (raw.markets.find((m) => m.market === code)?.changes ?? []).flatMap((c) => {
        const slides = parseSlides(String(c.slides ?? ""), slideCount);
        return slides ? [{ ...c, id: newId(), slides, prompt: c.prompt ?? "", ref: "prompt" as const }] : [];
      }),
      slideCount,
    ),
  }));
  // An empty plan is a valid answer: say so plainly instead of showing an empty card.
  const empty = plans.filter((p) => p.changes.length === 0).map((p) => market(p.market).name);
  if (empty.length === plans.length) {
    say(jobId, `Manus found nothing worth changing in this post for ${empty.join(", ")}. ${loop ? "Moving on." : "Pick another post."}`, false);
    return;
  }
  if (empty.length) say(jobId, `Nothing worth changing for ${empty.join(", ")}; planning the other markets.`);
  const fresh = getJob(jobId)!;
  addMessage(jobId, { kind: "plan", itemId, plans: plans.filter((p) => p.changes.length), approved: fresh.mode === "auto" });
  if (fresh.mode === "review") {
    say(jobId, "Here is the plan. Turn cards on or off per market, choose how each change gets its look or text, then approve.", false);
    updateJob(jobId, (j) => (j.status = "awaiting_review"));
    return;
  }
  say(jobId, "Auto mode: applying every card with the defaults.");
  await execute(jobId, itemId, loop);
}

// ---------- Execute (fal) ----------

const KEEP =
  "Edit this image. Keep everything that is not mentioned exactly as it is: all people, faces, bodies, poses and clothing; " +
  "the brand's ad artwork, logo and product; the framing and composition; the aspect ratio, size and shape of any ad frame or billboard " +
  "(do not crop, stretch or reframe the artwork). Keep it photorealistic with matching perspective and lighting.";

// Manus writes visual prompts as "Replace X behind the car with Y: details." Only the part after the colon
// describes the new look; the rest names the old scene, which a reference image must not show.
const lookOf = (c: Change) => {
  const i = c.prompt.indexOf(":");
  return i < 0 ? "" : c.prompt.slice(i + 1).trim();
};

// Text-to-image prompt for an AI reference: only the new place (background) or only the new object, nothing of the ad.
function referencePrompt(c: Change, marketName: string): string {
  const look = [c.replacement, lookOf(c)].filter(Boolean).join(". ").replace(/\.\./g, ".");
  if (c.type === "background")
    return [
      `A photograph of a place in ${marketName}, used as a background reference: ${look}`,
      "Show only the place itself: an eye-level, wide, natural photo with a normal lens, as a background plate.",
      "Keep the foreground open and empty: no person, vehicle, product, table or other subject close to the camera. " +
        "Distant everyday traffic or passers-by only if they are part of the place, small and far away.",
      "No ads, billboards, posters, brand logos, captions or watermarks. Photorealistic, natural light.",
    ].join("\n");
  return [
    `A product reference photo of one object as it really looks in ${marketName}: ${look}`,
    "Show only this object: whole, centred and filling most of the frame, on a plain light-grey studio backdrop with soft, even light.",
    "Nothing else in the picture: no scene, no car, table, wall or surface it would sit on, no hands or people, no other objects, " +
      "no text or logos except what the object itself carries. Photorealistic.",
  ].join("\n");
}

// Tells the edit model what to take from reference image n (AI or the user's upload) and what to ignore.
function referenceLine(c: Change, n: number): string {
  if (c.type === "background")
    return (
      `Use image ${n} only as the reference for the new background: match its scenery, landmarks, colours and light, ` +
      `but keep this photo's camera angle, horizon and perspective. Copy nothing else from image ${n}: no people, vehicles or objects.`
    );
  return (
    `Image ${n} shows the new object on its own: copy its shape, materials, colours and details, ` +
    `and ignore everything else in image ${n} (its backdrop and any other objects). Fit it to this photo's perspective, size and lighting.`
  );
}

// Builds the edit prompt for one slide from the approved cards (Manus is not called again).
function slidePrompt(changes: Change[], slide: number): { prompt: string; refs: string[] } | null {
  const active = changes.filter((c) => !c.skipped && c.type !== "review" && (c.slides.length === 0 || c.slides.includes(slide)));
  if (!active.length) return null;
  const refs: string[] = [];
  const lines = active.map((c) => {
    if (VISUAL_TYPES.includes(c.type)) {
      let line = c.prompt || `Replace ${c.target} with ${c.replacement}.`;
      if (c.ref !== "prompt" && c.refUrl) {
        refs.push(c.refUrl);
        line += ` ${referenceLine(c, refs.length + 1)}`;
      }
      return line;
    }
    return `Replace the text "${c.target}" with "${c.text ?? c.replacement}" in the same place, with the same font style, size and colour.`;
  });
  return { prompt: [KEEP, ...lines, "Spell any new text exactly as given. Add no other text."].join("\n"), refs };
}

const isPlanFor = (itemId: string) => (m: Message): m is Extract<Message, { kind: "plan" }> => m.kind === "plan" && m.itemId === itemId;
const latestPlan = (job: Job, itemId: string) => [...job.messages].reverse().find(isPlanFor(itemId));
// The plan a results message was made from: the last plan for its post before it (a later re-plan doesn't count).
const planOf = (job: Job, resultsId: string, itemId: string) => {
  const at = job.messages.findIndex((m) => m.id === resultsId);
  return job.messages.slice(0, at).reverse().find(isPlanFor(itemId));
};

async function execute(jobId: string, itemId: string, loop = false) {
  const job = getJob(jobId)!;
  const item = itemOf(job, itemId)!;
  const plans = latestPlan(job, itemId)?.plans ?? [];
  const slides = item.imageUrls ?? [];
  const tasks = plans.flatMap((p) =>
    slides.map((_, i) => ({ market: p.market, slide: i + 1, spec: slidePrompt(p.changes, i + 1) })),
  );
  const active = plans.filter((p) => tasks.some((t) => t.market === p.market && t.spec));
  if (!active.length) {
    say(jobId, "Nothing to edit: every card is off.", false);
    return;
  }
  const edits = tasks.filter((t) => t.spec && active.some((p) => p.market === t.market));
  say(jobId, `Editing ${plural(edits.length, "image")} for ${plural(active.length, "market")} in parallel (~25 s each)…`);

  const results = addMessage(jobId, {
    kind: "results",
    itemId,
    postType: item.type,
    originalImages: slides,
    results: active.map((p) => ({
      market: p.market,
      imageUrls: [...slides],
      pending: edits.filter((t) => t.market === p.market).map((t) => t.slide),
      report: p.changes.filter((c) => !c.skipped).map((c) => ({
        kind: c.kind,
        slides: c.slides,
        text: c.type === "review" ? `Needs human review: ${c.target}. ${c.reason}` : `${c.target} → ${c.text ?? c.replacement}. ${c.reason}`,
      })),
    })),
  })!;

  let failed = 0;
  await pool(edits, 8, async (t) => {
    let url: string | undefined;
    try {
      url = await editImage(slides[t.slide - 1], t.spec!.prompt, t.spec!.refs);
      addCost(jobId, "edit", await editPrice());
    } catch (e) {
      failed++;
      console.error("edit failed", t.market, t.slide, e);
    }
    setSlide(jobId, results.id, t.market, t.slide, url);
  });
  const next = loop ? "" : " Pick another post to continue.";
  say(jobId, `Done: ${plural(active.length, "localized version")}${failed ? ` (${failed} images failed; use Regenerate)` : ""}.${next}`, false);
}

function setSlide(jobId: string, resultsId: string, code: MarketCode, slide: number, url?: string) {
  updateJob(jobId, (j) => {
    const msg = j.messages.find((m) => m.id === resultsId);
    const r = msg?.kind === "results" ? msg.results.find((x) => x.market === code) : undefined;
    if (!r?.imageUrls) return;
    if (url) r.imageUrls[slide - 1] = url;
    r.pending = (r.pending ?? []).filter((s) => s !== slide);
  });
}

function fail(jobId: string, err: unknown) {
  addMessage(jobId, { kind: "error", text: err instanceof Error ? err.message : String(err) });
  updateJob(jobId, (j) => {
    j.status = j.library.length ? "ready" : "failed";
    if (j.auto) j.auto = { ...j.auto, running: false, stopping: false };
  });
}

export const manusEngine: Engine = {
  async start(job) {
    // Auto mode's loop is on from the start, so Stop also works during the scan (no post gets edited then).
    if (job.mode === "auto") updateJob(job.id, (j) => (j.auto = { running: true, done: [] }));
    // With Apify the import step posts its own "Scraping…" progress message.
    if (!hasApify()) say(job.id, `Loading @${job.source.handle}'s saved posts (latest ${job.limit} image posts)…`);
    void scanAll(job).catch((e) => fail(job.id, e));
  },
  async select(job, itemId) {
    updateJob(job.id, (j) => {
      j.status = "running";
      j.selectedId = itemId;
    });
    void plan(job.id, itemId)
      .then(() => settle(job.id))
      .catch((e) => fail(job.id, e));
  },
  async auto(job, run) {
    if (!run) {
      updateJob(job.id, (j) => j.auto && (j.auto.stopping = true));
      say(job.id, "Stopping Auto mode after the current step…");
      return;
    }
    say(job.id, `Resuming Auto mode: ${plural(autoQueue(job).length, "post")} left.`);
    void autoRun(job.id).catch((e) => fail(job.id, e));
  },
  async approve(job, choices) {
    const itemId = job.selectedId;
    if (!itemId) return;
    updateJob(job.id, (j) => {
      j.status = "running";
      const p = latestPlan(j, itemId);
      if (!p) return;
      p.approved = true;
      for (const c of p.plans.flatMap((x) => x.changes)) {
        const choice = choices.find((x) => x.changeId === c.id);
        if (choice) applyChoice(c, choice);
      }
    });
    const n = choices.filter((c) => !c.skipped).length;
    say(job.id, `Plan approved (${plural(n, "card")}). Starting the edits.`);
    void execute(job.id, itemId)
      .then(() => settle(job.id))
      .catch((e) => fail(job.id, e));
  },
  async reference(job, changeId) {
    const hit = job.messages
      .flatMap((m) => (m.kind === "plan" ? m.plans.flatMap((p) => p.changes.map((c) => ({ c, code: p.market, itemId: m.itemId }))) : []))
      .find((x) => x.c.id === changeId);
    if (!hit) throw new Error("Change not found");
    const { c, code, itemId } = hit;
    // A background reference copies the aspect ratio of the (first) slide it goes into.
    const slide = itemOf(job, itemId)?.imageUrls?.[(c.slides[0] ?? 1) - 1];
    const url = await referenceImage(referencePrompt(c, market(code).name), c.type === "background" ? slide : undefined);
    addCost(job.id, "edit", await referencePrice());
    return url;
  },
  async regenerate(job, resultsId, code, slide) {
    const msg = job.messages.find((m) => m.id === resultsId);
    if (msg?.kind !== "results") throw new Error("Results not found");
    const item = itemOf(job, msg.itemId);
    const spec = planOf(job, resultsId, msg.itemId)?.plans.find((p) => p.market === code);
    const prompt = spec && slidePrompt(spec.changes, slide);
    if (!item?.imageUrls || !prompt) throw new Error("Nothing to edit on this slide");
    updateJob(job.id, (j) => {
      const m = j.messages.find((x) => x.id === resultsId);
      const r = m?.kind === "results" ? m.results.find((x) => x.market === code) : undefined;
      if (r) r.pending = [...(r.pending ?? []), slide];
    });
    void editImage(item.imageUrls[slide - 1], prompt.prompt, prompt.refs)
      .then(async (url) => {
        setSlide(job.id, resultsId, code, slide, url);
        addCost(job.id, "edit", await editPrice());
      })
      .catch((e) => {
        setSlide(job.id, resultsId, code, slide);
        addMessage(job.id, { kind: "error", text: `Regenerate failed (${market(code).name}, slide ${slide}): ${(e as Error).message}` });
      });
  },
};
