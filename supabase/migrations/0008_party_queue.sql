-- ============================================================================
-- Watch-party QUEUE — Program 1 · P1. Builds on 0001_party_core + 0002_party_admin.
--
-- Turns the room's single `media` into an ordered QUEUE. Same invariants as
-- 0001: Postgres is the single authority (SELECT ... FOR UPDATE inside SECURITY
-- DEFINER RPCs), now() is the stable reference clock, every mutation bumps seq
-- so the change fans out newest-wins.
--
-- THE TWO TIMELINE RULES (the thing to get right):
--   * RE-ANCHOR, never reset — add / remove(non-current) / move / clear.
--     Playback keeps flowing while somebody queues:
--       play_position_ms = party_effpos(room), play_anchor_at = now(), seq += 1
--   * RESET — set_current / advance / remove(current). Exactly what
--     party_set_media does today: paused @ 0, plus media/queue_current_id/queue_rev.
--
-- BACKWARD COMPATIBILITY (the keystone): `party_rooms.media` is kept as a derived
-- MIRROR of the current queue item. A v1 client in the same room reads
-- snapshot.media and plays correctly, so there is no flag day and this migration
-- is provable by running the CURRENT UNMODIFIED BUILD against the migrated DB.
--
-- Storage is `queue jsonb` on the room row rather than a table, because every
-- queue RPC must lock the room row anyway (to bump seq and re-anchor) — the row
-- lock already serialises them, party_snapshot() stays single-table, reorder is
-- an array splice, and it needs ZERO new RLS policy (inherits party_rooms_select).
--
-- APPLY: Supabase Dashboard -> SQL Editor -> paste this whole file -> Run.
-- Additive + idempotent-ish; live rooms are undisturbed.
-- ============================================================================

-- ---------- new columns (additive) ------------------------------------------

alter table public.party_rooms add column if not exists queue            jsonb  not null default '[]'::jsonb;
alter table public.party_rooms add column if not exists queue_current_id text;
alter table public.party_rooms add column if not exists queue_rev        bigint not null default 0;

-- Hard cap. Also bounds the realtime payload (a 100-item queue is ~20 KB).
create or replace function public.party_queue_max() returns int
  language sql immutable as $$ select 100 $$;

-- ---------- item identity ----------------------------------------------------
-- Item ids use EXACTLY the mediaKey() formula from utils/failureMemory.ts:31-35
-- (`movie:<id>` / `tv:<id>:<s>:<e>`) so queue ids and failure-memory keys stay in
-- lockstep. Consequence, and it is intentional: a title has ONE id regardless of
-- which source plays it, so the same movie cannot be queued twice — `ref` decides
-- HOW it plays, `id` decides WHAT it is.

create or replace function public.party_queue_item_id(p_ref jsonb)
returns text language sql immutable set search_path = public as $$
  select case coalesce(p_ref->>'source', 'tmdb')
    when 'youtube' then 'yt:' || coalesce(p_ref->>'videoId', '')
    when 'direct'  then 'direct:' || md5(coalesce(p_ref->>'url', ''))
    else case when coalesce(p_ref->>'type', 'movie') = 'tv'
      then 'tv:' || coalesce(p_ref->>'tmdbId', '')
           || ':' || coalesce(nullif(p_ref->>'season',  ''), '1')
           || ':' || coalesce(nullif(p_ref->>'episode', ''), '1')
      else 'movie:' || coalesce(p_ref->>'tmdbId', '')
    end
  end;
$$;

