// Pins a plugin repo for the operator's plugin_repos table (spec §5.4):
//   node scripts/pin-plugin-repo.mjs <https manifest URL> --id <repo-id> [--version <n>]
// Downloads the manifest and every enabled scraper file it names, hashes the exact bytes, and prints the row plus an
// upsert that leaves the repo DISABLED. Pin commit-addressed URLs (a commit SHA in the path), never a branch.
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";

const { safePath, upsertSql } = createRequire(import.meta.url)("./pin-plugin-repo-lib.js");

const [manifestUrl, ...rest] = process.argv.slice(2);
if (!manifestUrl?.startsWith("https://")) {
  console.error("usage: node scripts/pin-plugin-repo.mjs <https manifest URL> --id <repo-id> [--version <n>]");
  process.exit(1);
}
const opt = (name, fallback) => {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 ? rest[i + 1] : fallback;
};
const base = manifestUrl.slice(0, manifestUrl.lastIndexOf("/") + 1);
const sha = (buf) => createHash("sha256").update(buf).digest("hex");
async function get(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

const manifestBytes = await get(manifestUrl);
const manifest = JSON.parse(manifestBytes.toString("utf8"));
const files = [{ path: manifestUrl.slice(base.length), sha256: sha(manifestBytes) }];
const allowPlugins = [];
for (const s of manifest.scrapers ?? []) {
  if (s.enabled === false) continue;
  const url = new URL(s.filename, base).toString();
  const path = url.slice(base.length);
  if (!url.startsWith(base) || !safePath(path)) {
    console.error(`skipping ${s.id}: ${JSON.stringify(s.filename)} is outside the repo folder or not a plain path`);
    continue;
  }
  files.push({ path, sha256: sha(await get(url)) });
  allowPlugins.push(s.id);
}
const id = opt("id", "repo");
const version = Number(opt("version", "1"));
console.log(JSON.stringify({ id, manifestUrl, version, files, allowPlugins }, null, 2));
console.log(`\n-- Review, then run as the operator (the repo stays disabled until enabled on purpose):\n${upsertSql({ id, manifestUrl, version, files, allowPlugins })}`);
