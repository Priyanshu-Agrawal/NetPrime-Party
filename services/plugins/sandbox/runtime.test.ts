import { SANDBOX_HTML, SANDBOX_INPUT_HASH } from "./runtime.generated";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { CSP, inputHash } = require("../../../scripts/sandbox-inputs.js") as { CSP: string; inputHash(): string };

describe("sandbox page", () => {
  it("is built from the current sources (run: npm run build:sandbox)", () => {
    expect(SANDBOX_INPUT_HASH).toBe(inputHash());
  });

  it("forbids all direct network and carries the bundled libraries", () => {
    expect(CSP).toContain("connect-src 'none'");
    expect(CSP).toContain("default-src 'none'");
    expect(SANDBOX_HTML).toContain(`content="${CSP}"`);
    expect(SANDBOX_HTML.length).toBeGreaterThan(100_000); // cheerio + crypto-js are inside
    expect(SANDBOX_HTML.length).toBeLessThan(1_000_000);
  });
});