-- Reject malformed refs at the chokepoint rather than storing junk in the room.
create or replace function public.party_queue_valid_ref(p_ref jsonb)
returns boolean language sql immutable set search_path = public as $$
  select case coalesce(p_ref->>'source', 'tmdb')
    when 'tmdb'    then coalesce(p_ref->>'tmdbId', '') <> ''
                        and coalesce(p_ref->>'type', 'movie') in ('movie','tv')
    when 'plugin'  then coalesce(p_ref->>'tmdbId', '') <> ''
                        and coalesce(p_ref->>'type', 'movie') in ('movie','tv')
                        and coalesce(p_ref->>'pluginId', '') <> ''
    when 'direct'  then coalesce(p_ref->>'url', '') <> ''
    when 'youtube' then coalesce(p_ref->>'videoId', '') <> ''
    else false
  end;
$$;

-- Server-stamped normalisation. The client may propose ref/title/poster/runtime;
-- id, addedByUserId, addedAt and status are ours.
create or replace function public.party_queue_norm_item(p_item jsonb, p_uid uuid)
returns jsonb language sql stable set search_path = public as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id',            public.party_queue_item_id(p_item->'ref'),
    'ref',           p_item->'ref',
    'title',         p_item->>'title',
    'subtitle',      p_item->>'subtitle',
    'posterPath',    p_item->>'posterPath',
    'runtimeMs',     (p_item->>'runtimeMs')::bigint,
    'addedByUserId', p_uid,
    'addedAt',       (extract(epoch from now()) * 1000)::bigint,
    'status',        'queued',
    'syncable',      coalesce((p_item->>'syncable')::boolean, true)
  ));
$$;

-- ---------- the media mirror (backward compatibility) ------------------------
-- PartyMedia is a TMDB shape, so only tmdb/plugin items can mirror into it.
-- direct/youtube items yield NULL media: a v1 client sees "no media" rather than
-- something it cannot play, which is the correct graceful degradation.

create or replace function public.party_ref_of_media(p_media jsonb)
returns jsonb language sql immutable set search_path = public as $$
  select case when p_media is null then null else jsonb_strip_nulls(jsonb_build_object(
    'source',     'tmdb',
    'tmdbId',     p_media->>'tmdbId',
    'type',       coalesce(p_media->>'type', 'movie'),
    'season',     (p_media->>'season')::int,
    'episode',    (p_media->>'episode')::int,
    'providerId', p_media->>'providerId')) end;
$$;

create or replace function public.party_media_of_item(p_item jsonb)
returns jsonb language sql immutable set search_path = public as $$
  select case
    when p_item is null then null
    when coalesce(p_item->'ref'->>'source', 'tmdb') in ('tmdb', 'plugin') then
      jsonb_strip_nulls(jsonb_build_object(
        'tmdbId',     p_item->'ref'->>'tmdbId',
        'type',       coalesce(p_item->'ref'->>'type', 'movie'),
        'season',     (p_item->'ref'->>'season')::int,
        'episode',    (p_item->'ref'->>'episode')::int,
        'title',      p_item->>'title',
        'providerId', p_item->'ref'->>'providerId'))
    else null
  end;
$$;

-- ---------- array helpers (pure; the queue is a jsonb array) -----------------

-- 0-based position of an item id, or NULL when absent.
create or replace function public.party_queue_index(p_queue jsonb, p_item_id text)
returns int language sql immutable set search_path = public as $$
  select (idx - 1)::int
    from jsonb_array_elements(coalesce(p_queue, '[]'::jsonb)) with ordinality as t(el, idx)
   where el->>'id' = p_item_id
   limit 1;
$$;

create or replace function public.party_queue_item(p_queue jsonb, p_item_id text)
returns jsonb language sql immutable set search_path = public as $$
  select el
    from jsonb_array_elements(coalesce(p_queue, '[]'::jsonb)) as el
   where el->>'id' = p_item_id
   limit 1;
$$;

create or replace function public.party_queue_without(p_queue jsonb, p_ids text[])
returns jsonb language sql immutable set search_path = public as $$
  select coalesce(jsonb_agg(el order by idx), '[]'::jsonb)
    from jsonb_array_elements(coalesce(p_queue, '[]'::jsonb)) with ordinality as t(el, idx)
   where not (el->>'id' = any(p_ids));
