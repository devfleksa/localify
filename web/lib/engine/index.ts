import type { Job, ReviewChoice } from "../types";
import type { MarketCode } from "../markets";
import { manusEngine } from "./manus";

// The web app only talks to this interface (implemented by the Manus engine).
// Every method must return quickly; progress is written to the store.
export interface Engine {
  // Load the brand's library and scan every post (describe + classify).
  start(job: Job): Promise<void>;
  // Plan the localization of one post from the library (user clicked a row, or the top pick).
  select(job: Job, itemId: string): Promise<void>;
  // Auto mode: run = true starts (or resumes) the loop over every flagged post; false asks it to stop.
  auto(job: Job, run: boolean): Promise<void>;
  // Called when the user approves the plan in Review mode.
  approve(job: Job, choices: ReviewChoice[]): Promise<void>;
  // Review screen: generate an AI reference image for one visual change card; returns its URL.
  reference(job: Job, changeId: string): Promise<string>;
  // Results: re-run the edit for one slide of one market (same prompt, new seed).
  regenerate(job: Job, resultsId: string, market: MarketCode, slide: number): Promise<void>;
}

export function engine(): Engine {
  return manusEngine;
}
