// Builds the read-only replay: a static export of the app showing the runs in showcase/ (scripts/export-run.mjs).
// Usage (from web/): npm run build:showcase [-- <outDir>]   default outDir: out/showcase
// BASE_PATH (env) = where it is served; default /localify (GitHub Pages project site). Use "" to serve at the root of a domain.
// Static export can't include API routes, the login page or middleware, so it builds from a temporary copy without them.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const web = process.cwd();
const outDir = path.resolve(process.argv[2] ?? "out/showcase");
const basePath = process.env.BASE_PATH ?? "/localify";
if (!fs.existsSync(path.join(web, "showcase", "runs", "index.json"))) {
  console.error("No exported runs. First: node scripts/export-run.mjs <jobId>…");
  process.exit(1);
}

const SKIP = new Set(["node_modules", ".next", "out", "data", "showcase/media", "app/api", "app/login", "middleware.ts"]);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "localify-showcase-"));
try {
  fs.cpSync(web, tmp, {
    recursive: true,
    filter: (src) => {
      const rel = path.relative(web, src).split(path.sep).join("/");
      return !SKIP.has(rel) && !rel.startsWith(".env");
    },
  });
  fs.symlinkSync(path.join(web, "node_modules"), path.join(tmp, "node_modules"), "dir");
  execFileSync("npx", ["next", "build"], {
    cwd: tmp,
    stdio: "inherit",
    env: { ...process.env, NEXT_PUBLIC_SHOWCASE: "1", NEXT_PUBLIC_BASE_PATH: basePath, NEXT_TELEMETRY_DISABLED: "1" },
  });
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(outDir), { recursive: true });
  fs.cpSync(path.join(tmp, "out"), outDir, { recursive: true });
  fs.cpSync(path.join(web, "showcase", "runs"), path.join(outDir, "runs"), { recursive: true });
  fs.cpSync(path.join(web, "showcase", "media"), path.join(outDir, "media"), { recursive: true });
  console.log(`Replay built in ${path.relative(web, outDir)}/ for ${basePath || "/"}`);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
