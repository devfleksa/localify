# Decision Log

Decisions and the reasons behind them. The hackathon day is listed decision by decision; what came after is summarized by topic.

## Hackathon day, 2026-10-12

- Track: automate a repetitive marketing workflow (not brand upgrade / new launch) — No existing brand or product idea to bring.
- Product = cultural video localization (object swap in video + cover + text, per market) — User likes object swapping; dubbing is commoditized, cultural adaptation is not.
- User picks the markets; no market-fit prediction in the core — Keep it simple for the hackathon; LLM percentages would be unverifiable.
- Dropped: A/B testing, local products/prices, Apify hook/trend scraping, comment/metrics scraping — Platforms already give audience/metrics data; hook data too messy; focus on localization. Apify not forced.
- Two modes: Auto (agent decides) and Review (owner approves plan) — Flexibility + guards against cultural stereotypes.
- Core differentiator for Q&A: the agent decides what to change per market and does video, cover, text for N markets in one run — Answers "isn't this just an object swap tool?"
- Positioning: this is cultural localization, NOT virtual try-on / clothing-model swapping — User wants to avoid confusion with catalog tools. Dropped the clothing-by-season example.
- Video and image editing with **fal.ai** — fal.ai is the event's image and video supporter, with credits for every team. Demo clip kept to ≤10 s to fit fal edit-model limits.
- Video object swap: test fal.ai video edit models on the day (see the test results below) — fal is covered by the event credits.
- Test only 3 fal models: Seedance 2.5, Kling O3 Edit, HappyHorse 1.0 — Fewer tests, faster decision; these cover 30 s (Seedance) and dedicated object-swap editors (Kling, HappyHorse).
- Video describer: fal `video-understanding` only (no Gemini) — Covered by event credits; promptable.
- Reference images: per swapped object, show a web photo (Manus browser + fal background removal) and an AI image (fal) side by side; user can upload own; one combined review screen — Control + consistency (same reference for video and cover); one click instead of a loop.
- Interface: own web app on the user's server/domain, calling the **Manus API** (v2) as the engine; one shared access code, no registration — Real product feel; Manus still orchestrates every job; access code stops strangers spending credits.
- Use Manus Skills (`localize-video`, `swap-video`); details later — Consistent runs on stage; strong "Use of Manus" story.
- 3 skills: `localize-video` (conductor), `culture-planner` (brain), `media-tools` (hands) — Clear split: one decides, one does, one runs the process; easy to fix on the day.
- Supported markets: US, Türkiye, Japan, Saudi Arabia, India, Brazil — Mix of audience size, ad market, cultural distinctness; Türkiye for the judges; 4 writing systems. Small enough to verify every fact.
- Web app stack: Next.js + Tailwind + shadcn/ui, one project (API routes = thin server), no database — Easy to maintain, polished UI fast, any LLM knows it; one thing to deploy.
- UI is a chat with the agent: progress as messages, plan/review and results as cards in the thread — Feels like an agent (fits Manus story), easy to follow in a 2-min demo.
- Morning — **Pivot:** from localizing one uploaded video to bulk localization of a brand's video library (e.g. an airline's Instagram Reels); lead user = brands — No suitable single demo video found; a real brand's library gives real data, a clear scale before/after, and a natural role for Apify (intake).
- Morning — Pipeline: Apify → fal `video-understanding` (whole video; one call describes + classifies via JSON prompt) → filter (localizable + views, top N) → Manus plans → fal generates — video-understanding is a vision LLM at $0.01 per 5 s (~$0.06/30 s Reel), so it can classify itself; a separate classifier adds cost and failure points without savings. The expensive steps (Manus credits, fal generation ~$3–5/clip) run only on filtered videos.
- Morning — No 10 s trim; send whole video (cap ~30–45 s) — Trim saves only ~$120 per 3,000 videos, needs download/ffmpeg/re-upload, and misses end cards (prices, URLs, CTAs, promo dates).
- Morning — Output tiers: Tier A (text, price, CTA, cover, subtitles) = reliable core; Tier B (in-video object swap) = wow, best effort. The library audit table is a deliverable on its own — Generation quality is still the main risk; the demo must survive a failed swap.
- Morning — Input: business enters an Instagram/TikTok profile URL (saved brands in the sidebar, no accounts); demo limit ~100 posts — Businesses have libraries, not single uploads.
- Morning — Scrape + scan once, save a snapshot, replay it in the demo ("Rescan" runs live); no bulk download (scan uses scraped URLs; download only the top N for generation) — Don't spend credits/time on every run; IG URLs expire, so generation needs a stored copy.
- Morning — Job screen = agent chat (left) + library panel with funnel and audit table (right) — Judges see the scale and the agent working at once; a 100-row table is cramped inside a chat column.
- Morning — Reference images: AI image (fal) + user upload; web photos dropped — User's choice; simple and automatable; web photos carry copyright risk in a brand's ad.
- Morning — Demo: no live scraping; the user provides the brand's videos, loaded from `web/data/uploads/library/` when a profile URL is entered (product flow stays URL-first; pitch discloses the preload) — Time; scraping not needed to show the value. Apify stays the production intake.
- Morning — Demo localizes for all 6 markets — User's choice.
- Morning — Library includes image posts (single + carousel), not only videos — User: more opportunity on the post side; image edits are cheaper and more reliable than video edits. Image posts are scanned with a fal vision model (to pick).
- Morning — Brand sidebar is collapsible (icon rail) — User request; more room for chat + library.
- Morning — Image posts scanned with fal `openrouter/router/vision` + `google/gemini-2.5-flash`, same prompt/JSON as videos (`web/prompts/scan.md`); carousels in one call — Same output shape as video-understanding, multiple images per call, cheap (~$0.0006/image measured), reports real cost.
- Morning — New finding type "setting" (the place shown: street, billboard, station); scan only describes it, Manus (skill) decides whether to relocate the ad to a local street — User idea from the Zara billboard posts; edit decisions belong to Manus.
- Morning — Post edits: Manus writes the edit prompt per slide/market (structured output), fal `nano-banana-pro/edit` executes; temporary skill in `web/prompts/plan-post.md` (real Manus skill later) — First end-to-end test produced convincing Istanbul placements with the ad untouched.
- Afternoon — Manus gets text only (caption + scan JSON), never the images; fal gets the original image for the edit — User: cheaper and faster; the vision model already turned the media into text. Consequence: the scan must describe each slide's scene in enough detail for Manus to write edit prompts.
- Afternoon — Seedance 2.5 dropped for video edits — It rejects input videos showing real people (`content_policy_violation` / `partner_validation_failed`); brand videos almost always show people.
- Afternoon — Whole multi-cut video edits don't work; video edits must target one shot — Test (21 s Nike-style Reel, cuts every 0.5–1.5 s, TR: Eiffel → Galata + translate a game card): HappyHorse (6.5 min) kept the video but left the Eiffel Tower and garbled/misplaced the text; Kling O3 Standard (9.5 min) re-generated the whole clip (new shots, new faces), made an Eiffel/Galata hybrid, did not translate the card.
- Afternoon — Drop video edits; generate localized image posts/carousels only (videos still scanned and planned, shown in the audit) — User: limited time; video edit models failed or refused (12:47, 13:22) while the image chain already works.
- Afternoon — Review flow = change cards per market: Manus proposes cards (background, object, text, price, CTA, date, needs-review), each with its own prompt sentence; the user ticks cards on/off per market tab; visual cards use "described in prompt" (default), on-demand AI reference image, or upload; text cards use AI text (default) or the user's own text; our code assembles the final edit prompt, so changing choices never re-runs Manus. Auto mode = all cards with defaults. A regenerate button per output slide — User decision; image generation is cheap, Manus credits are spent once per post.
- Afternoon — Product name: **Localify** — User decision (replaces placeholder "CultureCut").
- Afternoon — Demo focuses on Istanbul; planning skill gets a Türkiye place library (`web/prompts/places-tr.md`: famous places grouped by scene type, with visual cues for the image model); the engine attaches `prompts/places-<market>.md` for each selected market — User: more local, most popular places; the edit model needs visual details, not just a name.
- Afternoon — Per photo and market: max 1 background card + max 2 object cards (skill rule, also enforced in code); Türkiye library gets Turkish objects/food (mangal grill, tea, simit, döner…) mapped from what they replace — User: demo will swap an object to a Turkish grill.
- Afternoon — Take Manus's plan from its first JSON chat message (~30 s) and stop the task, instead of waiting minutes for the structured output; schema and prompt limited to the job's markets — Task DwLZVBENntJfurgbuM7kfw wrote the plan at 28 s but the structured output step ran 3+ min.

