import {
  asciiHead,
  base64ToBytes,
  isHls,
  isMatroska,
  isMp4,
  isoDuration,
  looksLikeHtml,
  mp4Duration,
  parseDash,
  parseHlsMaster,
  parseHlsMedia,
} from "./manifests";

const MASTER = `#EXTM3U
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud",NAME="Hindi",LANGUAGE="hin",URI="audio/hi.m3u8"
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud",NAME="English",LANGUAGE="en",DEFAULT=YES,URI="audio/en.m3u8"
#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="French",LANGUAGE="fr",URI="subs/fr.m3u8"
#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360,AUDIO="aud"
low/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080,AUDIO="aud"
https://cdn.example.net/high/index.m3u8
`;

const MEDIA = `#EXTM3U
#EXT-X-TARGETDURATION:10
#EXTINF:10.0,
seg0.jpg
#EXTINF:9.5,
seg1.jpg
#EXTINF:4.25,
seg2.jpg
#EXT-X-ENDLIST
`;

describe("HLS", () => {
  it("reads variants (relative URIs resolved) and audio rendition languages from a master", () => {
    expect(parseHlsMaster(MASTER, "https://a.example.net/x/master.m3u8")).toEqual({
      variants: [
        { url: "https://a.example.net/x/low/index.m3u8", height: 360, bandwidth: 800000 },
        { url: "https://cdn.example.net/high/index.m3u8", height: 1080, bandwidth: 5000000 },
      ],
      audioLanguages: ["hi", "en"],
    });
    expect(parseHlsMaster(MEDIA, "https://a.example.net/x/")).toBeNull();
  });

  it("sums a finished media playlist and finds its first segment", () => {
    expect(parseHlsMedia(MEDIA, "https://a.example.net/x/low/index.m3u8")).toEqual({
      durationSec: 23.75,
      firstSegment: "https://a.example.net/x/low/seg0.jpg",
      ended: true,
    });
  });

  it("gives no duration for a live playlist", () => {
    expect(parseHlsMedia(MEDIA.replace("#EXT-X-ENDLIST\n", ""), "https://a.example.net/").durationSec).toBeUndefined();
  });

  it("tells playlists from HTML", () => {
    expect(isHls("  #EXTM3U\n")).toBe(true);
    expect(isHls("<html>")).toBe(false);
    expect(looksLikeHtml("\n<!DOCTYPE html><html>")).toBe(true);
    expect(looksLikeHtml("<HTML><HEAD>")).toBe(true);
    expect(looksLikeHtml("#EXTM3U")).toBe(false);
  });
});

describe("DASH", () => {
  const MPD = `<?xml version="1.0"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" mediaPresentationDuration="PT1H2M3.5S" type="static">
  <Period>
    <AdaptationSet contentType="video" mimeType="video/mp4"></AdaptationSet>
    <AdaptationSet contentType="audio" lang="hi" mimeType="audio/mp4"></AdaptationSet>
    <AdaptationSet mimeType="audio/mp4" lang="eng"></AdaptationSet>
    <AdaptationSet contentType="text" lang="fr"></AdaptationSet>
  </Period>
</MPD>`;

  it("reads the duration and the audio languages", () => {
    expect(parseDash(MPD)).toEqual({ durationSec: 3723.5, audioLanguages: ["hi", "en"] });
    expect(parseDash("#EXTM3U")).toBeNull();
  });

  it.each([
    ["PT10M", 600],
    ["PT1H", 3600],
    ["PT0.5S", 0.5],
    ["P1DT1S", 86401],
    ["PT0S", undefined],
    ["garbage", undefined],
  ])("isoDuration(%s) = %s", (s, want) => expect(isoDuration(s)).toBe(want));
});

/** A box: 4-byte size, 4-byte type, payload. */
function box(type: string, payload: number[]): number[] {
  const size = 8 + payload.length;
  return [(size >>> 24) & 255, (size >>> 16) & 255, (size >>> 8) & 255, size & 255, ...[...type].map((ch) => ch.charCodeAt(0)), ...payload];
}
const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];

describe("MP4", () => {
  it("reads mvhd version 0 and version 1", () => {
    const v0 = box("mvhd", [0, 0, 0, 0, ...u32(0), ...u32(0), ...u32(1000), ...u32(596_000), ...new Array(80).fill(0)]);
    const v1 = box("mvhd", [1, 0, 0, 0, ...u32(0), ...u32(0), ...u32(0), ...u32(0), ...u32(600), ...u32(0), ...u32(600 * 734), ...new Array(80).fill(0)]);
    const ftyp = box("ftyp", [..."isom".split("").map((c) => c.charCodeAt(0)), 0, 0, 2, 0]);
    expect(mp4Duration(new Uint8Array([...ftyp, ...box("moov", v0)]))).toBe(596);
    expect(mp4Duration(new Uint8Array([...ftyp, ...box("moov", v1)]))).toBe(734);
    expect(isMp4(new Uint8Array(ftyp))).toBe(true);
    expect(mp4Duration(new Uint8Array(ftyp))).toBeUndefined();
  });

  it("spots Matroska and decodes base64", () => {
    expect(isMatroska(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0]))).toBe(true);
    expect(Array.from(base64ToBytes("AAEC"))).toEqual([0, 1, 2]);
    expect(asciiHead(new Uint8Array([60, 104, 116, 109, 108, 62]))).toBe("<html>");
  });
});
