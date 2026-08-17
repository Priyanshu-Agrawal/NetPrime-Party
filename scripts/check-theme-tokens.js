#!/usr/bin/env node
/**
 * CI guard: ban raw hex/rgba in feature code — colors belong in theme/ only.
 * Usage: node scripts/check-theme-tokens.js
 */
const { execSync } = require("child_process");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const ALLOWED = /^theme\//;

try {
  const out = execSync(
    `rg -n --glob '*.{ts,tsx}' --glob '!theme/**' --glob '!**/*.old.tsx' '#[0-9a-fA-F]{3,8}|rgba\\(' ${ROOT}`,
    { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 },
  );
  const lines = out.trim().split("\n").filter(Boolean);
  if (lines.length) {
    console.error("Hardcoded colors found outside theme/:\n");
    console.error(lines.join("\n"));
    process.exit(1);
  }
} catch (e) {
  if (e.status === 1 && !e.stdout) {
    // rg exit 1 = no matches — success
    console.log("OK: no hardcoded hex/rgba outside theme/");
    process.exit(0);
  }
  throw e;
}

console.log("OK: no hardcoded hex/rgba outside theme/");
