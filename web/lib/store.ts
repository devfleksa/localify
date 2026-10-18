import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Costs, Job, Message, NewMessage } from "./types";

// Jobs live in memory and are mirrored to data/jobs/<id>.json so a restart keeps them.
export const DATA_DIR = path.join(process.cwd(), "data");
export const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
const JOB_DIR = path.join(DATA_DIR, "jobs");

// Write then rename (atomic): a crash mid-write never leaves a half-written JSON file.
export function writeJson(file: string, data: unknown) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

// Survive Next.js dev hot reloads.
const g = globalThis as unknown as { __jobs?: Map<string, Job> };

function jobs(): Map<string, Job> {
  if (g.__jobs) return g.__jobs;
  g.__jobs = new Map();
  fs.mkdirSync(JOB_DIR, { recursive: true });
  for (const f of fs.readdirSync(JOB_DIR)) {
    if (!f.endsWith(".json")) continue;
    let job: Job;
    try {
      job = JSON.parse(fs.readFileSync(path.join(JOB_DIR, f), "utf8")) as Job;
    } catch (e) {
      console.error(`Skipping unreadable job file ${f}`, e); // one bad file must not hide every other job
      continue;
    }
    if (!Array.isArray(job.library)) continue; // not a job file this version can show
    // A job that was mid-run when the server stopped can't resume.
    if (job.auto) job.auto = { ...job.auto, running: false, stopping: false };
    if (job.status === "running") {
      // The scanned library survives: go back to picking a post (or failed if the scan never finished).
      const hasResults = job.messages.some((m) => m.kind === "results");
      job.status = !job.library.length ? "failed" : hasResults ? "done" : "ready";
      job.messages.push({ id: newId(), at: Date.now(), kind: "error", text: "Interrupted by a server restart." });
    }
    // Edits that were in flight will never land: stop their spinners (Regenerate can redo them).
    for (const m of job.messages) {
      if (m.kind === "agent_text") m.pending = false;
      if (m.kind === "results") for (const r of m.results) r.pending = [];
    }
    g.__jobs.set(job.id, job);
  }
  return g.__jobs;
}

function persist(job: Job) {
  fs.mkdirSync(JOB_DIR, { recursive: true });
  writeJson(path.join(JOB_DIR, `${job.id}.json`), job);
}

export const newId = () => randomUUID().slice(0, 8);

export function listJobs(): Job[] {
  return [...jobs().values()].sort((a, b) => b.createdAt - a.createdAt);
}

export function getJob(id: string): Job | undefined {
  return jobs().get(id);
}

export function saveJob(job: Job) {
  jobs().set(job.id, job);
  persist(job);
}

export function updateJob(id: string, fn: (job: Job) => void): Job | undefined {
  const job = getJob(id);
  if (!job) return;
  fn(job);
  saveJob(job);
  return job;
}

export function addMessage(id: string, msg: NewMessage): Message | undefined {
  const full = { ...msg, id: newId(), at: Date.now() } as Message;
  return updateJob(id, (job) => {
    // A new agent message replaces the "working…" indicator of the previous one.
    for (const m of job.messages) if (m.kind === "agent_text") m.pending = false;
    job.messages.push(full);
  }) && full;
}

// Adds what a paid step just spent to the job's live cost.
export function addCost(id: string, key: keyof Costs, amount: number) {
  if (!amount) return;
  updateJob(id, (job) => {
    job.costs ??= { apify: 0, scan: 0, edit: 0, manusCredits: 0 };
    job.costs[key] += amount;
  });
}
