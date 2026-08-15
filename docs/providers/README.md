# Providers

> How Bearoom models streaming providers, how per-provider injection works, and
> how to investigate/document a new one. See
> [../architecture/player-and-injection.md](../architecture/player-and-injection.md) for the shared bridge.

## What a provider is
A provider is a third-party **embed page** we load in a WebView. The catalog +
per-provider hijack tuning come from two places, merged at load:
- **`providers.json`** — **bundled locally**, imported directly by `providerRegistry.ts` (`import providersData from "@/providers.json"`). Each entry: `{ id, name, urls:{movie,tv}, allowedDomain }`. (14 providers.) ⚠ the old remote `GITHUB_RAW_JSON_URL`/`listProviders` fetch (in the now-renamed `streamResolver.old.ts`) was **removed** — the live catalog is this bundled file.
- **`components/player/hijackCapabilities.ts`** — the `HIJACK_CAPS` overlay: `{ supported, videoLocation?: "top"|"same-origin-iframe", navHosts?, autoplayParam?, unstable?, notes? }`.
- Merged into `PROVIDERS` by `components/player/providerRegistry.ts` (`getProvider`, `isHijackable`, `providerHosts`, `isAllowedTopNav`, `defaultHijackProvider`).

**Hijackable** (`hijack.supported`, can host a watch party): `vidfast, vixsrc,
vidlink, videasy, vidcore, mycineby, vidphantom, vidnest, 111movies`. Non-hijackable
(e.g. `vidsrcTo`, `multiembed`) have the video in a **cross-origin iframe** → the
bridge can't reach it.

## Two `buildEmbedUrl`s — don't cross them
- `providerRegistry.buildEmbedUrl(provider, mediaRef, {party?})` — used by the LIVE players (`HijackPlayer` with `{party:true}`, solo `player.tsx` with none). Appends `hijack.autoplayParam` in party mode + `startAt`.
- `streamResolver.old.buildEmbedUrl({id,type,season,ep,provider})` — the renamed-old resolver-path variant (build-excluded reference scaffolding). Different signature.

Both special-case **videasy TV** with `?nextEpisode=true&autoplayNextEpisode=true&episodeSelector=true`.

## Injection is PER-PROVIDER
The bridge mechanism (`BRIDGE_JS` in `HijackPlayer.tsx`: find `<video>`, event
relay, `__vlCmd`, echo-suppression, popup-block, a `__addSt` CSS hook) is shared.
But **DOM selectors + layout fixes are specific to each provider's player**, so
CSS/JS tweaks live behind per-provider conditions and must be documented per
provider. Example: videasy needs the `div.absolute.bottom-0.h-44 { height:auto }`
CSS in short viewports (see [videasy.md](./videasy.md)); other providers will need
their own.

> `videoLocation` tells you if the bridge can even reach the video: `"top"` =
> top-frame hooks + `document.querySelector('video')` work (videasy); a
> cross-origin iframe = invisible (bridge fails, sniff times out).

## Investigating a new provider (the CDP workflow)
Dev builds expose the WebView to Chrome DevTools. Connect over CDP via adb (see
the injection doc) and, on-device:
1. **Video location**: `document.querySelector('video')` in the top frame? If null, it's in an iframe — check `document.getElementsByTagName('iframe')` and origins.
2. **Controls DOM**: `elementsFromPoint(x,y)` over each control button to find its class + any overlay stealing taps (this is how the videasy bottom-bar bug was found).
3. **Settings/quality/subs/dubs**: open the gear, read the option rows' text (some providers hide dubs under "Servers", like videasy).
4. **Stream**: hook `window.fetch` + `XMLHttpRequest.prototype.open`, trigger play, read the caught `.m3u8`/segment URLs; `curl` them from the host to test whether they need headers (Referer/Origin) or are token-in-URL.
5. Record findings in `docs/providers/<id>.md` using the template below.

## Provider doc template (`docs/providers/<id>.md`)
```
# Provider: <id>  (providers.json name: "<name>")
## Identity          — embed host, URL patterns, hijackCapabilities entry, videoLocation
## Player DOM        — control classes, overlays, settings tabs; any layout bug + the injected fix
## Settings          — what Quality/Subs/Servers/Speed actually do (dubs? sources?)
## The stream        — container (HLS/DASH/mp4), playlist+segment hosts, headers required?, token lifetime
## Sniffing          — does a top-frame fetch/XHR hook catch the m3u8? gesture/autoplay quirks
## Open items        — unknowns, risks
```

## Status
- **videasy** ("NetPrime") — fully documented: [videasy.md](./videasy.md).
- Others (vidfast/vixsrc/vidlink/vidcore/…) — not yet reverse-engineered; add docs as you touch them.
