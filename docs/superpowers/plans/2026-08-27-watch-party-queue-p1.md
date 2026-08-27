# Watch-Party Queue — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the single-media watch party into a **host-authoritative queue** of TMDB items, played through today's HijackPlayer, with a medialess room, a floating now-playing tray, auto-next (episode + recommendation), and an episode selector in the party.

**Architecture:** The queue lives as `queue jsonb` + `current_item_id` columns on the existing `party_rooms` row; all mutations go through new `SECURITY DEFINER` Postgres RPCs (mirroring the existing host-gated `party_set_media`/`party_set_playback`), and fan out over the existing `party:<CODE>` Realtime **broadcast** via the extended `party_snapshot()`. The client gains `PartyClient` queue methods + `useParty` accessors; the player derives its current media from `currentItem ?? media` (back-compatible). No new player, no new transport — the queue rides the proven anchor/epoch/seq sync model.

**Tech Stack:** Expo SDK 53 / RN 0.79 / React 19 (New Arch, Bridgeless) · Redux Toolkit + RTK Query · Supabase (Postgres RPC authority + Realtime broadcast, RLS) · `react-native-webview` HijackPlayer · Reanimated 3 + gesture-handler 2 · `@gorhom/bottom-sheet`.

**Spec:** [docs/plans/watch-together-multi-source-queue.md](../../plans/watch-together-multi-source-queue.md) — §1 (queue-as-spine), §7 (party UX rebuild), §8 (host-authoritative sync), §11 (Phase 1), §12 (data model).

## Global Constraints

- **Commit ONLY on explicit "commit"** from the user. Commit messages end with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Keep commits tightly scoped (`git commit -- <paths>`).
- **No test runner exists** (no jest/vitest, zero test files). Verification gate = `npx tsc --noEmit` clean + `npm run lint` + **Supabase MCP** (`execute_sql`/`apply_migration`) to exercise RPCs + **execbro** device screenshots/redux-state + a **2-device realtime check** (the C1 verification model). Pure helpers are written as isolated pure functions with a documented node quick-check; introducing jest is out of scope for P1.
- **All party writes go through `SECURITY DEFINER` RPCs.** Tables are RLS **read-only to members**; reuse `public.party_is_member(text, uuid)` for read policies and never add insert/update/delete policies (privileges stay revoked from `anon, authenticated`).
- **Host gate (copy verbatim)** in every host-only queue RPC: `if v_room.host_id <> v_uid or v_room.lease_expires_at < now() then raise exception 'not host'; end if;`
- **Every mutation bumps `seq`** and re-broadcasts; clients apply newest-wins by `(epoch, seq)`. Queue advance reuses the `party_set_media` timeline-reset body (`play_status='paused', play_position_ms=0, play_anchor_at=now()`).
- **Migrations are hand-applied** via the Supabase SQL editor, numbered sequentially — next files are `0008_*`, `0009_*`. Apply them with the Supabase MCP `apply_migration` during dev.
- **Queue item shape = `PartyMedia`** (`services/party/protocol.ts:95`): movie `{ tmdbId, type:"movie", title?, providerId? }`, episode `{ tmdbId, type:"tv", season, episode, title?, providerId? }`. Artwork is NOT carried in the wire item — the player fetches the poster separately (as PartyScreen does today).
- **No blur / no elevation on any screen that plays video.** The tray floats over discovery (video-free — verified) so blur/elevation are safe there, but it MUST drop both if it ever renders while `Player`/`Party`/`MovieDetails`/`TvDetails` is focused (read the route via `navigationRef.getCurrentRoute()`).
- **`control_mode`** is stored as `config.controlMode: 'host' | 'poll'` (a jsonb key on the existing `config`, set via `party_set_config` — no DDL), default `'host'`. P1a–P1c implement host mode; poll voting is P1.5.

---

## Decisions locked (from brainstorming + exploration)

