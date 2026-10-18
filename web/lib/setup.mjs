// The three API keys and one cheap live check per service.
// Plain JS so `npm run setup` (scripts/setup.mjs) and the app (/api/setup) run the same checks.

/** @typedef {"MANUS_API_KEY" | "FAL_KEY" | "APIFY_TOKEN"} KeyName */
/** @typedef {{ ok: boolean, detail: string }} CheckResult */

const TIMEOUT_MS = 10_000;

async function call(url, headers) {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

// 401/403 = wrong key; anything else not OK = the service is down or rate-limited.
const why = (status) => (status === 401 || status === 403 ? "Key rejected. Check that it was copied in full." : `Unexpected answer (HTTP ${status}). Try again.`);

const money = (usd) => `$${usd.toFixed(2)}`;

export const SERVICES = [
  {
    key: "MANUS_API_KEY",
    name: "Manus",
    role: "plans what to change per market (a few credits per post)",
    help: "https://manus.im → Settings → API",
    async check(key) {
      const { status, body } = await call("https://api.manus.ai/v2/task.list?limit=1", { "x-manus-api-key": key });
      if (status !== 200 || body.ok === false) return { ok: false, detail: why(status) };
      return { ok: true, detail: "Key works." };
    },
  },
  {
    key: "FAL_KEY",
    name: "fal",
    role: "scans posts and edits the images (~$0.002 per scan, $0.15 per edit)",
    help: "https://fal.ai/dashboard/keys",
    async check(key) {
      const { status, body } = await call("https://api.fal.ai/v1/models/pricing?endpoint_id=fal-ai/nano-banana-pro/edit", { Authorization: `Key ${key}` });
      if (status !== 200) return { ok: false, detail: why(status) };
      const price = body.prices?.[0]?.unit_price;
      return { ok: true, detail: typeof price === "number" ? `Key works. Image edits cost ${money(price)} each.` : "Key works." };
    },
  },
  {
    key: "APIFY_TOKEN",
    name: "Apify",
    role: "imports the Instagram posts (~$0.001 per post read)",
    help: "https://console.apify.com/account/integrations",
    async check(token) {
      const { status, body } = await call("https://api.apify.com/v2/users/me/limits", { Authorization: `Bearer ${token}` });
      if (status !== 200) return { ok: false, detail: why(status) };
      const used = body.data?.current?.monthlyUsageUsd;
      const max = body.data?.limits?.maxMonthlyUsageUsd;
      return { ok: true, detail: typeof used === "number" && typeof max === "number" ? `Key works. ${money(used)} of ${money(max)} used this month.` : "Key works." };
    },
  },
];

/** @returns {Promise<CheckResult>} */
export async function checkKey(service, value) {
  if (!value) return { ok: false, detail: "Not set." };
  return service.check(value).catch(() => ({ ok: false, detail: "Couldn't reach the service. Check your connection." }));
}

/** @returns {Promise<{ key: KeyName, name: string, ok: boolean, detail: string }[]>} */
export async function checkSetup(env = process.env) {
  return Promise.all(
    SERVICES.map(async (s) => ({ key: s.key, name: s.name, ...(await checkKey(s, env[s.key]?.trim())) })),
  );
}
