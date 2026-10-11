// Bearoom Open Movies: a fixed list of Blender Foundation open films (CC BY) on publisher-hosted public test streams.
// Not a scraper. It confirms the title through TMDB (through the host's proxy) and checks each stream answers.
const TOS_SUBS = "https://download.blender.org/demo/movies/ToS/subtitles/";
const FILMS = {
  10378: {
    title: "Big Buck Bunny",
    streams: [{ label: "HLS", quality: "720p", url: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8" }],
  },
  133701: {
    title: "Tears of Steel",
    streams: [
      { label: "HLS", quality: "1080p", url: "https://test-streams.mux.dev/tos_ismc/main.m3u8" },
      {
        label: "MOV",
        quality: "720p",
        url: "https://download.blender.org/demo/movies/ToS/tears_of_steel_720p.mov",
        subtitles: [
          { url: TOS_SUBS + "TOS-en.srt", lang: "en", label: "English" },
          { url: TOS_SUBS + "TOS-de.srt", lang: "de", label: "German" },
          { url: TOS_SUBS + "TOS-es.srt", lang: "es", label: "Spanish" },
          { url: TOS_SUBS + "TOS-fr-orig.srt", lang: "fr", label: "French" },
          { url: TOS_SUBS + "TOS-it.srt", lang: "it", label: "Italian" },
          { url: TOS_SUBS + "TOS-ru.srt", lang: "ru", label: "Russian" },
        ],
      },
    ],
  },
  45745: {
    title: "Sintel",
    streams: [{ label: "DASH", quality: "1080p", url: "https://storage.googleapis.com/shaka-demo-assets/sintel/dash.mpd" }],
  },
};

async function getStreams(tmdbId, mediaType) {
  const film = mediaType === "movie" ? FILMS[Number(tmdbId)] : undefined;
  if (!film) return [];
  const meta = await fetch("https://api.themoviedb.org/3/movie/" + tmdbId + "?api_key=" + TMDB_API_KEY)
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
  if (!meta || meta.id !== Number(tmdbId)) return [];
  const out = [];
  for (const s of film.streams) {
    const res = await fetch(s.url, { headers: { Range: "bytes=0-1023" } }).catch(() => null);
    if (!res || (res.status !== 200 && res.status !== 206)) continue;
    out.push({
      name: "Open Movies • " + s.label,
      title: film.title + " · " + s.quality,
      url: s.url,
      quality: s.quality,
      language: "en",
      headers: {},
      subtitles: s.subtitles || [],
    });
  }
  return out;
}

module.exports = { getStreams };
