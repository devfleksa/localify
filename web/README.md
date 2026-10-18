# Web app

Chat-style front end and thin server for the localization agent (see `../docs/architecture.md`).

```bash
npm install
npm run setup                # asks for the keys, tests them, writes .env.local
npm run dev                  # http://localhost:3000
```

- The engine (`lib/engine/manus.ts`) runs fal scans, live Manus plan, fal image edits (needs `FAL_KEY`, `MANUS_API_KEY`). `PLAN_CACHE=prefer` reuses a saved Manus plan (`<library>/plans/<id>.json`) instead of waiting ~3 min.
- Jobs and uploads are stored in `data/` (gitignored) and served at `/api/files/...`. fal can't reach localhost, so files are uploaded to fal storage before a scan or edit; Manus only gets text.
- Product name lives in `lib/brand.ts`.

## Brand library (image posts only)
The user enters an Instagram handle and verifies it. With `APIFY_TOKEN` set, the real engine scrapes the
latest N **image posts** (single images and carousels; Reels and video slides are skipped) and downloads
them into `data/uploads/library/<handle>/` (`lib/apify.ts`, `lib/importer.ts`). Running again only
downloads new posts. Without a token the app only uses that folder if it already exists.

- Images (jpg/png/webp) go straight in the folder: each file = one post.
  A subfolder of images = one carousel post (slides in file-name order). Video files are ignored.
- Optional `manifest.json` (order = post order; the importer writes it newest first):
  `[{ "file": "a.jpg", "caption": "...", "views": 1200, "postedAt": "2026-09-01" },
    { "files": ["menu/1.jpg", "menu/2.jpg"], "caption": "...", "views": 800 }]`
  (without it: every file/subfolder, name as caption, 0 likes). `views` = likes.
- Scan results are saved once in `scan.json` so a second run doesn't scan again. Delete `scan.json`
  to rescan.

## Prompts and markets
- `prompts/rules.md`: shared rulebook (what we edit, never edit, strength). `prompts/scan.md`: fal vision scan.
  `prompts/plan-post.md`: Manus planning skill. `prompts/markets/<code>.md`: one file per market (Protect, Language &
  formats, Objects & food, Places, Keep it real, Never); built by `lib/prompts.mjs`. Rules that came from testing and
  known issues: `../docs/prompt-tuning.md`.
- The scan covers every market (each market's Protect rules go into the prompt); Manus gets the skill as text and
  the job's market files as attachments (`market-<code>.md`), because Manus caps a message's text at ~5,000 tokens.
- **Add a market:** add `{ code, name, flag }` to `lib/markets.ts`, copy `prompts/markets/_template.md` to
  `prompts/markets/<code>.md` and fill it in, run `npm run check:prompts`. Old scans are redone for jobs with the new market.
- `npm run check:prompts` checks the market files and prints prompt sizes (`-- --print` prints the built prompts).

## Test scripts (real API calls; need `FAL_KEY` in `.env.local`)
- `node --env-file=.env.local scripts/scan-test.mjs <handle> [model]`: scans image posts with the app's scan prompt (`lib/prompts.mjs`), prints JSON + cost.

## Read-only replay (GitHub Pages)
- `node scripts/export-run.mjs <jobId>…` copies finished jobs and the images they use into `showcase/` (resized; Manus task links dropped). Commit it.
- `npm run build:showcase` builds a static copy of the app into `out/showcase/` for `/localify` (`BASE_PATH=""` for the root of a domain). `.github/workflows/pages.yml` builds and deploys it to GitHub Pages on every push to `main`. It builds from a temporary copy without `app/api`, `app/login` and `middleware.ts`; `lib/showcase.ts` reads the exported JSON instead of the API, and every action answers with a read-only hint.
- Test it locally: serve a folder that has `out/showcase` at `localify/` (e.g. `python3 -m http.server`).