$$;

-- Patch one item's fields in place, preserving order.
create or replace function public.party_queue_patch(p_queue jsonb, p_item_id text, p_patch jsonb)
returns jsonb language sql immutable set search_path = public as $$
  select coalesce(jsonb_agg(
           case when el->>'id' = p_item_id then el || coalesce(p_patch, '{}'::jsonb) else el end
           order by idx), '[]'::jsonb)
    from jsonb_array_elements(coalesce(p_queue, '[]'::jsonb)) with ordinality as t(el, idx);
$$;

-- Splice: pull the item out, reinsert at a clamped 0-based index.
create or replace function public.party_queue_reorder(p_queue jsonb, p_item_id text, p_to int)
returns jsonb language plpgsql immutable set search_path = public as $$
declare v_item jsonb; v_arr jsonb[]; v_len int; v_to int;
begin
  v_item := public.party_queue_item(p_queue, p_item_id);
  if v_item is null then return coalesce(p_queue, '[]'::jsonb); end if;

  select coalesce(array_agg(el order by idx), '{}'::jsonb[]) into v_arr
    from jsonb_array_elements(public.party_queue_without(p_queue, array[p_item_id]))
         with ordinality as t(el, idx);

  v_len := coalesce(array_length(v_arr, 1), 0);
  v_to  := greatest(0, least(coalesce(p_to, v_len), v_len));
  return to_jsonb(v_arr[1:v_to] || v_item || v_arr[v_to + 1 : v_len]);
end $$;

-- The next PLAYABLE item after a given id: first still-'queued' item to its
-- right. Skipping done/failed is what stops advance() from looping on a dead item.
create or replace function public.party_queue_next_id(p_queue jsonb, p_after_id text)
returns text language sql immutable set search_path = public as $$
  select el->>'id'
    from jsonb_array_elements(coalesce(p_queue, '[]'::jsonb)) with ordinality as t(el, idx)
   where coalesce(el->>'status', 'queued') = 'queued'
     and (idx - 1) > coalesce(public.party_queue_index(p_queue, p_after_id), -1)
   order by idx
   limit 1;
$$;

-- ---------- authorization -----------------------------------------------------
-- Host (with a live lease) always may. A guest may ADD/REMOVE-OWN only when the
-- room has queueEnabled AND they are approved AND they hold canQueue.
-- Everything that changes WHAT PLAYS (move/set_current/advance/clear) is host-only,
-- using the same predicate as party_set_media.

