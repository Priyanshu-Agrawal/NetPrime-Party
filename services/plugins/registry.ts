import type { PluginRepoRow } from "@/src/types/worker.types";
import type { PluginStore } from "./store";

/**
 * Installs operator-listed plugin repos (spec §5.4): every file is downloaded once per content hash and checked
 * against the sha256 /config pins; the repo's pointer moves only when the whole new version checked out, so a bad
 * update leaves the last good version running (spec §7 F10). A plugin runs only from a file the operator pinned.
 */
export type Download = (url: string) => Promise<{ status: number; body: string; sha256: string }>;

export interface InstalledRepo {
  id: string;
  version: number;
  manifestUrl: string;
  /** path → sha256 */
  files: Record<string, string>;
}

export type RepoState = "ok" | "degraded" | "failed" | "down";

export interface RepoStatus {
  id: string;
  state: RepoState;
  /** The version that runs (last good), or null when none ever installed. */
  version: number | null;
  wanted: number;
  detail?: string;
}

export interface LoadedPlugin {
  /** `${repoId}/${pluginId}@${sha8}` — changes with the code, so a new version is loaded afresh. */
  key: string;
  repoId: string;
  pluginId: string;
  name: string;
  source: string;
  supportedTypes: ("movie" | "tv")[];
  contentLanguage: string[];
}

interface ManifestEntry {
  id: string;
  name?: unknown;
  filename: string;
  supportedTypes?: unknown;
  enabled?: unknown;
  contentLanguage?: unknown;
}

const MAX_FILE_CHARS = 4 * 1024 * 1024;
const repoKey = (id: string) => `repo:${id}`;
const blobKey = (sha: string) => `blob:${sha}`;
const pathOf = (url: string) => url.split(/[?#]/)[0];

export function manifestPath(manifestUrl: string): string {
  const p = pathOf(manifestUrl);
  return p.slice(p.lastIndexOf("/") + 1);
}

function baseOf(manifestUrl: string): string {
  const p = pathOf(manifestUrl);
  return p.slice(0, p.lastIndexOf("/") + 1);
}

/** A repo file's URL, or null when the path would leave the repo's folder. */
export function fileUrl(manifestUrl: string, path: string): string | null {
  const base = baseOf(manifestUrl);
  try {
    const u = new URL(path, base).toString();
    return u.startsWith(base) ? u : null;
  } catch {
    return null;
  }
}

export function readInstalled(store: PluginStore, id: string): InstalledRepo | null {
  try {
    const raw = store.get(repoKey(id));
    return raw ? (JSON.parse(raw) as InstalledRepo) : null;
  } catch {
    return null;
  }
}

function parseManifest(raw: string | undefined): ManifestEntry[] | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as { scrapers?: unknown };
    if (!Array.isArray(v.scrapers)) return null;
    return v.scrapers.filter(
      (s): s is ManifestEntry => !!s && typeof (s as ManifestEntry).id === "string" && typeof (s as ManifestEntry).filename === "string",
    );
  } catch {
    return null;
  }
}

function sameFiles(installed: Record<string, string>, wanted: { path: string; sha256: string }[]): boolean {
  return Object.keys(installed).length === wanted.length && wanted.every((f) => installed[f.path] === f.sha256);
}

export async function installRepo(repo: PluginRepoRow, store: PluginStore, download: Download): Promise<RepoStatus> {
  const current = readInstalled(store, repo.id);
  const base = { id: repo.id, wanted: repo.version };
  if (repo.down) return { ...base, state: "down", version: current?.version ?? null };
  if (current && current.version === repo.version && sameFiles(current.files, repo.files)) {
    return { ...base, state: "ok", version: current.version };
  }
  try {
    const manifestFile = repo.files.find((f) => f.path === manifestPath(repo.manifestUrl));
    if (!manifestFile) throw new Error("manifest not pinned");
    for (const f of repo.files) {
      if (store.has(blobKey(f.sha256))) continue; // a blob is only ever written after its hash checked out
      const url = fileUrl(repo.manifestUrl, f.path);
      if (!url) throw new Error(`${f.path} is outside the repo`);
      const res = await download(url);
      if (res.status !== 200) throw new Error(`HTTP ${res.status} for ${f.path}`);
      if (res.sha256 !== f.sha256) throw new Error(`hash mismatch for ${f.path}`);
      if (res.body.length > MAX_FILE_CHARS) throw new Error(`${f.path} is too large`);
      store.set(blobKey(f.sha256), res.body);
    }
    if (!parseManifest(store.get(blobKey(manifestFile.sha256)))) throw new Error("manifest unreadable");
    const next: InstalledRepo = {
      id: repo.id,
      version: repo.version,
      manifestUrl: repo.manifestUrl,
      files: Object.fromEntries(repo.files.map((f) => [f.path, f.sha256])),
    };
    store.set(repoKey(repo.id), JSON.stringify(next));
    return { ...base, state: "ok", version: repo.version };
  } catch (e) {
    return { ...base, state: current ? "degraded" : "failed", version: current?.version ?? null, detail: (e as Error).message };
  }
}

function typesOf(v: unknown): ("movie" | "tv")[] {
  const out = Array.isArray(v) ? v.filter((t): t is "movie" | "tv" => t === "movie" || t === "tv") : [];
  return out.length ? out : ["movie", "tv"];
}

/** The plugins this row allows from the repo's installed (last good) version. */
export function loadPlugins(repo: PluginRepoRow, store: PluginStore): LoadedPlugin[] {
  if (repo.down) return [];
  const inst = readInstalled(store, repo.id);
  if (!inst) return [];
  const manifestSha = inst.files[manifestPath(inst.manifestUrl)];
  const entries = manifestSha ? parseManifest(store.get(blobKey(manifestSha))) : null;
  if (!entries) return [];
  const base = baseOf(inst.manifestUrl);
  const out: LoadedPlugin[] = [];
  for (const s of entries) {
    if (s.enabled === false) continue;
    if (repo.allowPlugins && !repo.allowPlugins.includes(s.id)) continue;
    const url = fileUrl(inst.manifestUrl, s.filename);
    const sha = url ? inst.files[url.slice(base.length)] : undefined;
    if (!sha) continue; // in the manifest but not pinned by the operator: never runs
    const source = store.get(blobKey(sha));
    if (source == null) continue;
    out.push({
      key: `${repo.id}/${s.id}@${sha.slice(0, 8)}`,
      repoId: repo.id,
      pluginId: s.id,
      name: typeof s.name === "string" && s.name ? s.name : s.id,
      source,
      supportedTypes: typesOf(s.supportedTypes),
      contentLanguage: Array.isArray(s.contentLanguage) ? s.contentLanguage.filter((l): l is string => typeof l === "string") : [],
    });
  }
  return out;
}

/** Forget repos /config no longer lists and every blob no installed repo points at. */
export function collectGarbage(store: PluginStore, keepRepoIds: string[]): void {
  const keep = new Set(keepRepoIds);
  const live = new Set<string>();
  for (const k of store.keys()) {
    if (!k.startsWith("repo:")) continue;
    const id = k.slice("repo:".length);
    if (!keep.has(id)) {
      store.remove(k);
      continue;
    }
    const inst = readInstalled(store, id);
    if (inst) Object.values(inst.files).forEach((sha) => live.add(sha));
  }
  for (const k of store.keys()) if (k.startsWith("blob:") && !live.has(k.slice("blob:".length))) store.remove(k);
}
