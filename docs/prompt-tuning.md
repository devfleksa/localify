# Prompt tuning

How the prompts are built, why some rules exist, and what still goes wrong. Start here if you want to improve the results.

## Where the prompts live
All prompts are in `web/prompts/` and are built by `web/lib/prompts.mjs`, which the app and the scripts share.
- `rules.md`: the shared rulebook for the scan and for Manus (what to edit, what never to edit, how strong a finding is). Generic only, no market facts.
- `scan.md`: the fal vision scan. Sections: Role, Rules, Target markets, Finding types, Report rules, Self-check, Output. `{{MARKETS}}` is filled with each market's title, formats line and Protect rules. The scan covers every market so one scan serves any job; `scan.json` records which markets it covered, and a job with a new market scans again.
- `plan-post.md`: the Manus planning prompt. Sections: Role, Inputs, Procedure, Card types, Fields, Final checklist, Output.
- `markets/<code>.md`: one file per market with the sections Protect, Language & formats, Objects & food, Places, Keep it real and Never, plus a `Copy language:` line. `_template.md` is the starting point for a new market.

Manus rejects message text over about 5,000 estimated tokens, so the market files are sent as attachments (`market-<code>.md`), which don't count. `npm run check:prompts` keeps the planning prompt under 3,000 tokens.

## Rules that came from testing
Each of these fixed a real failure, so keep them unless you have a better fix.
- **One finding per element.** The scan reports each element once with the slides it appears on, instead of one finding per slide.
- **Product and menu names are never findings.** Without this the scan flagged drink names that can't be changed.
- **The place around an outdoor ad is always strong.** Billboards, bus shelters, metro panels, posters and shop windows. Without this most outdoor ads were rated weak and skipped.
- **Outdoor backgrounds always change.** Streets, parks, city views, waterfronts, forests, mountains, beaches and deserts are strong in the scan, and the planner gives every outdoor slide a background card per market, matching the type of landscape. Not for studio backdrops, mostly hidden backgrounds, interiors, the brand's own store or a landmark that is the point of the post. Without this a riverbank camping post only got its stove swapped.
- **Places come from the market file** or are real places in that market.
- **Copy language.** Captions, meme text, offers, CTAs, prices and dates are written in the market's copy language even where English is understood. Only the brand's tagline stays. India uses Hindi in Devanagari.
- **Object changes are written as swaps:** "Remove the old object completely and put the new one exactly where it stood, at the same size". Before this the edit model added a new object next to the old one.
- **AI reference images show only the new thing.** A background reference is an empty photo of the place in the slide's aspect ratio; an object reference is the object alone on light grey. The edit prompt says what to take from each reference and what to ignore. Before this, references had cars or whole streets in them that leaked into the edit.
- **Aspect ratio.** The original's ratio is passed to `nano-banana-pro/edit` when a supported ratio is within 3%, otherwise `auto`.

## Known issues
1. **Foreground signs survive a background swap.** A New York street sign and a food cart stayed under an Istanbul skyline. Idea: the scan lists foreign street level signs as part of the setting, and the background prompt says "including the street level and shop signs".
2. **Close ups get zoomed out on a background swap.** The edit model draws a wider shot so the new place shows (a Toyota grille close up became a whole street). It happens with and without a reference image.
3. **The brand's own product is still flagged** when it conflicts with a market, for example a bacon dish for Saudi Arabia, Türkiye and India. It can't be edited, so Manus should turn it into a review card.
4. **Manus sometimes leaves out a text change.** In the Hyundai replay the Arabic text card for slide 5 was added by hand.
5. **An object is sometimes added instead of swapped,** for example a Turkish mangal next to the original stove. The swap wording made it rare, not gone.
6. **The market files are written from general knowledge.** Places and Protect rules need a check by people from each market, Japan, India, Brazil and Saudi Arabia most. A native speaker should check the Hindi and Arabic wording for meaning and tone.
7. **The source market is not passed to the prompts.** Don't pick the brand's home market as a target.

## Testing a change
- `npm run check:prompts` checks the market files and prints the prompt sizes (`-- --print` prints the built prompts).
- `node --env-file=.env.local scripts/scan-test.mjs <handle> [model]` runs the scan prompt on an imported library and prints the JSON and cost without writing `scan.json`.
- For the plan and the edits, run a small job in the app (a few posts, one or two markets) and compare the results in the viewer. An edit costs $0.15 and a plan about 5 Manus credits.
