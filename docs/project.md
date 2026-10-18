# Project: Localify

_State at the archive (October 2026). How it got here: [`decisions.md`](decisions.md). The event: [`event.md`](event.md)._

## What it is
Localify adapts a brand's Instagram image posts to other markets. It scans the brand's whole library, sorts the posts by what each one needs per market (visual changes, only text changes, or nothing), and rebuilds the posts you pick, or all flagged posts in Auto mode. The changes go beyond the caption: places, objects, food, dates, prices and the text inside the image.

Tagline: "Dubbing tools translate the words. We translate the culture."

## The problem
A brand that posts in several countries usually makes its content for one of them. A post that works in New York can feel foreign in Istanbul or Delhi because of the street in the background, the food on the table or the text on the image. Fixing that is done by hand, post by post, so most of a library is never adapted. Translating the caption is easy and already automated; deciding what in the picture has to change for each culture, and making that change, is not.

## Who it is for
Marketing teams and agencies that run one brand in several markets and want to reuse their existing posts there. It is not a virtual try on or catalog tool: every change has to come from the target market's culture, and people, faces and clothing are kept as they are.

## How it works
1. **Import.** Apify reads the brand's latest Instagram posts. Single images and carousels are downloaded; Reels and video slides are skipped.
2. **Scan and sort.** A fal vision model reads every post once and lists what is specific to a market. The library panel sorts posts into visual, text only and nothing to change, per market.
3. **Plan.** Manus reads one post's scan (text only, never the image) together with the rules for each market and returns change cards per market, each with a reason, tagged Protect (avoid a mistake) or Resonate (add a local touch).
4. **Review or Auto.** In Review mode the user turns cards on or off, edits text and picks a reference image. In Auto mode the agent works through every flagged post with Stop and Resume.
5. **Edit.** fal edits each slide per market from a prompt built out of the approved cards, keeping the aspect ratio and everything the cards don't mention. Results can be compared, regenerated and downloaded per slide, market or job.

Markets: United States, Türkiye, Japan, Saudi Arabia, India, Brazil. Each market's text is written in its language (Hindi for India) and the brand's tagline is kept.

## Why these tools
Manus, fal and Apify were the hackathon's sponsors and every team got credits for them. Each one sits behind its own file (`web/lib/engine/manus.ts`, `web/lib/fal.ts`, `web/lib/apify.ts`) so it can be replaced.

## Costs
Import about $0.001 per post read, scan about $0.002 per post (once), plan about 5 Manus credits per post, edit $0.15 per edited image. The Toyota run in the replay (10 posts, 8 localized for 2 markets) cost $9.02 and 41 Manus credits.

## Limits
- Instagram only, image posts only.
- Known prompt problems are listed in [`prompt-tuning.md`](prompt-tuning.md): foreground signs surviving a background swap, close ups zoomed out on a background swap, the brand's own product flagged, a text change sometimes left out by Manus.
- The market files are written from general knowledge and need a check by people from each market; the Hindi and Arabic text needs a native speaker.
- One user, one server: jobs live in memory and in JSON files.

## Out of scope
Video edits (tested on the hackathon day and dropped, see the hackathon day entries in [`decisions.md`](decisions.md)), posting back to Instagram, user accounts, A/B testing.