## After the hackathon

A summary of what we changed after the event, by topic.

- **Goal.** A public repo that anyone can clone and run with their own Manus, fal and Apify keys, a read only replay of real runs on GitHub Pages, and then an archive. Manus stays the planner.
- **Image posts only.** Reels, video posts and video slides in carousels are skipped at import; all video scanning, planning and editing was removed.
- **Instagram import.** The account is checked with Apify's profile scraper, then the posts are read with `instagram-scraper/fast-instagram-post-scraper` (the official post scrapers stop at 12 posts) and downloaded right away into the brand's library folder, since Instagram links expire. The first scrape is sized by the share of image posts in the profile. Imports and scrapes of one handle run one at a time, and a short result is scraped again.
- **One rulebook for scan and plan.** `prompts/rules.md` says what we edit, what we never edit and how strong a finding is. Findings carry strength, slides and a review flag for people and clothing. A post needs localizing only with an editable must or strong finding for one of the job's markets.
- **One file per market.** Each market has `prompts/markets/<code>.md` with the same six sections. The scan covers every market once; Manus gets the job's market files as attachments because it caps message text at about 5,000 tokens. Adding a market is one line plus one file.
- **Market rules.** Each market's text is rewritten in its language (Hindi for India) and only the brand's tagline stays. Outdoor scenes always get a background change matched to the landscape. Object changes are swaps, never additions. Product and menu names are never findings.
- **Edits.** Every edit keeps the original's aspect ratio. AI reference images show only the new place or object. Results and references are saved locally because fal links expire, and every fal call gives up after 3 minutes.
- **Review and Auto.** Auto mode localizes every flagged post one after another with Stop and Resume. Download and Regenerate work per slide, per market or for all markets. Plan reasons are tied to their slides. Saved plans are reused only when they cover every market of the job.
- **Reliability.** Jobs survive a server restart, every JSON file is written atomically, Manus tasks are always stopped and their credits counted, and each job shows its running cost.
- **Design.** The interface was redesigned with the design-taste-frontend skill: dark palette "green black and bone", Work Sans, guided setup, library grid with a detail view, before and after viewer. On phones the brands sit in a row under the top bar.
- **Running it yourself.** `npm run setup` asks for the keys in the terminal, tests them and writes `.env.local`. No login unless `ACCESS_CODE` is set. Docker Compose and an MIT license. No demo images in the repo.
- **Replay.** Three real runs (Toyota, LEGO, Hyundai) are exported with their images and served as a static, read only copy of the app at the root of GitHub Pages; every action shows a read only hint and downloads still work. A few slides in these runs were fixed by hand: Toyota's last post was localized again, one Toyota slide for Brazil was regenerated, and Hyundai's slide 5 was edited by script with its Arabic text change added to the plan by hand.
- **Repo and docs.** The repo is `devfleksa/localify`. The README tells the story and how to run it; the docs are kept to a minimum. The public repo starts from a single commit credited to @devfleksa and @gokturkcolak.
