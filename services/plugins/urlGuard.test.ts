import { checkUrl, cleanHeaders, withoutHeader } from "./urlGuard";

describe("checkUrl", () => {
  it.each(["https://example.com/a?b=1", "http://cdn.example.co.uk:8443/x", "https://8.8.8.8/", "https://[2606:4700::1111]/"])(
    "allows %s",
    (u) => expect(checkUrl(u).ok).toBe(true),
  );

  it.each([
    ["file:///etc/hosts", "scheme"],
    ["javascript:alert(1)", "scheme"],
    ["ftp://x.com/", "scheme"],
    ["not a url", "scheme"],
    ["https://user:pw@example.com/", "credentials"],
    ["http://localhost:8081/", "host"],
    ["http://127.0.0.1/", "host"],
    ["http://2130706433/", "host"],
    ["http://10.1.2.3/", "host"],
    ["http://192.168.1.1/", "host"],
    ["http://172.20.0.1/", "host"],
    ["http://169.254.169.254/latest/meta-data", "host"],
    ["http://100.64.0.1/", "host"],
    ["http://0.0.0.0/", "host"],
    ["http://[::1]/", "host"],
    ["http://[fd00::1]/", "host"],
    ["http://[::ffff:127.0.0.1]/", "host"],
    ["http://printer.local/", "host"],
    ["http://router/", "host"],
    ["http://metadata.google.internal/", "host"],
  ])("refuses %s (%s)", (u, reason) => expect(checkUrl(u)).toEqual({ ok: false, reason }));
});

describe("cleanHeaders", () => {
  it("keeps ordinary headers and drops the ones the HTTP client owns", () => {
    expect(
      cleanHeaders({ Referer: "https://a.test/", "User-Agent": "UA", Host: "evil", "Accept-Encoding": "br", "Content-Length": "9", Connection: "close" }),
    ).toEqual({ Referer: "https://a.test/", "User-Agent": "UA" });
  });

  it("drops header-injection attempts and names that are not tokens", () => {
    expect(cleanHeaders({ "X-A": "1\r\nX-B: 2", "Bad Name": "x", "X-C": "ok", "X-N": 5 })).toEqual({ "X-C": "ok", "X-N": "5" });
  });

  it("tolerates junk", () => {
    expect(cleanHeaders(null)).toEqual({});
    expect(cleanHeaders("x")).toEqual({});
  });

  it("withoutHeader ignores case", () => {
    expect(withoutHeader({ Cookie: "a", "X-Y": "b" }, "cookie")).toEqual({ "X-Y": "b" });
  });
});
