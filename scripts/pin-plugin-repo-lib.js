/**
 * The SQL side of scripts/pin-plugin-repo.mjs, kept pure so it can be tested. A third-party manifest is untrusted:
 * every value that reaches SQL is checked against the same rules the worker applies (worker/src/pluginRepos.ts),
 * then quoted.
 */
const SAFE_PATH = /^(?!\/)(?!.*\.\.)[A-Za-z0-9._/-]{1,200}$/;
const SAFE_ID = /^[a-z0-9][a-z0-9-]{1,40}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const HTTPS_URL = /^https:\/\/[^\s'"\\]+$/;

function safePath(p) {
  return typeof p === "string" && SAFE_PATH.test(p);
}

function sqlLiteral(s) {
  return `'${String(s).replace(/'/g, "''")}'`;
}

function upsertSql({ id, manifestUrl, version, files }) {
  if (!SAFE_ID.test(id)) throw new Error(`refusing repo id ${JSON.stringify(id)}`);
  if (!HTTPS_URL.test(manifestUrl)) throw new Error(`refusing manifest URL ${JSON.stringify(manifestUrl)}`);
  if (!Number.isInteger(version) || version < 1) throw new Error(`refusing version ${JSON.stringify(version)}`);
  for (const f of files) {
    if (!safePath(f.path)) throw new Error(`refusing path ${JSON.stringify(f.path)}`);
    if (!SHA256.test(f.sha256)) throw new Error(`refusing hash for ${f.path}`);
  }
  return (
    `insert into public.plugin_repos (id, manifest_url, version, files, enabled)\n` +
    `values (${sqlLiteral(id)}, ${sqlLiteral(manifestUrl)}, ${version}, ${sqlLiteral(JSON.stringify(files))}::jsonb, false)\n` +
    `on conflict (id) do update set manifest_url = excluded.manifest_url, version = excluded.version, files = excluded.files, updated_at = now();`
  );
}

module.exports = { SAFE_PATH, safePath, sqlLiteral, upsertSql };
