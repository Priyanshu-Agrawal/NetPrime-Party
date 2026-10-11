/** What the sandbox page is built from — shared by scripts/build-sandbox.mjs and the freshness test. */
const { createHash } = require("crypto");
const { readFileSync } = require("fs");
const { join } = require("path");

const ROOT = join(__dirname, "..");
const SANDBOX_DIR = join(ROOT, "services/plugins/sandbox");
const INPUTS = ["protocol.ts", "workerCore.ts", "workerEntry.ts", "documentEntry.ts"];
const CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline' 'unsafe-eval' blob:",
  "worker-src blob:",
  "child-src blob:",
  "connect-src 'none'",
  "img-src 'none'",
  "style-src 'none'",
  "font-src 'none'",
  "media-src 'none'",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

function inputHash() {
  const h = createHash("sha256");
  for (const f of INPUTS) h.update(f).update("\0").update(readFileSync(join(SANDBOX_DIR, f))).update("\0");
  for (const p of ["cheerio", "crypto-js", "esbuild"]) {
    h.update(`${p}@${require(join(ROOT, "node_modules", p, "package.json")).version}\0`);
  }
  h.update(CSP).update("\0").update(readFileSync(join(ROOT, "scripts/build-sandbox.mjs")));
  return h.digest("hex");
}

module.exports = { ROOT, SANDBOX_DIR, INPUTS, CSP, inputHash };
