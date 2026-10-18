// Interactive setup: asks for the three API keys, tests each one live, and writes web/.env.local.
// Usage (from web/): npm run setup            ask for every key (Enter keeps the current one)
//                    npm run setup -- --check  only test the keys already in .env.local
// Other lines in .env.local (comments, PLAN_CACHE, …) are kept as they are.
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { SERVICES, checkKey } from "../lib/setup.mjs";

const FILE = path.join(process.cwd(), ".env.local");
const tty = process.stdout.isTTY;
const c = (code) => (s) => (tty ? `\x1b[${code}m${s}\x1b[0m` : s);
const [bold, dim, green, red] = [c(1), c(2), c(32), c(31)];
const mark = (ok) => (ok ? green("✓") : red("✗"));

// KEY=value lines of .env.local (quotes stripped), plus the raw lines so they can be written back.
function readEnv() {
  const lines = fs.existsSync(FILE) ? fs.readFileSync(FILE, "utf8").replace(/\s+$/, "").split("\n") : [];
  const env = {};
  for (const line of lines) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) env[m[1]] = m[2].trim().replace(/^(['"])(.*)\1$/, "$2");
  }
  return { lines, env };
}

// Replaces a key's line in place (also a commented-out "# KEY=" line), or appends it. Empty value = remove.
function setLine(lines, key, value) {
  const at = lines.findIndex((l) => new RegExp(`^\\s*(#\\s*)?${key}\\s*=`).test(l));
  const line = value ? `${key}=${value}` : null;
  if (at >= 0) {
    if (line) lines[at] = line;
    else if (!lines[at].trimStart().startsWith("#")) lines.splice(at, 1);
  } else if (line) lines.push(line);
}

const masked = (v) => (v.length > 10 ? `${v.slice(0, 4)}…${v.slice(-4)}` : "••••");

// One line of input; hidden = typed or pasted characters aren't echoed (for keys).
function ask(rl, question, hidden = false) {
  return new Promise((resolve) => {
    rl.stdoutMuted = false;
    rl.question(question, (answer) => {
      if (hidden) process.stdout.write("\n");
      resolve(answer.trim());
    });
    rl.stdoutMuted = hidden;
  });
}

async function checkOnly() {
  const { env } = readEnv();
  if (!fs.existsSync(FILE)) console.log(red("No .env.local yet. Run: npm run setup"));
  let ok = true;
  for (const s of SERVICES) {
    const res = await checkKey(s, env[s.key]);
    ok &&= res.ok;
    console.log(`${mark(res.ok)} ${bold(s.name.padEnd(6))} ${res.detail}`);
  }
  console.log(dim(`Login: ${env.ACCESS_CODE ? "access code set" : "none (local use)"}`));
  process.exit(ok ? 0 : 1);
}

async function interactive() {
  if (!process.stdin.isTTY) {
    console.error("npm run setup needs a terminal. Or copy .env.example to .env.local and fill it in.");
    process.exit(1);
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  rl._writeToOutput = function (s) {
    if (!this.stdoutMuted) rl.output.write(s);
  };
  const { lines, env } = readEnv();
  if (!lines.length) lines.push("# Written by npm run setup. Run it again to change a key; see .env.example for all options.");

  console.log(`\n${bold("Localify setup")}  ${dim(`writes ${path.relative(process.cwd(), FILE)}; input is hidden; Enter keeps the current value`)}\n`);
  const results = [];
  for (const s of SERVICES) {
    console.log(`${bold(s.name)}: ${s.role}\n${dim(`Get it at ${s.help}`)}`);
    let value = env[s.key] ?? "";
    for (;;) {
      const typed = await ask(rl, `${s.key}${value ? dim(` [${masked(value)}]`) : ""}: `, true);
      if (typed) value = typed;
      if (!value) {
        console.log(`${mark(false)} Skipped. ${s.key === "APIFY_TOKEN" ? "Without it only posts already on disk can be used." : "Runs won't start without it."}\n`);
        break;
      }
      process.stdout.write(dim("  checking… "));
      const res = await checkKey(s, value);
      process.stdout.write(`\r${mark(res.ok)} ${res.detail}\n`);
      if (res.ok) break;
      const again = await ask(rl, "  Try another key? [Y/n] ");
      if (/^n/i.test(again)) {
        console.log(dim("  Saved anyway; npm run setup -- --check tests it again."));
        break;
      }
      value = "";
    }
    setLine(lines, s.key, value);
    results.push({ s, value });
    console.log();
  }

  console.log(`${bold("Access code")}: ${dim("only if other people can reach this app (e.g. on a server). Empty = no login.")}`);
  const code = await ask(rl, `ACCESS_CODE${env.ACCESS_CODE ? dim(" [set; type - to remove]") : ""}: `, true);
  if (code === "-") setLine(lines, "ACCESS_CODE", "");
  else if (code) setLine(lines, "ACCESS_CODE", code);
  rl.close();

  fs.writeFileSync(FILE, lines.join("\n").replace(/\n*$/, "\n"));
  fs.chmodSync(FILE, 0o600); // keys: owner only
  console.log(`\n${green("Saved")} ${path.relative(process.cwd(), FILE)}.`);
  const missing = results.filter((r) => !r.value).map((r) => r.s.name);
  console.log(missing.length ? `Missing: ${missing.join(", ")}. Run npm run setup again when you have them.` : "Next: npm run dev, then open http://localhost:3000");
  console.log(dim("Restart the server if it's running, so it reads the new keys."));
}

await (process.argv.includes("--check") ? checkOnly() : interactive());
