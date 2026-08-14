-- ============================================================================
-- Watch-party CORE — Supabase-only, fully free.
--
-- Postgres is the single-writer AUTHORITY (one room = one row, serialized by
-- SELECT ... FOR UPDATE inside SECURITY DEFINER RPCs). now() is the STABLE
-- reference clock (doesn't move when the host changes). Realtime Postgres
-- Changes on these tables is the TRANSPORT. Anonymous auth is the identity
-- principal (auth.uid()).
--
-- Playback is a TIMELINE ANCHOR (status/position/rate/anchor_at + epoch/seq),
-- so host handoff is a normal state transition — the timeline never stops, only
-- control ownership changes. See services/party/protocol.ts for the client side.
--
-- APPLY: Supabase Dashboard -> SQL Editor -> paste this whole file -> Run.
-- (Idempotent-ish: safe to re-run; publication adds swallow "already added".)
-- ============================================================================

-- ---------- tables ----------------------------------------------------------

create table if not exists public.party_rooms (
  code              text        primary key,
  created_at        timestamptz not null default now(),
  created_by        uuid,
  host_id           uuid,                                     -- current host (auth.uid); null = up for grabs
  epoch             int         not null default 0,          -- leadership generation
  seq               bigint      not null default 0,          -- monotonic command order
  lease_expires_at  timestamptz,                             -- server-stamped host lease
  play_status       text        not null default 'paused' check (play_status in ('playing','paused')),
  play_position_ms  bigint      not null default 0,
  play_rate         real        not null default 1,
  play_anchor_at    timestamptz not null default now(),      -- server time position_ms was true
  media             jsonb,                                   -- PartyMedia | null
  config            jsonb       not null default jsonb_build_object(
                      'access','open','passwordRequired',false,'chatEnabled',true,
                      'gifsEnabled',true,'queueEnabled',true,'pollsEnabled',true,
                      'guestControlDefault',false)
);

create table if not exists public.party_members (
  room_code       text        not null references public.party_rooms(code) on delete cascade,
  user_id         uuid        not null,
  installation_id text,
  display_name    text,
  role            text        not null default 'guest' check (role in ('host','guest')),
  permissions     jsonb       not null default jsonb_build_object(
                    'canControlPlayback',false,'canChat',true,'canQueue',false,'canVote',true),
  joined_at       timestamptz not null default now(),        -- server-stamped -> safe for deterministic election
  last_seen_at    timestamptz not null default now(),
  primary key (room_code, user_id)
);

create index if not exists party_members_room_idx on public.party_members(room_code);

-- ---------- internal helpers ------------------------------------------------

create or replace function public.party_default_config()
returns jsonb language sql immutable set search_path = public as $$
  select jsonb_build_object('access','open','passwordRequired',false,'chatEnabled',true,
    'gifsEnabled',true,'queueEnabled',true,'pollsEnabled',true,'guestControlDefault',false);
$$;

-- Effective media position (ms) right now, from a room row's anchor.
create or replace function public.party_effpos(r public.party_rooms)
returns bigint language sql stable set search_path = public as $$
  select case
    when r.play_status = 'paused' then r.play_position_ms
    else greatest(0, r.play_position_ms
                   + (extract(epoch from (now() - r.play_anchor_at)) * 1000 * r.play_rate)::bigint)
  end;
$$;

-- Membership check used by RLS. SECURITY DEFINER so its SELECT bypasses RLS
-- (prevents infinite policy recursion — standard Supabase pattern).
create or replace function public.party_is_member(p_room text, p_uid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.party_members
                 where room_code = p_room and user_id = p_uid);
$$;

-- Full canonical snapshot, shaped to match protocol.ts (ms numbers, not ISO).
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
    'config', r.config,
    'members', coalesce((select jsonb_agg(jsonb_build_object(
        'userId', m.user_id, 'installationId', m.installation_id, 'displayName', m.display_name,
        'role', m.role, 'permissions', m.permissions,
        'joinedAt', (extract(epoch from m.joined_at) * 1000)::bigint,
        'connected', (m.last_seen_at > now() - interval '15 seconds')
      ) order by m.joined_at) from public.party_members m where m.room_code = p_code), '[]'::jsonb),
    'serverTimeMs', (extract(epoch from now()) * 1000)::bigint
  )
  from public.party_rooms r where r.code = p_code;
$$;

-- ---------- RLS: read-only to members; ALL writes go through RPCs -----------

alter table public.party_rooms   enable row level security;
alter table public.party_members enable row level security;

drop policy if exists party_rooms_select on public.party_rooms;
create policy party_rooms_select on public.party_rooms
  for select to authenticated
  using (public.party_is_member(code, auth.uid()));

drop policy if exists party_members_select on public.party_members;
create policy party_members_select on public.party_members
  for select to authenticated
  using (public.party_is_member(room_code, auth.uid()));

-- ---------- RPCs ------------------------------------------------------------

-- Stable server clock (ms) for client offset estimation.
create or replace function public.party_server_time()
returns bigint language sql stable set search_path = public as $$
  select (extract(epoch from now()) * 1000)::bigint;
