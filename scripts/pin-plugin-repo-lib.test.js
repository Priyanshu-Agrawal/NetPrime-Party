const { safePath, sqlLiteral, upsertSql } = require("./pin-plugin-repo-lib");

const SHA = "a".repeat(64);
const row = (over = {}) => ({
  id: "open-movies",
  manifestUrl: "https://raw.githubusercontent.com/o/r/abc/plugin-repos/open-movies/manifest.json",
  version: 1,
  files: [{ path: "manifest.json", sha256: SHA }],
  ...over,
});

describe("pin-plugin-repo SQL", () => {
  it("builds a disabled upsert from a clean row", () => {
    const sql = upsertSql(row());
    expect(sql).toContain("values ('open-movies', 'https://raw.githubusercontent.com/o/r/abc/plugin-repos/open-movies/manifest.json', 1, '[");
    expect(sql).toContain("::jsonb, false)");
  });

  it("refuses a manifest file name that would break out of the SQL", () => {
    const evil = "x'::jsonb,false);drop/**/table/**/public.party_rooms;--.js";
    expect(safePath(evil)).toBe(false);
    expect(() => upsertSql(row({ files: [{ path: evil, sha256: SHA }] }))).toThrow(/refusing path/);
  });

  it.each([
    ["an id with a quote", { id: "a'b" }],
    ["a manifest URL with a quote", { manifestUrl: "https://h/'x.json" }],
    ["version 0", { version: 0 }],
    ["a short hash", { files: [{ path: "a.js", sha256: "abc" }] }],
    ["a path leaving the folder", { files: [{ path: "../a.js", sha256: SHA }] }],
  ])("refuses %s", (_, over) => expect(() => upsertSql(row(over))).toThrow());

  it("sqlLiteral doubles quotes", () => {
    expect(sqlLiteral("it's")).toBe("'it''s'");
  });
});
