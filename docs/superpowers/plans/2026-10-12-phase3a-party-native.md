# Phase 3A — Watch Party on the Native Player Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A title playing in Bearoom's native player can become a watch party. The room plays the host's stream on every member's native player, stays in sync, and handles a guest who can't use the host's link.

**Architecture:**
- **The room.** The room's current queue item is a `QueueRefPlugin` (`pluginId` = source id, `streamId` = candidate key, `language`). Migration 0008 already stores it, so there is no schema change.
- **Stream handoff.** The host sends the resolved `{url, headers, durationSec}` to members over the private party channel as an ephemeral `stream` broadcast. It is never stored and never logged.
- **Guests.** A guest plays the handed-over stream. If it fails, the guest re-resolves the same source and key on its own device, and accepts the result only if its length is within ±2.5 s of the host's.
- **Party screen.** It mounts a native room player when the current item is a plugin ref. The WebView party path is untouched.
- **Sync engine.** It reads player capabilities and gains the buffering protocol (spec §6.4), but only for players that declare `partySync`, so today's WebView rooms behave exactly as before.

**Tech Stack:** Expo SDK 57 / RN 0.86, expo-video, Supabase Realtime (private channels, RLS 0007), jest-expo.

**Spec:** `docs/superpowers/specs/2026-10-10-playback-languages-party-design.md` §6.4 (watch party), §5.2 (PlayerHandle v2 capabilities), §7 F11/F12, §9 row 3. **3A scope:**
- in: one room stream, the handoff, guest re-resolve with the ±2.5 s check, the capability-aware engine, the buffering protocol;
- 3B: scheduled transitions (`serverStartMs`, which needs an RPC change), the ready barrier and lobby, attributed toasts, per-member language, the share link, private by default.

## Global Constraints

- No schema change. 0008 already accepts and stores `QueueRefPlugin` verbatim. Anything needing an RPC or column change is 3B and goes to the owner for review first.
- Stream URLs and headers travel only in the ephemeral `stream` broadcast on `party:<code>`, a private channel gated by RLS 0007. They are never written to Postgres, route params, logs or `/report`.
- The WebView party (HijackPlayer) keeps today's behaviour. Engine changes apply only when the player's capabilities say `partySync: true`.
- No Reanimated `entering`/`exiting`/`layout`. No live blur or glow over video. Never touch `src/ui/BearAlert.tsx` or `.codex/`.
- Devices: the phone (`P2228K000422`) and the iOS 27 simulator (`A1518C83-…`); the Android emulator is not allowed.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Handoff hygiene.** Check that a URL can't reach:
   - `snap` broadcasts, the queue, route params, logs or `/report`;
   - a non-member (RLS);
   - a guest after the item changes (a stale handoff for an old item is ignored).
2. **Guest fallback.** The host's link fails on the guest:
   - re-resolving the same key on the guest finds nothing;
   - or it finds a different cut (more than ±2.5 s off).

   Either way the guest sees "This source won't play here", never a stuck spinner or a desynced film.
3. **Host stall vs guest stall.** A guest's long stall never pauses the room. A host stall over 3 s pauses it ("Waiting for host…") and resumes when the host recovers. A stall shorter than 3 s does nothing.
4. **Joining late.** A guest who joins mid-film gets the handoff (it asks, and the host answers) and lands at the live position.
5. **WebView rooms.** These are unchanged: the same bands, no buffering pause.

---

### Task 1: Protocol — the stream handoff and the plugin ref

**Files:**
- Modify: `services/party/protocol.ts`
- Test: `services/party/protocol.test.ts`

**Interfaces (produces):**
- `interface StreamHandoff { itemId: string; key: string; sourceId: string; url: string; headers: Record<string, string>; durationSec?: number; language?: string }`
- `parseStreamHandoff(raw: unknown): StreamHandoff | null`. It accepts only `https:` URLs, string header maps of at most 32 entries and 8 KB, URLs up to 4 KB, and a finite positive `durationSec`.
- `pluginRefFor(c: { sourceId: string; key: string; languages: string[] }, title: { tmdbId: string; type: "movie" | "tv"; season?: number; episode?: number }): QueueRefPlugin`
- `isPluginItem(item?: QueueItem | null): item is QueueItem & { ref: QueueRefPlugin }`