1. **Queue authority** = host-authoritative + a poll mode; both selectable per room via `config.controlMode`. Host mode ships in P1a–P1c; **poll voting = P1.5** (shares one proposal/vote mechanism with the deferred chat-command polls).
2. **Storage** = `queue jsonb` array of `QueueItem` + `current_item_id text` on `party_rooms` (not a separate table). Rationale: all writes are via RPC so per-row RLS is unnecessary; mirrors `media`/`config`; atomic with the playback timeline; trivial `party_snapshot()` extension; matches the existing `protocol.ts` `QueueItem` + `queue`-event shape.
3. **Back-compat** = the player derives current media as `currentItem?.media ?? snap.media`. Existing single-media rooms (and the current media-coupled host entry points) keep working with an empty queue; `party_set_media` stays as the legacy seed.
4. **Slices** = P1a (queue spine, host mode) → P1b (medialess room + floating tray) → P1c (auto-next + episode selector in party) → P1.5 (poll mode). Each is independently shippable and 2-device-testable.

---

# P1a — Queue spine (host mode)

Delivers: a host-controlled queue on TMDB titles — add, remove, reorder, play-now, advance — synced to guests, played through the existing HijackPlayer. Provable end-to-end on today's playback.

### Task 1: Migration `0008_party_queue.sql` — schema + snapshot

**Files:**
- Create: `supabase/migrations/0008_party_queue.sql`
- Reference: `supabase/migrations/0001_party_core.sql:20-37` (table), `supabase/migrations/0002_party_admin.sql:31-53` (`party_snapshot`)

**Interfaces:**
- Produces: `party_rooms.queue jsonb` (default `'[]'`), `party_rooms.current_item_id text`; `party_snapshot(p_code)` JSON gains `queue`, `currentItemId`, and `controlMode` (from `config->>'controlMode'`, default `'host'`).

- [ ] **Step 1: Write the migration**

```sql
-- 0008_party_queue.sql — queue spine on the room row. Apply via Supabase SQL editor.
alter table public.party_rooms
  add column if not exists queue jsonb not null default '[]'::jsonb,
  add column if not exists current_item_id text;

-- Extend the snapshot the client reads (newest-wins fan-out is unchanged).
-- Re-create party_snapshot with the three new fields appended.
create or replace function public.party_snapshot(p_code text)
returns jsonb language sql security definer stable set search_path = public as $$
  select jsonb_build_object(
    'code', r.code,
    'lease', jsonb_build_object('hostId', r.host_id, 'expiresAtMs',
      (extract(epoch from r.lease_expires_at) * 1000)::bigint),
    'playback', jsonb_build_object(
      'status', r.play_status, 'positionMs', r.play_position_ms, 'rate', r.play_rate,
      'anchorServerTimeMs', (extract(epoch from r.play_anchor_at) * 1000)::bigint,
      'epoch', r.epoch, 'seq', r.seq),
    'media', r.media,
    'queue', coalesce(r.queue, '[]'::jsonb),
    'currentItemId', r.current_item_id,
    'controlMode', coalesce(r.config->>'controlMode', 'host'),
    'config', r.config,
    'members', coalesce((select jsonb_agg(jsonb_build_object(
        'userId', m.user_id, 'displayName', m.display_name, 'role', m.role,
        'permissions', m.permissions, 'approved', m.approved
      )) from public.party_members m where m.room_code = r.code), '[]'::jsonb)
  )
  from public.party_rooms r where r.code = p_code;
$$;
```
> Copy the EXACT current body of `party_snapshot` from `0002_party_admin.sql:31-53` first and add only the three fields — do not hand-transcribe the existing fields from memory; they must match `RoomSnapshot` in `PartyClient.ts:37-45`.

- [ ] **Step 2: Apply + verify via Supabase MCP**

Apply with `mcp__supabase__apply_migration` (name `0008_party_queue`). Then:
```sql
select queue, current_item_id from public.party_rooms limit 1;
select public.party_snapshot(code) from public.party_rooms limit 1;
```
Expected: columns exist, `queue` = `[]`, snapshot JSON now contains `queue`/`currentItemId`/`controlMode`.

- [ ] **Step 3: Commit** (only if the user says "commit") — `supabase/migrations/0008_party_queue.sql`.

---

### Task 2: Queue RPCs