create or replace function public.party_can_queue(r public.party_rooms, p_uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select (r.host_id = p_uid and r.lease_expires_at >= now())
      or (coalesce((r.config->>'queueEnabled')::boolean, true)
          and exists (select 1 from public.party_members m
                       where m.room_code = r.code and m.user_id = p_uid and m.approved
                         and coalesce((m.permissions->>'canQueue')::boolean, false)));
$$;

-- ---------- config default now carries guestQueueDefault ---------------------
-- (latest definition was 0002:23 — this copies it forward, it does not revert it)
create or replace function public.party_default_config()
returns jsonb language sql immutable set search_path = public as $$
  select jsonb_build_object('access','open','passwordRequired',false,'chatEnabled',true,
    'gifsEnabled',true,'queueEnabled',true,'pollsEnabled',true,'guestControlDefault',false,
    'approveGuests',false,'guestQueueDefault',false);
$$;

-- ---------- snapshot: expose the queue ---------------------------------------
-- (copied forward from 0002:31 — which added per-member `approved`. Copying
--  0001's body here would silently revert that.)
create or replace function public.party_snapshot(p_code text)
returns jsonb language sql security definer stable set search_path = public as $$
  select jsonb_build_object(
    'code', r.code,
    'lease', jsonb_build_object(
      'hostId', r.host_id, 'epoch', r.epoch,
      'leaseExpiresAt', (extract(epoch from r.lease_expires_at) * 1000)::bigint),
    'playback', jsonb_build_object(
      'status', r.play_status, 'positionMs', r.play_position_ms, 'rate', r.play_rate,
      'anchorServerTimeMs', (extract(epoch from r.play_anchor_at) * 1000)::bigint,
      'epoch', r.epoch, 'seq', r.seq),
    'media', r.media,
    'queue', coalesce(r.queue, '[]'::jsonb),
    'currentItemId', r.queue_current_id,
    'queueRev', r.queue_rev,
    'config', r.config,
    'members', coalesce((select jsonb_agg(jsonb_build_object(
        'userId', m.user_id, 'installationId', m.installation_id, 'displayName', m.display_name,
        'role', m.role, 'permissions', m.permissions, 'approved', m.approved,
        'joinedAt', (extract(epoch from m.joined_at) * 1000)::bigint,
        'connected', (m.last_seen_at > now() - interval '15 seconds')
      ) order by m.joined_at) from public.party_members m where m.room_code = p_code), '[]'::jsonb),
    'serverTimeMs', (extract(epoch from now()) * 1000)::bigint
  )
  from public.party_rooms r where r.code = p_code;
$$;

-- ---------- RPC: add ----------------------------------------------------------
-- p_position: 'end' (default) | 'next' (immediately after the current item).
-- RE-ANCHORS: playback keeps flowing while somebody queues. The one exception is
-- an idle room (no current item) — then the first added item becomes current and
-- the timeline resets, so an empty room does not need a second call to start.
create or replace function public.party_queue_add(
  p_code text, p_items jsonb, p_position text default 'end')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid(); v_room public.party_rooms;
  v_q jsonb; v_el jsonb; v_item jsonb; v_ins jsonb[] := '{}'::jsonb[];
  v_arr jsonb[]; v_len int; v_at int; v_promote jsonb;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select * into v_room from public.party_rooms where code = p_code for update;
  if not found then raise exception 'no such room'; end if;
  if not public.party_can_queue(v_room, v_uid) then raise exception 'not allowed to queue'; end if;

  v_q := coalesce(v_room.queue, '[]'::jsonb);

  for v_el in select value from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    if not public.party_queue_valid_ref(v_el->'ref') then continue; end if;
    v_item := public.party_queue_norm_item(v_el, v_uid);
    -- already in the room, or a duplicate earlier in this same batch
    if public.party_queue_index(v_q, v_item->>'id') is not null then continue; end if;
    if exists (select 1 from unnest(v_ins) u where u->>'id' = v_item->>'id') then continue; end if;
    v_ins := v_ins || v_item;
  end loop;

  if coalesce(array_length(v_ins, 1), 0) = 0 then return public.party_snapshot(p_code); end if;
  if jsonb_array_length(v_q) + array_length(v_ins, 1) > public.party_queue_max() then
    raise exception 'queue full';
  end if;

  if p_position = 'next' and public.party_queue_index(v_q, v_room.queue_current_id) is not null then
    v_at := public.party_queue_index(v_q, v_room.queue_current_id) + 1;
  else
    v_at := jsonb_array_length(v_q);
  end if;

  select coalesce(array_agg(el order by idx), '{}'::jsonb[]) into v_arr
    from jsonb_array_elements(v_q) with ordinality as t(el, idx);
  v_len := coalesce(array_length(v_arr, 1), 0);
  v_q := to_jsonb(v_arr[1:v_at] || v_ins || v_arr[v_at + 1 : v_len]);

  -- Idle room: promote the first new item and RESET. Otherwise RE-ANCHOR.
  v_promote := case when v_room.queue_current_id is null then v_ins[1] else null end;

  if v_promote is not null then
    update public.party_rooms
      set queue = v_q, queue_current_id = v_promote->>'id', queue_rev = queue_rev + 1,
          media = public.party_media_of_item(v_promote),
          play_status = 'paused', play_position_ms = 0, play_anchor_at = now(), seq = seq + 1,
          lease_expires_at = case when host_id = v_uid
                                  then now() + interval '6 seconds' else lease_expires_at end
      where code = p_code;
  else
    update public.party_rooms
      set queue = v_q, queue_rev = queue_rev + 1, seq = seq + 1,
          play_position_ms = public.party_effpos(v_room), play_anchor_at = now(),
          lease_expires_at = case when host_id = v_uid
                                  then now() + interval '6 seconds' else lease_expires_at end
      where code = p_code;
  end if;

  return public.party_snapshot(p_code);
end $$;

-- ---------- RPC: remove -------------------------------------------------------
-- Host removes anything; a canQueue guest removes only their OWN items.
-- Removing the CURRENT item advances to the next playable one (RESET);
-- removing anything else RE-ANCHORS.
create or replace function public.party_queue_remove(p_code text, p_item_ids text[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid(); v_room public.party_rooms; v_is_host boolean;
  v_ids text[]; v_q jsonb; v_next text; v_next_item jsonb;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select * into v_room from public.party_rooms where code = p_code for update;
  if not found then raise exception 'no such room'; end if;
  if not public.party_can_queue(v_room, v_uid) then raise exception 'not allowed to queue'; end if;

  v_is_host := (v_room.host_id = v_uid and v_room.lease_expires_at >= now());

  select coalesce(array_agg(el->>'id'), '{}'::text[]) into v_ids
    from jsonb_array_elements(coalesce(v_room.queue, '[]'::jsonb)) as el
   where el->>'id' = any(coalesce(p_item_ids, '{}'::text[]))
     and (v_is_host or (el->>'addedByUserId')::uuid = v_uid);

  if coalesce(array_length(v_ids, 1), 0) = 0 then return public.party_snapshot(p_code); end if;

  -- Resolve the successor against the ORIGINAL queue, before the splice.
  v_next := case when v_room.queue_current_id = any(v_ids)
                 then public.party_queue_next_id(v_room.queue, v_room.queue_current_id)
                 else null end;
  v_q := public.party_queue_without(v_room.queue, v_ids);
  -- The successor may itself be in the removal set; walk forward until it isn't.
  while v_next is not null and public.party_queue_index(v_q, v_next) is null loop
    v_next := public.party_queue_next_id(v_room.queue, v_next);
  end loop;

  if v_room.queue_current_id = any(v_ids) then
    v_next_item := public.party_queue_item(v_q, v_next);
    update public.party_rooms
      set queue = v_q, queue_current_id = v_next, queue_rev = queue_rev + 1,
          media = public.party_media_of_item(v_next_item),
          play_status = 'paused', play_position_ms = 0, play_anchor_at = now(), seq = seq + 1,
          lease_expires_at = case when host_id = v_uid
                                  then now() + interval '6 seconds' else lease_expires_at end
      where code = p_code;
  else
    update public.party_rooms
      set queue = v_q, queue_rev = queue_rev + 1, seq = seq + 1,
          play_position_ms = public.party_effpos(v_room), play_anchor_at = now(),
          lease_expires_at = case when host_id = v_uid
                                  then now() + interval '6 seconds' else lease_expires_at end
      where code = p_code;
  end if;

  return public.party_snapshot(p_code);
end $$;

-- ---------- RPC: move (host only) — pure reorder, RE-ANCHORS -----------------
create or replace function public.party_queue_move(p_code text, p_item_id text, p_to_index int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_room public.party_rooms; v_q jsonb;
begin
  select * into v_room from public.party_rooms where code = p_code for update;
  if not found then raise exception 'no such room'; end if;
  if v_room.host_id <> v_uid or v_room.lease_expires_at < now() then raise exception 'not host'; end if;
  if public.party_queue_index(v_room.queue, p_item_id) is null then
    return public.party_snapshot(p_code);
  end if;

  v_q := public.party_queue_reorder(v_room.queue, p_item_id, p_to_index);
  update public.party_rooms
    set queue = v_q, queue_rev = queue_rev + 1, seq = seq + 1,
        play_position_ms = public.party_effpos(v_room), play_anchor_at = now(),
        lease_expires_at = now() + interval '6 seconds'
    where code = p_code;
  return public.party_snapshot(p_code);
end $$;

-- ---------- RPC: set_current (host only) — jump, RESETS ----------------------
-- A manual jump, so statuses are left alone: skipping ahead does not mark the
-- item you left as watched. Only advance() writes done/failed.
create or replace function public.party_queue_set_current(p_code text, p_item_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_room public.party_rooms; v_item jsonb; v_q jsonb;
begin
  select * into v_room from public.party_rooms where code = p_code for update;
  if not found then raise exception 'no such room'; end if;
  if v_room.host_id <> v_uid or v_room.lease_expires_at < now() then raise exception 'not host'; end if;

  v_item := public.party_queue_item(v_room.queue, p_item_id);
  if v_item is null then raise exception 'no such queue item'; end if;

  -- Re-playing a done/failed item makes it queued again.
  v_q := public.party_queue_patch(v_room.queue, p_item_id, jsonb_build_object('status', 'queued'));
  v_item := public.party_queue_item(v_q, p_item_id);

  update public.party_rooms
    set queue = v_q, queue_current_id = p_item_id, queue_rev = queue_rev + 1,
        media = public.party_media_of_item(v_item),
        play_status = 'paused', play_position_ms = 0, play_anchor_at = now(), seq = seq + 1,
        lease_expires_at = now() + interval '6 seconds'
    where code = p_code;
  return public.party_snapshot(p_code);
end $$;

-- ---------- RPC: advance (host only) — RESETS --------------------------------
-- p_from_item_id is the IDEMPOTENCY KEY: `ended` can fire from several frames at
-- once, so a call naming an item that is no longer current is a silent no-op
-- rather than a double-skip. Pass NULL to force-advance from whatever is current.
-- p_reason: 'ended' | 'failed' | 'skipped'. Exhausting the queue leaves the room
-- idle (current NULL, media NULL, paused @ 0) rather than looping.
create or replace function public.party_queue_advance(
  p_code text, p_from_item_id text, p_reason text default 'ended')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid(); v_room public.party_rooms;
  v_from text; v_status text; v_q jsonb; v_next text; v_next_item jsonb;
begin
  select * into v_room from public.party_rooms where code = p_code for update;
  if not found then raise exception 'no such room'; end if;
  if v_room.host_id <> v_uid or v_room.lease_expires_at < now() then raise exception 'not host'; end if;
  if coalesce(p_reason, 'ended') not in ('ended', 'failed', 'skipped') then
    raise exception 'bad reason';
  end if;

  v_from := coalesce(p_from_item_id, v_room.queue_current_id);
  if v_from is null then return public.party_snapshot(p_code); end if;
  -- stale/duplicate advance
  if v_from is distinct from v_room.queue_current_id then return public.party_snapshot(p_code); end if;

  v_status := case coalesce(p_reason, 'ended') when 'failed' then 'failed'
                                               when 'skipped' then 'queued'
                                               else 'done' end;
  v_q      := public.party_queue_patch(v_room.queue, v_from, jsonb_build_object('status', v_status));
  v_next   := public.party_queue_next_id(v_q, v_from);
  v_next_item := public.party_queue_item(v_q, v_next);

  update public.party_rooms
    set queue = v_q, queue_current_id = v_next, queue_rev = queue_rev + 1,
        media = public.party_media_of_item(v_next_item),
        play_status = 'paused', play_position_ms = 0, play_anchor_at = now(), seq = seq + 1,
        lease_expires_at = now() + interval '6 seconds'
    where code = p_code;
  return public.party_snapshot(p_code);
end $$;

-- ---------- RPC: clear (host only) — RE-ANCHORS ------------------------------
-- p_scope: 'done' (default; drops done+failed) | 'all'. The current item is never
-- dropped, so clearing can never disturb playback.
create or replace function public.party_queue_clear(p_code text, p_scope text default 'done')
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_room public.party_rooms; v_ids text[]; v_q jsonb;
begin
  select * into v_room from public.party_rooms where code = p_code for update;
  if not found then raise exception 'no such room'; end if;
  if v_room.host_id <> v_uid or v_room.lease_expires_at < now() then raise exception 'not host'; end if;
  if coalesce(p_scope, 'done') not in ('done', 'all') then raise exception 'bad scope'; end if;

  select coalesce(array_agg(el->>'id'), '{}'::text[]) into v_ids
    from jsonb_array_elements(coalesce(v_room.queue, '[]'::jsonb)) as el
   where el->>'id' is distinct from v_room.queue_current_id
     and (coalesce(p_scope, 'done') = 'all'
          or coalesce(el->>'status', 'queued') in ('done', 'failed'));

  if coalesce(array_length(v_ids, 1), 0) = 0 then return public.party_snapshot(p_code); end if;

  v_q := public.party_queue_without(v_room.queue, v_ids);
  update public.party_rooms
    set queue = v_q, queue_rev = queue_rev + 1, seq = seq + 1,
        play_position_ms = public.party_effpos(v_room), play_anchor_at = now(),
        lease_expires_at = now() + interval '6 seconds'
    where code = p_code;
  return public.party_snapshot(p_code);
end $$;

-- ---------- party_set_media: materialise into the queue ----------------------
-- (latest definition was 0001:209.) Observably IDENTICAL for a v1 client — media
-- set, timeline reset to paused @ 0 — but the item now also lands in the queue and
-- becomes current, so the two representations can never disagree.
create or replace function public.party_set_media(p_code text, p_media jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_room public.party_rooms; v_item jsonb; v_q jsonb; v_id text;
begin
  select * into v_room from public.party_rooms where code = p_code for update;
  if not found then raise exception 'no such room'; end if;
  if v_room.host_id <> v_uid or v_room.lease_expires_at < now() then raise exception 'not host'; end if;

  if p_media is null then
    update public.party_rooms
      set media = null, queue_current_id = null, queue_rev = queue_rev + 1,
          play_status = 'paused', play_position_ms = 0, play_anchor_at = now(), seq = seq + 1,
          lease_expires_at = now() + interval '6 seconds'
      where code = p_code;
    return public.party_snapshot(p_code);
  end if;

  v_item := public.party_queue_norm_item(
              jsonb_build_object('ref', public.party_ref_of_media(p_media),
                                 'title', p_media->>'title'), v_uid);
  v_id   := v_item->>'id';
  v_q    := coalesce(v_room.queue, '[]'::jsonb);

  if public.party_queue_index(v_q, v_id) is null then
    if jsonb_array_length(v_q) + 1 > public.party_queue_max() then raise exception 'queue full'; end if;
    v_q := v_q || jsonb_build_array(v_item);
  else
    v_q := public.party_queue_patch(v_q, v_id, jsonb_build_object('status', 'queued'));
  end if;

  update public.party_rooms
    set media = p_media, queue = v_q, queue_current_id = v_id, queue_rev = queue_rev + 1,
        play_status = 'paused', play_position_ms = 0, play_anchor_at = now(), seq = seq + 1,
        lease_expires_at = now() + interval '6 seconds'
    where code = p_code;
  return public.party_snapshot(p_code);
end $$;

-- ---------- party_join: honour guestQueueDefault -----------------------------
-- (latest definition was 0004:11 — copied forward verbatim except the one line
--  below. Without this, config.guestQueueDefault would be an inert knob: joiners
--  always got canQueue=false and the host had to grant it per-guest by hand.)
create or replace function public.party_join(
  p_code text, p_installation_id text, p_display_name text, p_password text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_room public.party_rooms;
        v_perms jsonb; v_access text; v_is_member boolean; v_approved boolean;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select * into v_room from public.party_rooms where code = p_code for update;
  if not found then raise exception 'no such room'; end if;

  v_is_member := exists (select 1 from public.party_members where room_code = p_code and user_id = v_uid);
  v_access := coalesce(v_room.config->>'access', 'open');

  if not v_is_member then
    if v_access in ('locked','private') then
      raise exception 'room locked';
    elsif v_access = 'password' then
      if p_password is null or length(p_password) = 0 then raise exception 'password required'; end if;
      if v_room.password_hash is null
         or v_room.password_hash <> extensions.crypt(p_password, v_room.password_hash) then
        raise exception 'bad password';
      end if;
    end if;
  end if;

  v_approved := not (not v_is_member
                     and coalesce((v_room.config->>'approveGuests')::boolean, false));

  v_perms := jsonb_build_object(
    'canControlPlayback', coalesce((v_room.config->>'guestControlDefault')::boolean, false),
    'canChat', true,
    'canQueue', coalesce((v_room.config->>'guestQueueDefault')::boolean, false),   -- <- 0008
    'canVote', true);

  insert into public.party_members (room_code, user_id, installation_id, display_name, role, permissions, approved)
    values (p_code, v_uid, p_installation_id, p_display_name, 'guest', v_perms, v_approved)
  on conflict (room_code, user_id) do update
    set display_name = excluded.display_name,
        installation_id = excluded.installation_id, last_seen_at = now();

  if not v_is_member then
    update public.party_rooms
      set seq = seq + 1,
          play_position_ms = public.party_effpos(v_room), play_anchor_at = now()
      where code = p_code;
  end if;

  return public.party_snapshot(p_code);
end $$;

-- ---------- backfill ----------------------------------------------------------
-- Existing rooms become a 1-item queue holding what they already play. Touches NO
-- play_* column and does NOT bump seq: live rooms must not notice this migration.
update public.party_rooms r
   set queue = jsonb_build_array(
         public.party_queue_norm_item(
           jsonb_build_object('ref',   public.party_ref_of_media(r.media),
                              'title', r.media->>'title'),
           r.created_by)),
       queue_current_id = public.party_queue_item_id(public.party_ref_of_media(r.media))
 where r.media is not null
   and coalesce((r.media->>'tmdbId'), '') <> ''
   and jsonb_array_length(coalesce(r.queue, '[]'::jsonb)) = 0;

-- ---------- grants ------------------------------------------------------------
grant execute on function
  public.party_queue_add(text, jsonb, text),
  public.party_queue_remove(text, text[]),
  public.party_queue_move(text, text, int),
  public.party_queue_set_current(text, text),
  public.party_queue_advance(text, text, text),
  public.party_queue_clear(text, text)
to authenticated;

-- Pure helpers stay server-side only: clients get them via party_snapshot().
revoke execute on function
  public.party_queue_max(),
  public.party_queue_item_id(jsonb),
  public.party_queue_valid_ref(jsonb),
  public.party_queue_norm_item(jsonb, uuid),
  public.party_ref_of_media(jsonb),
  public.party_media_of_item(jsonb),
  public.party_queue_index(jsonb, text),
  public.party_queue_item(jsonb, text),
  public.party_queue_without(jsonb, text[]),
  public.party_queue_patch(jsonb, text, jsonb),
  public.party_queue_reorder(jsonb, text, int),
  public.party_queue_next_id(jsonb, text),
  public.party_can_queue(public.party_rooms, uuid),
  public.party_queue_add(text, jsonb, text),
  public.party_queue_remove(text, text[]),
  public.party_queue_move(text, text, int),
  public.party_queue_set_current(text, text),
  public.party_queue_advance(text, text, text),
  public.party_queue_clear(text, text)
from public, anon;
