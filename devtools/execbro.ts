/**
 * Dev-only ExecBro SDK wiring.
 *
 * The ExecBro MCP server (mcp__execbro__*) normally reads the app over Chrome
 * DevTools Protocol, which is only partial on the New Architecture / Bridgeless
 * runtime this app uses. `execbro-sdk` patches `fetch` + `console` into an
 * in-app ring buffer that the MCP server auto-detects ("the SDK buffer if
 * installed"), unlocking full request/response bodies (Supabase, TMDB, KLIPY,
 * the @movie-web/providers scrapers) and startup logs.
 *
 * Everything is behind `__DEV__` and `execbro-sdk` is a devDependency, so this
 * module dead-code-eliminates to nothing in production bundles. It is imported
 * FIRST from app/_layout.tsx so capture starts before any other module fetches.
 * The SDK exposes live refs on globalThis.__RN_AI_DEVTOOLS__ for execute_in_app.
 */
if (__DEV__) {
  try {
    // require (not a top-level import) so Metro strips it entirely when __DEV__ is false.
    const { init } = require("execbro-sdk") as typeof import("execbro-sdk");
    init({ maxNetworkEntries: 500, maxConsoleEntries: 500 });
  } catch (e) {
    // A dev tool must never break the app — swallow if the devDep is absent.
    console.warn("[execbro-sdk] init skipped:", String(e));
  }
}

export {};
