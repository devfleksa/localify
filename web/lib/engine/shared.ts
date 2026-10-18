import type { Change, ReviewChoice } from "../types";

// Applies the user's review choice to a change card (both engines).
export function applyChoice(c: Change, choice: ReviewChoice) {
  c.skipped = !!choice.skipped;
  if (choice.ref) c.ref = choice.ref;
  if (choice.refUrl !== undefined) c.refUrl = choice.refUrl || undefined;
  const text = choice.text?.trim();
  c.text = text && text !== c.replacement ? text : undefined;
}