$$;

-- Create a room (caller becomes host) OR reclaim a room with no active host.
-- Errors 'room in use' if a different host holds a live lease.
create or replace function public.party_create(
  p_code text, p_installation_id text, p_display_name text, p_config jsonb default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_room public.party_rooms;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  insert into public.party_rooms (code, created_by, host_id, epoch, seq,
                                  lease_expires_at, play_anchor_at, config)
    values (p_code, v_uid, v_uid, 1, 0, now() + interval '6 seconds', now(),
            coalesce(p_config, public.party_default_config()))
  on conflict (code) do update
    set host_id          = v_uid,
        epoch            = party_rooms.epoch + 1,
        lease_expires_at = now() + interval '6 seconds',
        play_position_ms = public.party_effpos(party_rooms),  -- re-anchor; never stall
        play_anchor_at   = now()
    where party_rooms.host_id is null
       or party_rooms.host_id = v_uid
       or party_rooms.lease_expires_at < now()
  returning * into v_room;

  if v_room.code is null then raise exception 'room in use'; end if;

  update public.party_members set role = 'guest'
    where room_code = p_code and role = 'host' and user_id <> v_uid;
  insert into public.party_members (room_code, user_id, installation_id, display_name, role, permissions)
    values (p_code, v_uid, p_installation_id, p_display_name, 'host',
            jsonb_build_object('canControlPlayback',true,'canChat',true,'canQueue',true,'canVote',true))
  on conflict (room_code, user_id) do update
    set role = 'host', display_name = excluded.display_name,
        installation_id = excluded.installation_id, last_seen_at = now();

  return public.party_snapshot(p_code);
end $$;

-- Join an existing room as a guest.
create or replace function public.party_join(
  p_code text, p_installation_id text, p_display_name text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_room public.party_rooms; v_perms jsonb;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select * into v_room from public.party_rooms where code = p_code for update;
  if not found then raise exception 'no such room'; end if;

  if (v_room.config->>'access') = 'locked'
     and not exists (select 1 from public.party_members where room_code = p_code and user_id = v_uid)
  then raise exception 'room locked'; end if;

  v_perms := jsonb_build_object(
    'canControlPlayback', coalesce((v_room.config->>'guestControlDefault')::boolean, false),
    'canChat', true, 'canQueue', false, 'canVote', true);

  insert into public.party_members (room_code, user_id, installation_id, display_name, role, permissions)
    values (p_code, v_uid, p_installation_id, p_display_name, 'guest', v_perms)
  on conflict (room_code, user_id) do update
    set display_name = excluded.display_name,
        installation_id = excluded.installation_id, last_seen_at = now();

  return public.party_snapshot(p_code);
end $$;

-- Host heartbeat: renew the lease. Light payload (not a full snapshot).
create or replace function public.party_renew_lease(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_room public.party_rooms;
begin
  update public.party_rooms set lease_expires_at = now() + interval '6 seconds'
    where code = p_code and host_id = v_uid
  returning * into v_room;
  if v_room.code is null then raise exception 'not host'; end if;
  update public.party_members set last_seen_at = now() where room_code = p_code and user_id = v_uid;
  return jsonb_build_object('epoch', v_room.epoch,
    'leaseExpiresAt', (extract(epoch from v_room.lease_expires_at) * 1000)::bigint,
    'serverTimeMs', (extract(epoch from now()) * 1000)::bigint);
end $$;

-- Host: set WHAT the room plays (resets the timeline to paused@0).
create or replace function public.party_set_media(p_code text, p_media jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_room public.party_rooms;
begin
  select * into v_room from public.party_rooms where code = p_code for update;
  if not found then raise exception 'no such room'; end if;
  if v_room.host_id <> v_uid or v_room.lease_expires_at < now() then raise exception 'not host'; end if;
  update public.party_rooms
    set media = p_media, play_status = 'paused', play_position_ms = 0,
        play_anchor_at = now(), seq = seq + 1,
        lease_expires_at = now() + interval '6 seconds'
    where code = p_code;
  return public.party_snapshot(p_code);
end $$;

-- Host: playback control. p_action in ('play','pause','seek','rate').
create or replace function public.party_set_playback(
  p_code text, p_action text, p_position_ms bigint default null, p_rate real default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_room public.party_rooms; v_eff bigint;
begin
  select * into v_room from public.party_rooms where code = p_code for update;
  if not found then raise exception 'no such room'; end if;
  if v_room.host_id <> v_uid or v_room.lease_expires_at < now() then raise exception 'not host'; end if;
  v_eff := public.party_effpos(v_room);

  if p_action = 'play' then
    update public.party_rooms set play_status = 'playing', play_position_ms = v_eff,
      play_anchor_at = now(), seq = seq + 1 where code = p_code;
  elsif p_action = 'pause' then
    update public.party_rooms set play_status = 'paused', play_position_ms = v_eff,
      play_anchor_at = now(), seq = seq + 1 where code = p_code;
  elsif p_action = 'seek' then
    update public.party_rooms set play_position_ms = coalesce(p_position_ms, v_eff),
      play_anchor_at = now(), seq = seq + 1 where code = p_code;
  elsif p_action = 'rate' then
    update public.party_rooms set play_rate = coalesce(p_rate, 1), play_position_ms = v_eff,
      play_anchor_at = now(), seq = seq + 1 where code = p_code;
  else raise exception 'bad action'; end if;

  update public.party_rooms set lease_expires_at = now() + interval '6 seconds'
    where code = p_code and host_id = v_uid;
  return public.party_snapshot(p_code);
end $$;

-- Election: any member may CALL this, but Postgres decides atomically (row lock
-- => exactly one winner, no split-brain). Only succeeds when no active host.
-- Bumps epoch, re-anchors playback so the timeline never stalls.
create or replace function public.party_claim_host(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_room public.party_rooms;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select * into v_room from public.party_rooms where code = p_code for update;
  if not found then raise exception 'no such room'; end if;
  if v_room.host_id is not null and v_room.lease_expires_at >= now() and v_room.host_id <> v_uid then
    raise exception 'host active';
  end if;
  if not exists (select 1 from public.party_members where room_code = p_code and user_id = v_uid) then
    raise exception 'not a member';
  end if;

  update public.party_rooms
    set host_id = v_uid, epoch = epoch + 1, seq = seq + 1,
        lease_expires_at = now() + interval '6 seconds',
        play_position_ms = public.party_effpos(v_room), play_anchor_at = now()
    where code = p_code;
  update public.party_members set role = 'guest'
    where room_code = p_code and role = 'host' and user_id <> v_uid;
  update public.party_members set role = 'host', last_seen_at = now()
    where room_code = p_code and user_id = v_uid;
  return public.party_snapshot(p_code);
end $$;

-- Host: hand control to a specific member (atomic, epoch bump, re-anchor).
create or replace function public.party_transfer_host(p_code text, p_target uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_room public.party_rooms;
begin
  select * into v_room from public.party_rooms where code = p_code for update;
  if not found then raise exception 'no such room'; end if;
  if v_room.host_id <> v_uid or v_room.lease_expires_at < now() then raise exception 'not host'; end if;
  if not exists (select 1 from public.party_members where room_code = p_code and user_id = p_target) then
    raise exception 'target not a member'; end if;

  update public.party_rooms
    set host_id = p_target, epoch = epoch + 1, seq = seq + 1,
        lease_expires_at = now() + interval '6 seconds',
        play_position_ms = public.party_effpos(v_room), play_anchor_at = now()
    where code = p_code;
  update public.party_members set role = 'guest' where room_code = p_code and role = 'host';
  update public.party_members set role = 'host'  where room_code = p_code and user_id = p_target;
  return public.party_snapshot(p_code);
end $$;

-- Leave: drop membership. If the caller was host, release the room for election.
create or replace function public.party_leave(p_code text)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_room public.party_rooms;
begin
  select * into v_room from public.party_rooms where code = p_code for update;
  if not found then return; end if;
  delete from public.party_members where room_code = p_code and user_id = v_uid;
  if v_room.host_id = v_uid then
    update public.party_rooms set host_id = null, lease_expires_at = null where code = p_code;
  end if;
end $$;

-- ---------- realtime (transport) --------------------------------------------
-- Add tables to the Realtime publication; swallow "already added" on re-run.
do $$ begin alter publication supabase_realtime add table public.party_rooms;
  exception when others then null; end $$;
do $$ begin alter publication supabase_realtime add table public.party_members;
  exception when others then null; end $$;

-- ---------- grants ----------------------------------------------------------
grant execute on function
  public.party_server_time(),
  public.party_is_member(text, uuid),
  public.party_snapshot(text),
  public.party_create(text, text, text, jsonb),
  public.party_join(text, text, text),
  public.party_renew_lease(text),
  public.party_set_media(text, jsonb),
  public.party_set_playback(text, text, bigint, real),
  public.party_claim_host(text),
  public.party_transfer_host(text, uuid),
  public.party_leave(text)
to authenticated;

-- ---------- hardening: clients read-only; RPCs are authenticated-only -------
-- Direct table writes are already denied by RLS (no write policies); revoke the
-- privileges too (defense-in-depth). Reads: authenticated only (RLS restricts to
-- members). Remove the default PUBLIC execute so anon can't reach the RPCs.
revoke insert, update, delete, truncate, references, trigger
  on public.party_rooms, public.party_members from anon, authenticated;
revoke select on public.party_rooms, public.party_members from anon;
revoke execute on function
  public.party_server_time(),
  public.party_is_member(text, uuid),
  public.party_snapshot(text),
  public.party_create(text, text, text, jsonb),
  public.party_join(text, text, text),
  public.party_renew_lease(text),
  public.party_set_media(text, jsonb),
  public.party_set_playback(text, text, bigint, real),
  public.party_claim_host(text),
  public.party_transfer_host(text, uuid),
  public.party_leave(text)
from public, anon;