**Files:**
- Create: `supabase/migrations/0009_party_queue_rpcs.sql`
- Reference: `party_set_media` `0001_party_core.sql:209-222` (timeline-reset body), the host gate + grants boilerplate `0001:325-358`, `party_is_member` `0001:74-78`.

**Interfaces:**
- Produces RPCs (all return `party_snapshot(p_code)`), granted to `authenticated`, revoked from `public, anon`:
  - `party_queue_add(p_code text, p_item jsonb)` — gate: member AND (host OR `permissions.canQueue`). Appends `p_item` (a full `QueueItem` incl. `id`) to `queue`; bumps `seq`.
  - `party_queue_remove(p_code text, p_item_id text)` — host-gated. Removes by `id`; if it was `current_item_id`, leaves current as-is (player keeps last media).
  - `party_queue_reorder(p_code text, p_item_id text, p_to_index int)` — host-gated. Moves the item to `p_to_index`.
  - `party_queue_play(p_code text, p_item_id text)` — host-gated. Sets `current_item_id`, copies that item's `media` into `party_rooms.media`, applies the timeline reset, bumps `seq`.
  - `party_queue_next(p_code text)` — host-gated. Finds the item after `current_item_id` (or first if none); behaves like `party_queue_play` on it; no-op if none.

- [ ] **Step 1: Write the RPCs**

```sql
-- 0009_party_queue_rpcs.sql
-- Helper: current uid (matches existing RPCs' `auth.uid()` usage).
create or replace function public.party_queue_add(p_code text, p_item jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_room public.party_rooms; v_perm jsonb;
begin
  select * into v_room from public.party_rooms where code = p_code for update;
  if not found then raise exception 'no room'; end if;
  if not public.party_is_member(p_code, v_uid) then raise exception 'not member'; end if;
  select permissions into v_perm from public.party_members where room_code = p_code and user_id = v_uid;
  if v_room.host_id <> v_uid and coalesce((v_perm->>'canQueue')::boolean, false) = false
    then raise exception 'not allowed'; end if;
  update public.party_rooms
    set queue = coalesce(queue,'[]'::jsonb) || jsonb_build_array(p_item), seq = seq + 1
    where code = p_code;
  return public.party_snapshot(p_code);
end $$;

create or replace function public.party_queue_remove(p_code text, p_item_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_room public.party_rooms;
begin
  select * into v_room from public.party_rooms where code = p_code for update;
  if not found then raise exception 'no room'; end if;
  if v_room.host_id <> v_uid or v_room.lease_expires_at < now() then raise exception 'not host'; end if;
  update public.party_rooms
    set queue = coalesce((select jsonb_agg(e) from jsonb_array_elements(queue) e
                          where e->>'id' <> p_item_id), '[]'::jsonb),
        seq = seq + 1
    where code = p_code;
  return public.party_snapshot(p_code);
end $$;

create or replace function public.party_queue_reorder(p_code text, p_item_id text, p_to_index int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_room public.party_rooms; v_item jsonb; v_rest jsonb;
begin
  select * into v_room from public.party_rooms where code = p_code for update;
  if not found then raise exception 'no room'; end if;
  if v_room.host_id <> v_uid or v_room.lease_expires_at < now() then raise exception 'not host'; end if;
  select e into v_item from jsonb_array_elements(v_room.queue) e where e->>'id' = p_item_id limit 1;
  if v_item is null then raise exception 'no item'; end if;
  select coalesce(jsonb_agg(e), '[]'::jsonb) into v_rest
    from jsonb_array_elements(v_room.queue) e where e->>'id' <> p_item_id;
  update public.party_rooms
    set queue = jsonb_insert(v_rest, array[greatest(0, p_to_index)]::text[], v_item, true),
        seq = seq + 1
    where code = p_code;
  return public.party_snapshot(p_code);
end $$;

-- Shared advance body: set current + reset timeline (mirrors party_set_media).
create or replace function public._party_set_current(p_code text, p_item jsonb)
returns void language sql security definer set search_path = public as $$
  update public.party_rooms
    set current_item_id = p_item->>'id', media = p_item->'media',
        play_status = 'paused', play_position_ms = 0, play_anchor_at = now(),
        seq = seq + 1, lease_expires_at = now() + interval '6 seconds'
    where code = p_code;
$$;

create or replace function public.party_queue_play(p_code text, p_item_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_room public.party_rooms; v_item jsonb;
begin
  select * into v_room from public.party_rooms where code = p_code for update;
  if not found then raise exception 'no room'; end if;
  if v_room.host_id <> v_uid or v_room.lease_expires_at < now() then raise exception 'not host'; end if;
  select e into v_item from jsonb_array_elements(v_room.queue) e where e->>'id' = p_item_id limit 1;
  if v_item is null then raise exception 'no item'; end if;
  perform public._party_set_current(p_code, v_item);
  return public.party_snapshot(p_code);
end $$;

create or replace function public.party_queue_next(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_room public.party_rooms;
        v_items jsonb; v_len int; v_idx int; v_next jsonb;
begin
  select * into v_room from public.party_rooms where code = p_code for update;
  if not found then raise exception 'no room'; end if;
  if v_room.host_id <> v_uid or v_room.lease_expires_at < now() then raise exception 'not host'; end if;
  v_items := coalesce(v_room.queue, '[]'::jsonb); v_len := jsonb_array_length(v_items);
  if v_len = 0 then return public.party_snapshot(p_code); end if;
  v_idx := -1;
  for i in 0 .. v_len - 1 loop
    if v_items->i->>'id' = v_room.current_item_id then v_idx := i; exit; end if;
  end loop;
  if v_idx + 1 >= v_len then return public.party_snapshot(p_code); end if; -- end of queue: no-op
  v_next := v_items->(v_idx + 1);
  perform public._party_set_current(p_code, v_next);
  return public.party_snapshot(p_code);
end $$;

grant execute on function
  public.party_queue_add(text,jsonb), public.party_queue_remove(text,text),
  public.party_queue_reorder(text,text,int), public.party_queue_play(text,text),
  public.party_queue_next(text) to authenticated;
revoke execute on function
  public.party_queue_add(text,jsonb), public.party_queue_remove(text,text),
  public.party_queue_reorder(text,text,int), public.party_queue_play(text,text),
  public.party_queue_next(text) from public, anon;
```

