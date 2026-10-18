# Localify: Project Context

This file is the entry point for any LLM session on this project. Read it first, then the files below before answering.

## What this project is
Localify adapts a brand's Instagram image posts to other markets: it scans the whole library, sorts posts by what they need per market, and rebuilds them with Manus (planning) and fal (image edits). It started at the Slush'D "10X Your Brand" Hackathon in Istanbul on October 12, 2026, built by @devfleksa and @gokturkcolak, and was polished afterwards into an open source project with a read only replay on GitHub Pages.

The project is finished and archived. Changes now are fixes or small improvements, not new scope.

## Read order
1. `docs/project.md`: what the product is, who it is for, limits
2. `docs/architecture.md`: how it works, files, data
3. `docs/decisions.md`: decisions and why (don't re-argue these without a new reason)

Also: `docs/prompt-tuning.md` (known prompt issues), `docs/event.md` (the hackathon: schedule, judging, sponsors).

Code: `web/` is the Next.js app. Run: `cd web && npm install && npm run setup && npm run dev` (see `README.md` and `web/README.md`).

## Rules for every session
- **Start:** read the files above. Don't ask the user to repeat what is written there.
- **Writing:** public text (README, docs, UI copy) in plain sentences: no dashes, no emoji, no dramatic openings; refer to people by GitHub handle.
- **Commits:** leave changes uncommitted until the user has reviewed them.
- **Before a commit:** `npx tsc --noEmit`, `npm run lint` and `npm run build` pass in `web/`. Don't run `npm run build` while `npm run dev` is running (both use `web/.next`); if pages return 500, stop the dev server, delete `web/.next` and restart.
- **UI changes:** every UI change, however small, uses the design-taste-frontend skill (`.claude/skills/design-taste-frontend`, tasteskill by Leon Lin and blueemi, MIT). Localify's direction is already drawn and saved in `.taste-skill/direction.json` ("The product performs", palette green black and bone, Work Sans): keep it and don't draw a new one. Colours, motion and surface steps are tokens in `web/app/globals.css`; reuse them. Before you finish, run the skill's `lint.mjs` on `web/components` and `web/app` (no FAIL, no WARN) and its `inspect.mjs` at 1440 and 390 px.
- **End:** add any decision to the topic summary in `docs/decisions.md` (what and why, no dates), and update `docs/prompt-tuning.md` when a prompt issue is fixed or found.
- Keep docs short and current. Replace outdated text instead of piling on.
