/**
 * Rich TMDB detail fetching. One request pulls a huge amount of open data via
 * `append_to_response` (cast, crew, trailers, images, certifications, keywords,
 * reviews, external ids, watch providers, recommendations) — no extra API key
 * beyond the app's existing TMDB proxy token.
 */
import { API_HEADERS, API_URL } from "@/contexts/movieContext/movieContext";

const IMG_BASE = "https://image.tmdb.org/t/p/";
export function img(path?: string | null, size = "w500"): string | null {
  return path ? `${IMG_BASE}${size}${path}` : null;
}

const MOVIE_APPEND = [
  "credits",
  "videos",
  "images",
  "recommendations",
  "similar",
  "reviews",
  "keywords",
  "external_ids",
  "release_dates",
  "watch/providers",
].join(",");

const TV_APPEND = [
  "aggregate_credits",
  "credits",
  "videos",
  "images",
  "recommendations",
  "similar",
  "reviews",
  "keywords",
  "external_ids",
  "content_ratings",
  "watch/providers",
].join(",");

export async function fetchDetails(
  type: "movie" | "tv",
  id: string,
): Promise<any> {
  const append = type === "tv" ? TV_APPEND : MOVIE_APPEND;
  const url = `${API_URL}${type}/${id}?language=en-US&append_to_response=${append}&include_image_language=en,null`;
  const res = await fetch(url, { headers: API_HEADERS });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.status_message || `HTTP ${res.status}`);
  }
  return res.json();
}

// --- extractors -----------------------------------------------------------

export interface Trailer {
  key: string;
  name: string;
  site: string;
}
/** Best YouTube trailer (prefers official Trailer > Teaser > Clip). */
export function pickTrailer(data: any): Trailer | null {
  const vids: any[] = data?.videos?.results ?? [];
  const yt = vids.filter((v) => v.site === "YouTube");
  const rank = (t: string) =>
    t === "Trailer" ? 0 : t === "Teaser" ? 1 : t === "Clip" ? 2 : 3;
  const sorted = [...yt].sort((a, b) => {
    if (!!b.official !== !!a.official) return b.official ? 1 : -1;
    return rank(a.type) - rank(b.type);
  });
  const v = sorted[0];
  return v ? { key: v.key, name: v.name, site: v.site } : null;
}

/** US content certification (movie release_dates / tv content_ratings). */
export function pickCertification(data: any, type: "movie" | "tv"): string {
  if (type === "movie") {
    const rows: any[] = data?.release_dates?.results ?? [];
    const us = rows.find((r) => r.iso_3166_1 === "US") ?? rows[0];
    const cert = us?.release_dates?.find((d: any) => d.certification)?.certification;
    return cert || "";
  }
  const rows: any[] = data?.content_ratings?.results ?? [];
  const us = rows.find((r) => r.iso_3166_1 === "US") ?? rows[0];
  return us?.rating || "";
}

export interface Person {
  id: number;
  name: string;
  role: string; // character or job
  profile: string | null;
}
export function topCast(data: any, n = 16): Person[] {
  // TV aggregate_credits packs roles differently than movie credits.
  const cast: any[] = data?.credits?.cast ?? data?.aggregate_credits?.cast ?? [];
  return cast.slice(0, n).map((c) => ({
    id: c.id,
    name: c.name,
    role: c.character || c.roles?.[0]?.character || "",
    profile: img(c.profile_path, "w185"),
  }));
}

/** Key crew (directors/creators + writers), de-duplicated. */
export function keyCrew(data: any, type: "movie" | "tv"): Person[] {
  const out: Person[] = [];
  const seen = new Set<string>();
  const push = (name: string, role: string, id: number, profile?: string | null) => {
    const k = `${name}:${role}`;
    if (!name || seen.has(k)) return;
    seen.add(k);
    out.push({ id, name, role, profile: img(profile, "w185") });
  };
  if (type === "tv") {
    (data?.created_by ?? []).forEach((p: any) =>
      push(p.name, "Creator", p.id, p.profile_path),
    );
  }
  const crew: any[] = data?.credits?.crew ?? [];
  crew
    .filter((c) => c.job === "Director")
    .forEach((c) => push(c.name, "Director", c.id, c.profile_path));
  crew
    .filter((c) => ["Writer", "Screenplay", "Story"].includes(c.job))
    .forEach((c) => push(c.name, c.job, c.id, c.profile_path));
  return out.slice(0, 10);
}

export interface WatchProviders {
  region: string;
  flatrate: { id: number; name: string; logo: string | null }[];
  rent: { id: number; name: string; logo: string | null }[];
  buy: { id: number; name: string; logo: string | null }[];
  link: string | null;
}
/** JustWatch-sourced "where to watch", preferring the given region then US. */
export function pickProviders(
  data: any,
  regions = ["IN", "US", "GB"],
): WatchProviders | null {
  const results = data?.["watch/providers"]?.results ?? {};
  const region =
    regions.find((r) => results[r]) ?? Object.keys(results)[0] ?? null;
  if (!region) return null;
  const r = results[region];
  const map = (arr: any[] = []) =>
    arr.map((p) => ({
      id: p.provider_id,
      name: p.provider_name,
      logo: img(p.logo_path, "w92"),
    }));
  return {
    region,
    flatrate: map(r.flatrate),
    rent: map(r.rent),
    buy: map(r.buy),
    link: r.link ?? null,
  };
}

export function money(n?: number): string {
  if (!n || n <= 0) return "—";
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  return `$${n.toLocaleString()}`;
}

export function runtimeStr(min?: number): string {
  if (!min || min <= 0) return "";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}

export interface ExternalLink {
  label: string;
  url: string;
}
export function externalLinks(data: any): ExternalLink[] {
  const ext = data?.external_ids ?? {};
  const links: ExternalLink[] = [];
  if (ext.imdb_id) links.push({ label: "IMDb", url: `https://www.imdb.com/title/${ext.imdb_id}` });
  if (data.homepage) links.push({ label: "Website", url: data.homepage });
  if (ext.instagram_id) links.push({ label: "Instagram", url: `https://instagram.com/${ext.instagram_id}` });
  if (ext.twitter_id) links.push({ label: "X / Twitter", url: `https://twitter.com/${ext.twitter_id}` });
  if (ext.facebook_id) links.push({ label: "Facebook", url: `https://facebook.com/${ext.facebook_id}` });
  return links;
}

export function keywords(data: any): string[] {
  const k = data?.keywords?.keywords ?? data?.keywords?.results ?? [];
  return k.map((x: any) => x.name).slice(0, 20);
}