- [ ] **Step 2: Apply + verify each RPC via Supabase MCP**

Apply `0009_party_queue_rpcs`. Against a test room (create one via the app or an inserted fixture), from SQL:
```sql
select public.party_queue_add('TESTCODE', '{"id":"q1","media":{"tmdbId":"550","type":"movie","title":"Fight Club"},"addedByUserId":"…","at":0}');
select jsonb_array_length(queue), current_item_id from public.party_rooms where code='TESTCODE';
select public.party_queue_play('TESTCODE','q1');   -- media copied, timeline reset
select public.party_queue_next('TESTCODE');        -- advances or no-ops at end
```
Expected: queue grows/shrinks/reorders; `play` copies media + resets `play_position_ms=0`; `next` advances then no-ops at the tail; a non-host caller raises `not host`/`not allowed`.

- [ ] **Step 3: Commit** (on "commit") — `supabase/migrations/0009_party_queue_rpcs.sql`.

---

### Task 3: Client transport — `PartyClient` queue methods + snapshot fields

**Files:**
- Modify: `services/party/PartyClient.ts` (`RoomSnapshot` type ~:37-45; add methods near `setMedia` :185; `rpcSnap` :244)
- Modify: `services/party/protocol.ts` if `RoomSnapshot`/`QueueItem` need a field (`QueueItem` :150, `controlMode`)

**Interfaces:**
- Consumes: `rpcSnap(fn, args)` (`PartyClient.ts:244`).
- Produces on `PartyClient`: `queueAdd(item: QueueItem)`, `queueRemove(itemId: string)`, `queueReorder(itemId: string, toIndex: number)`, `queuePlay(itemId: string)`, `queueNext()` — each `=> this.rpcSnap("party_queue_*", {...})`. `RoomSnapshot` gains `queue: QueueItem[]`, `currentItemId?: string`, `controlMode?: "host"|"poll"`.

