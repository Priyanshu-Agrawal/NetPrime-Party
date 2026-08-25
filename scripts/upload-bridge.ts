/**
 * upload-bridge.ts — compile + validate + publish provider injection scripts.
 *
 * For each provider it concatenates the universal core with the provider delta,
 * runs a STRICT parse smoke-test (a bad string in Supabase = every user on that
 * provider broken), and only on pass writes `bridge_script` + a content-hash
 * `script_version` to the providers row via the service-role key, then purges
 * the worker's edge cache so the new script serves immediately.
 *
 * Run (service-role key never committed — pass it at call time):
 *   SUPABASE_SERVICE_ROLE_KEY=sb_secret_… npx tsx scripts/upload-bridge.ts videasy
 *   SUPABASE_SERVICE_ROLE_KEY=…            npx tsx scripts/upload-bridge.ts all
 *   npx tsx scripts/upload-bridge.ts videasy --dry-run   # compile+validate only
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { LEGACY_VIDEASY_BRIDGE, LEGACY_VIDEASY_ID } from "../src/scripts/legacy-videasy";

/**
 * providerId → the FULL injection script to serve.
 *
 * Phase-6 Option 1: we ship the PROVEN legacy BRIDGE_JS verbatim (zero behaviour
 * change; only delivery moves OTA). The clean universal-core + <provider>.delta
 * split stays in the repo as the future refactor target — when a provider is
 * ported, its entry becomes `UNIVERSAL_CORE + "\\n" + <delta>`.
 */
const SCRIPTS: Record<string, string> = {
  [LEGACY_VIDEASY_ID]: LEGACY_VIDEASY_BRIDGE,
};

const ROOT = resolve(__dirname, "..");

function envFromDotLocal(key: string): string | undefined {
  try {
    const txt = readFileSync(resolve(ROOT, ".env.local"), "utf8");
    const m = txt.match(new RegExp(`^${key}=(.*)$`, "m"));
    return m ? m[1].trim().replace(/^["']|["']$/g, "") : undefined;
  } catch {
    return undefined;
  }
}

function fail(msg: string): never {
  console.error(`✖ ${msg}`);
  process.exit(1);
}

function buildAndValidate(id: string): { script: string; version: string } {
  const script = SCRIPTS[id];
  if (!script) fail(`No script registered for "${id}". Known: ${Object.keys(SCRIPTS).join(", ")}`);
  // THE GATE: must parse as valid JS, or it never leaves this machine.
  try {
    // eslint-disable-next-line no-new-func
    new Function(script);
  } catch (e) {
    fail(`${id}: injection script FAILED to parse — not uploading. ${(e as Error).message}`);
  }
  const hash = createHash("sha256").update(script).digest("hex").slice(0, 8);
  return { script, version: `${id}@${hash}` };
}

async function upload(id: string, url: string, key: string): Promise<void> {
  const { script, version } = buildAndValidate(id);
  const res = await fetch(`${url}/rest/v1/providers?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({ bridge_script: script, script_version: version }),
  });
  if (!res.ok) fail(`${id}: Supabase PATCH ${res.status} — ${await res.text()}`);
  console.log(`✔ ${id}: uploaded ${version} (${script.length} bytes)`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const target = args.find((a) => !a.startsWith("-"));
  if (!target) fail("Usage: upload-bridge.ts <providerId|all> [--dry-run]");

  const ids = target === "all" ? Object.keys(SCRIPTS) : [target];

  if (dryRun) {
    for (const id of ids) {
      const { version, script } = buildAndValidate(id);
      console.log(`✔ ${id}: compiles + parses → ${version} (${script.length} bytes) [dry-run]`);
    }
    return;
  }

  const url = process.env.SUPABASE_URL || envFromDotLocal("EXPO_PUBLIC_SUPABASE_URL");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) fail("Missing Supabase URL (SUPABASE_URL env or EXPO_PUBLIC_SUPABASE_URL in .env.local).");
  if (!key) fail("Missing SUPABASE_SERVICE_ROLE_KEY (service-role — bypasses RLS). Pass it at call time.");

  for (const id of ids) await upload(id, url, key);

  // Purge the worker edge cache so the new script serves immediately.
  const worker = process.env.EXPO_PUBLIC_WORKER_URL || envFromDotLocal("EXPO_PUBLIC_WORKER_URL");
  if (worker) {
    // /cache/purge is now gated by a shared secret (worker H1). Send it if we have
    // one; without it the purge just 401s and scripts still propagate within ~60s.
    const purgeToken = process.env.PURGE_TOKEN || envFromDotLocal("PURGE_TOKEN");
    try {
      const res = await fetch(`${worker.replace(/\/$/, "")}/cache/purge`, {
        method: "POST",
        headers: purgeToken ? { "x-purge-token": purgeToken } : undefined,
      });
      if (res.ok) console.log("✔ purged worker cache");
      else console.warn(`⚠ purge returned ${res.status} — set PURGE_TOKEN; scripts propagate within ~60s`);
    } catch {
      console.warn("⚠ could not purge worker cache — new scripts propagate within ~60s");
    }
  }
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)));
