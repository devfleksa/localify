# Architecture

_State at the archive (October 2026). How it changed over time is in [`decisions.md`](decisions.md)._

## Overview
One Next.js app in `web/`. The browser talks to the app's own API routes, which run the engine and call three outside services. There is no database: jobs and media are files under `web/data/`.

```
Browser ──▶ Next.js API routes ──▶ engine (web/lib/engine/manus.ts)
                                     ├─ Apify   import posts        web/lib/apify.ts, importer.ts
                                     ├─ fal     scan, edit, refs    web/lib/fal.ts
                                     └─ Manus   plan per market     task.create + polling
```

## Pipeline
1. **Import** (`lib/apify.ts`, `lib/importer.ts`). The account check uses an Apify profile scraper and saves the profile picture. The import uses `instagram-scraper/fast-instagram-post-scraper`, keeps image posts and carousels, and downloads them into `data/uploads/library/<handle>/` with a `manifest.json` (newest first). Running it again only downloads new posts. Imports and scrapes of one handle run one at a time, and a short scrape is retried.
2. **Scan** (`lib/fal.ts`, prompt from `lib/prompts.mjs`). Every post goes to `openrouter/router/vision` with Gemini 2.5 Flash, 4 in parallel. The prompt (`prompts/scan.md` + `rules.md` + the Protect rules of every market) asks for JSON findings with type, slides, strength and markets. Results are saved once per post in the library's `scan.json`. Broken JSON is parsed leniently and retried once.
3. **Sort** (`lib/findings.ts`). A post needs localizing for a market when it has a finding for that market that is not weak and not review only. The library panel filters by visual, text only and all, and Auto mode uses the same list.
4. **Plan** (`lib/engine/manus.ts`, `askManus`). One Manus task per post: the planning prompt (`prompts/plan-post.md` + `rules.md`) and the scan as text, each job market's file attached as `market-<code>.md` (Manus caps message text at about 5,000 tokens), and a structured output schema for change cards. The engine polls `task.listMessages`, takes the plan, stops the task and records its credits. Plans are saved in `<library>/plans/<post>.json`; `PLAN_CACHE=prefer` reuses them.
5. **Review** (`components/chat/plan-card.tsx`). Cards per market: background, object, text, price, CTA, date, review. Visual cards can use the prompt alone, an AI reference image (`nano-banana-pro`) or an upload. Auto mode approves every card with its defaults and moves to the next flagged post (`autoRun`, Stop and Resume through `/api/jobs/[id]/auto`).
6. **Edit** (`lib/fal.ts`, `editImage`). Per slide and market the engine builds one prompt: a fixed "keep everything else" sentence, one sentence per approved card, and "spell any new text exactly". `nano-banana-pro/edit` runs with the original's aspect ratio. Output images are downloaded into `data/uploads/results/` (fal links expire). Every fal call gives up after 3 minutes.

## Data
| Path | What |
|---|---|
| `data/jobs/<id>.json` | One job: source, markets, mode, library, chat messages (plans, results), costs. Written atomically. |
| `data/uploads/library/<handle>/` | Imported images, `manifest.json`, `scan.json`, `plans/`. |
| `data/uploads/results/`, `references/` | Edited slides and AI reference images. |
| `data/uploads/avatars/<handle>.jpg` | Profile pictures for the sidebar. |

Everything under `data/uploads/` is served at `/api/files/...`. fal can't reach localhost, so files are uploaded to fal storage before a scan or edit. Manus only gets text.

## Markets and prompts
`lib/markets.ts` lists the markets; each has `prompts/markets/<code>.md` with the sections Protect, Language & formats, Objects & food, Places, Keep it real and Never. `npm run check:prompts` checks them. Adding a market is one line plus one file.

## Web app
- Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS 4, Radix UI. Work Sans, palette "green black and bone".
- Start page: account check, post count, markets, Review or Auto. Job page: agent chat on the left, library on the right (tabs on phones). Brands in the sidebar, or in a row under the top bar on phones.
- The browser polls the job every second while the agent works and every 4 seconds otherwise.
- Keys come from `.env.local`, written by `npm run setup` (`scripts/setup.mjs`, checks in `lib/setup.mjs`). With `ACCESS_CODE` set, pages and API routes need the code; without it there is no login.

## Read only replay
`scripts/export-run.mjs` copies finished jobs and their images into `web/showcase/`. `npm run build:showcase` makes a static export of the same app (from a temporary copy without the API routes, login and middleware) for `/localify`. `lib/showcase.ts` reads the exported JSON instead of the API, and every action shows a read only hint. `.github/workflows/pages.yml` deploys it to GitHub Pages on every push to `main`.