- [ ] **Step 1: Extend `RoomSnapshot`** to include `queue`, `currentItemId`, `controlMode`, matching the extended `party_snapshot()`. Ensure `applySnapshot` (`:251-290`) passes them through untouched (newest-wins logic already generic).
- [ ] **Step 2: Add the five queue methods** mirroring `setMedia` (`:185-187`): e.g. `queueAdd(item){ return this.rpcSnap("party_queue_add", { p_code: this.code, p_item: item }); }`.
- [ ] **Step 3: Verify** — `npx tsc --noEmit` clean. Add a temporary debug button OR drive via execbro `redux_dispatch`/`execute_in_app` to call a method and confirm the snapshot round-trips (queue length changes in redux state).
- [ ] **Step 4: Commit** (on "commit") — `services/party/PartyClient.ts`, `services/party/protocol.ts`.

---

### Task 4: `useParty` surface

**Files:**
- Modify: `services/party/useParty.ts` (`UseParty` type :13-45; return object :112-144)

**Interfaces:**
- Produces on the `useParty()` return: `queue: QueueItem[]`, `currentItem: QueueItem | null` (looked up from `queue` by `currentItemId`), `controlMode: "host"|"poll"`, and `queueAdd/queueRemove/queueReorder/queuePlay/queueNext` forwarding to the client. Derive `currentItem` = `queue.find(q => q.id === snapshot.currentItemId) ?? null`.

- [ ] **Step 1** Expose the queue state + methods on `UseParty`; forward mutations to `clientRef.current`.
- [ ] **Step 2** `npx tsc --noEmit` clean.
- [ ] **Step 3: Commit** (on "commit") — `services/party/useParty.ts`.

---

### Task 5: PartyScreen — current-item playback + a Queue panel

**Files:**
- Modify: `src/screens/PartyScreen.tsx` (media derivation :229-232; player props :594-605; add a queue bottom-sheet + trigger)
- Create: `components/party/QueueSheet.tsx` (a `BottomSheetModal`, styled after `EpisodeSheet.tsx`)

**Interfaces:**
- Consumes: `useParty()` → `queue`, `currentItem`, `queueRemove/queueReorder/queuePlay`, `canControl` (host).
- Produces: `QueueSheet` props `{ queue: QueueItem[]; currentItemId?: string; canManage: boolean; onPlay(id); onRemove(id); onReorder(id, toIndex); }`.

- [ ] **Step 1** Derive player media as `const cur = party.currentItem?.media ?? snap.media;` and feed `cur` into HijackPlayer (keeps single-media rooms working).
- [ ] **Step 2** Build `QueueSheet` (reuse `EpisodeSheet` list/chip styling + theme tokens from `theme/bearoom.ts`): rows show poster (fetch per-item like PartyScreen does for the current title, or title-only for P1a), title, "added by", a now-playing marker; host sees remove + play-now + drag-reorder (first `Gesture.Pan` — model off `BouncyPressable`/`useCollapsingHeader` shared-value patterns). Blur/elevation allowed only because the sheet is modal over the party — actually the party IS a video screen: **render `QueueSheet` with `blur={false}` and no elevation** (GlassCard `blur={false}`), per the hard rule.
- [ ] **Step 3** Add a "Queue (N)" affordance in the party controls/top bar to present the sheet.
- [ ] **Step 4: Verify (2-device, execbro)** — Host adds two titles, plays #2, reorders, removes one; confirm the guest device mirrors queue + current within the lease window; `tsc` + `lint` clean. Screenshot both devices.
- [ ] **Step 5: Commit** (on "commit") — `src/screens/PartyScreen.tsx`, `components/party/QueueSheet.tsx`.

**P1a done when:** host can build/reorder/play a queue of TMDB titles, guests mirror it, playback rides the existing sync. `tsc`/`lint` clean, 2-device verified.

---

# P1b — Medialess room + floating now-playing tray (outline)

Delivers: "Host a Party" from anywhere with no title, and a persistent draggable tray around discovery.