- [ ] **Failing tests:**
  - a valid handoff parses;
  - `http:`, a non-string header, an oversized URL and a negative duration are refused;
  - `pluginRefFor` maps source and key and takes the first language;
  - a snapshot built with a plugin item carries no `url` anywhere (JSON scan).
- [ ] Implement, run `npx jest services/party/protocol`, commit `feat(party): the stream handoff message and plugin queue refs`.

### Task 2: PartyClient — send and receive handoffs

**Files:**
- Modify: `services/party/PartyClient.ts`
- Test: `services/party/PartyClient.handoff.test.ts`, using a fake channel through the existing `broadcast.ts` seam

**Interfaces:**
- `client.sendStream(h: StreamHandoff): void`: host only; broadcasts `stream` on `party:<code>`.
- `client.requestStream(itemId: string): void`: broadcasts `stream-req`.
- `client.onStream(cb: (h: StreamHandoff) => void): () => void`: parses with `parseStreamHandoff` and drops invalid payloads silently.
- `client.onStreamRequest(cb: (itemId: string) => void): () => void`.
- Nothing is logged (no `console.*` with the payload).

- [ ] **Failing tests:**
  - `sendStream` broadcasts the parsed payload;
  - an invalid incoming payload never reaches `onStream`;
  - a request reaches `onStreamRequest`;
  - there's no `console` call carrying the URL (spy).
- [ ] Implement, test, commit `feat(party): hand the host's stream to members over the private channel`.

### Task 3: The guest's stream — use the host's, else re-resolve the same source

**Files:**
- Create: `src/features/party/roomStream.ts` (+ test)

**Interfaces:**
- `chooseGuestSource(handoff: StreamHandoff, relocate: () => Promise<PlaybackCandidate | null>): Promise<{ kind: "host"; source: NativeSource } | { kind: "local"; candidate: PlaybackCandidate } | { kind: "none"; reason: "not-found" | "different-cut" }>`
- `withinCut(a?: number, b?: number): boolean` (±2.5 s; unknown on either side → true).
- `relocateSame(handoff, resolve: (req, langs) => Promise<ResolveResult>, title)`: re-resolves and returns the candidate with the same key, else the same source id plus language, else null.

`chooseGuestSource` first returns the host's source. The caller calls `relocate` only after the host's stream fails on this device.

- [ ] **Failing tests:**
  - the first choice is the host source;
  - relocate finds the same key with a length within 2 s → local;
  - a length 30 s off → none/different-cut;
  - nothing found → none/not-found;
  - the same source and language is used when the key changed.
- [ ] Implement, test, commit `feat(party): a guest plays the host's stream, or finds the same one itself`.

### Task 4: Sync engine — capabilities and the buffering protocol

**Files:**
- Modify: `services/party/PartySyncEngine.ts`
- Test: `services/party/PartySyncEngine.test.ts` (new; fake clock, fake client and player)

**Interfaces:**
- `PlayerControl` gains `capabilities?(): { fractionalRate: boolean; partySync: boolean }`.
- The engine options gain `isHost(): boolean`, `onHostStall?(stalled: boolean): void`, `now?(): number`.
- **When `partySync` is true:**
  - a `buffering:true` event starts a 3 s timer;
  - if buffering still holds at 3 s on the host, call `onHostStall(true)` (the session pauses the room and shows "Waiting for host…"), and `onHostStall(false)` when it ends;
  - on a guest, nothing is sent, and when buffering ends the engine jumps to the live anchor + 1 s;
  - `fractionalRate: false` → no rate nudges and a 2 s seek dead-band.
- **When `partySync` is false or absent:** today's behaviour, byte for byte (pinned by a test that replays a WebView event sequence and expects the same calls as before the change).

