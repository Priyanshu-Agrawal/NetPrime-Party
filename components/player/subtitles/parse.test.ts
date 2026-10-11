import { activeText, nextChange, parseSubtitles } from "./parse";

// First cues of Blender's Tears of Steel English subtitles (TOS-en.srt).
const SRT = "﻿1\r\n00:00:23,000 --> 00:00:24,500\r\nYou're a jerk, Thom.\r\n\r\n2\r\n00:00:25,000 --> 00:00:27,000\r\nLook Celia, we have to follow our passions;\r\n";

const VTT = `WEBVTT

NOTE a comment

STYLE
::cue { color: yellow }

intro
00:01.000 --> 00:02.500 align:start position:10%
<i>Hello</i> &amp; welcome

01:02:03.5 --> 01:02:04.000
Line one
Line two
`;

describe("parseSubtitles", () => {
  it("parses SRT (BOM, CRLF, comma milliseconds)", () => {
    expect(parseSubtitles(SRT)).toEqual([
      { start: 23, end: 24.5, text: "You're a jerk, Thom." },
      { start: 25, end: 27, text: "Look Celia, we have to follow our passions;" },
    ]);
  });

  it("parses WebVTT: skips NOTE/STYLE, drops cue settings and tags, decodes entities, keeps line breaks", () => {
    expect(parseSubtitles(VTT)).toEqual([
      { start: 1, end: 2.5, text: "Hello & welcome" },
      { start: 3723.5, end: 3724, text: "Line one\nLine two" },
    ]);
  });

  it("ignores garbage instead of throwing", () => {
    expect(parseSubtitles("<html>404 Not Found</html>")).toEqual([]);
    expect(parseSubtitles("1\n00:00:05,000 --> 00:00:04,000\nbackwards\n")).toEqual([]);
  });
});

describe("activeText / nextChange", () => {
  const cues = [
    { start: 1, end: 3, text: "a" },
    { start: 2, end: 4, text: "b" },
    { start: 6, end: 7, text: "c" },
  ];

  it("shows every cue on screen at t (start inclusive, end exclusive)", () => {
    expect(activeText(cues, 0.9)).toBeNull();
    expect(activeText(cues, 1)).toBe("a");
    expect(activeText(cues, 2.5)).toBe("a\nb");
    expect(activeText(cues, 3)).toBe("b");
    expect(activeText(cues, 4)).toBeNull();
  });

  it("finds the next moment the text can change", () => {
    expect(nextChange(cues, 0)).toBe(1);
    expect(nextChange(cues, 2.5)).toBe(3);
    expect(nextChange(cues, 4.5)).toBe(6);
    expect(nextChange(cues, 7)).toBeNull();
  });
});