- **Medialess entry point** — the plumbing already tolerates no media (`PartyScreen` `hasMedia` gate :258; `hostMedia` undefined when no `params.id` :176-189). Add a real host action: `openPartyHost({ role:"host", room: genRoomCode() })` (`utils/roomCode.ts:4`, `src/navigation/actions.ts`) wired to the currently-misrouted "Host Party" affordances (`AppHeader.tsx:33`, `FloatingTabBar.tsx:65`, `HomeView.tsx:63` — all currently open JoinParty). PartyScreen renders an "empty room" state (no player) with an "Add something to watch" CTA that opens discovery/the queue-add flow.
- **Floating tray** — mount a `NowPlayingTray` at the `AlertHost` slot (`App.tsx:121`), inside `GestureHandlerRootView`, outside `NavigationContainer`; read the active room from redux (`watchParty` slice) and the route via `navigationRef.getCurrentRoute()` (hide the tray on `Party`/`Player`; safe with blur over discovery, drop blur/elevation elsewhere). Draggable via `Gesture.Pan` + Reanimated shared values (first pan gesture in the app). Tap → `enterParty`. Shows current title + queue count + play/pause.
- **Verify:** host medialess from Home → tray appears → browse → tray persists → tap returns to room. 2-device. `tsc`/`lint`.

# P1c — Auto-next + episode selector in party (outline)

Delivers: continuous playback and mid-party episode changes.

- **`computeNextEpisode(details, seasonData, cur)`** — new pure fn in `utils/` (precedent: `utils/tmdbDetails.ts`), consuming `useDetailsQuery` `seasons[]` (filtered `episode_count>0`) + `useSeasonQuery` `episodes[]`; returns the next `{season, episode}` or null at series end (roll over to next season E1). Documented node quick-check.
- **Auto-advance on `ended`** — PartyScreen already receives `ended` (`:414-421`, currently only stops bg-audio). When host + `getAutoplayNext()`: if `currentItem` is a TV episode → `computeNextEpisode` → `queuePlay`/`setMedia` the next episode; else advance `queueNext()`; else append a deduped `recommendations`/`similar` item (both already fetched) when the queue tail is empty. Reconcile with videasy's internal `nextEpisode` URL params (`providerRegistry.ts:109-114`) — gate them off when app-owned advance is active to avoid double-advance.
- **Episode selector in party** — mount `EpisodeSheet` in PartyScreen (today solo-only); its `onSelect(season, episode)` calls a party mutation (`setMedia`/`queuePlay` a tv item) instead of `navigation.setParams`. Wire `onEpisodes` on the party `PlayerControls` (currently unset).
- **Verify:** episode ends → next auto-loads on host + mirrors to guest; manual episode pick syncs. 2-device. `tsc`/`lint`.

# P1.5 — Poll mode (outline, gated on user go-ahead)

Delivers: `config.controlMode='poll'` — guest-initiated queue changes become room polls.

- One **proposal/vote mechanism** shared with the deferred chat-command polls (memory `party-chat-commands-polls`): a `party_poll` (proposal + votes + expiry) — either a new table or an ephemeral broadcast on the existing chat channel (`party-chat:<CODE>`); on pass, the host-gated queue RPC is applied server-side. Guest "add/skip" in poll mode emits a proposal instead of a direct mutation.
- Kept OUT of P1a–P1c so the spine ships without voting UI. Flesh into full tasks when the user approves starting it.

---

## Verification (end-to-end, whole phase)

1. `npx tsc --noEmit` and `npm run lint` clean after every task.
2. **RPC layer** — exercise each `party_queue_*` via Supabase MCP `execute_sql` (add/remove/reorder/play/next, plus a non-host caller expecting `not host`/`not allowed`).
3. **Realtime** — 2-device (execbro): host mutates queue, guest mirrors within the ~6s lease; kick/stale-host election still works (regression on `party_claim_host`).
4. **Playback** — current-item drives HijackPlayer; auto-next loads the next episode; medialess room hosts with no title and the tray follows navigation.
5. **Migrations** — `0008`/`0009` apply cleanly; `party_snapshot` output matches `RoomSnapshot`.