- [ ] **Failing tests:**
  - host buffering for 2.9 s → no stall;
  - for 3.1 s → `onHostStall(true)`, then `false` on recovery;
  - a guest buffering for 10 s → no room action, then a seek to live + 1 s;
  - `fractionalRate:false` → `setRate` is never called and the seek dead-band is 2 s;
  - the WebView sequence is unchanged.
- [ ] Implement, test, commit `feat(party): the sync engine knows its player — buffering protocol for native rooms`.

### Task 5: The native room player

**Files:**
- Modify: `src/features/player/NativePlayerView.tsx`:
  - optional `handleRef?: React.Ref<PlayerHandle>`, which exposes the inner player;
  - optional `room?: { canControl: boolean; roomPlaying: boolean; onPlay(): void; onPause(): void; onSeekTo(s: number): void; onSeekBy(d: number): void; onTapSync(): void }`, which sends the controls to the room instead of the local player;
  - `partySync: true` in the capabilities when in a room.
- Create: `src/features/party/NativeRoomPlayer.tsx` (+ test). It takes the room's plugin item, the role, the handoff/relocate flow (Task 3) and the session's `playerRef`. It shows:
  - the loading card;
  - "This source won't play here — ask the host to pick another" (the F12 card);
  - the player.
- Test (mocked NativePlayerView):
  - the host mounts with its own candidate and sends a handoff once it is ready;
  - a guest mounts with the handoff;
  - a guest's player error → relocate → local;
  - none → the F12 card;
  - the room controls call the room actions.
- [ ] TDD per the above, then commit `feat(party): the native room player`.

### Task 6: Start a party from the native player; rooms play plugin items

**Files:**
- Modify:
  - `src/features/player/TitlePlayer.tsx` / `NativePlayerView.tsx`: a "Watch Party" button in the controls (the same chip as the web lane).
  - `src/navigation/actions.ts`: `openPartyHost` accepts a plugin ref.
  - `src/screens/PartyScreen.tsx`: when the current item is a plugin ref, render `NativeRoomPlayer` instead of the empty state. The WebView path is unchanged.
- Create: `src/features/party/pendingHostStream.ts`. This in-memory store lets the starting host's candidate reach the room screen without route params.
- **Host flow:**
  - "Watch Party" → a new room code;
  - `pendingHostStream.set(code, candidate)`;
  - open the party as host with no media;
  - once joined: `queueAdd(pluginRefFor(...))` → `queueSetCurrent(id)`.

  The host's `NativeRoomPlayer` takes the candidate from the store. If it's missing, after an app restart, the host re-resolves the key.
- **Guest flow:** they join by code/link; the room shows the plugin item and asks for the stream (`requestStream`).
- Test: `pendingHostStream` (set/take/expiry), plus a PartyScreen lane-selection unit (extract `roomLane(snap): "web" | "native" | "empty"` into a pure helper and test it).
- [ ] TDD, then commit `feat(party): a native title can become a watch party`.

### Task 7: Gate — phone and iOS simulator

- [ ] Build both release apps (`EXPO_PUBLIC_TEST_STREAMS=1`).
- [ ] **Phone (host).** Big Buck Bunny → Play (native) → Watch Party → room code.
- [ ] **iOS simulator (guest).** `bearoom://party/<code>` → joins and plays natively at the host's position.
- [ ] **Drift.** A dev-HUD readout of the engine's |offset| samples (p50/p95), watched for 10 minutes.
  - Target p95 ≤ 0.5 s (S5; the third device of the original gate, the emulator, isn't allowed).
- [ ] **Scenarios:**
  - host pause/seek/resume reach the guest;
  - the guest stalls (network link conditioner off/on, or a seek far ahead) and the room keeps playing;
  - the host stalls for more than 3 s (airplane mode for 5 s, restored at once) → the room pauses with "Waiting for host…", then resumes;
  - a guest with a broken handoff (dev toggle: corrupt the URL) re-resolves locally.
- [ ] Board section "Phase 3A — party on the native player", BACKLOG (3B items), memory. Commit `docs: Phase 3A gate`.
