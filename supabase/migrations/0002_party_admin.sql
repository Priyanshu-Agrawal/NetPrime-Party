-- ============================================================================
-- Watch-party ADMIN — room administration on top of 0001_party_core.
--
-- Adds host-controlled, server-enforced: access modes (open/locked/private/
-- password, password hashed with pgcrypto/bcrypt), room toggles (chat, reactions
-- /gifs, guest-control default, approve-before-join), kick, per-member
-- permissions, join approval, and a guest "take control" path (allowed only when
-- the host has opted in via guestControlDefault). Same invariants as 0001:
-- Postgres is the single authority (SELECT ... FOR UPDATE in SECURITY DEFINER
-- RPCs); admin mutations bump seq + re-anchor so the change fans out newest-wins
-- without stalling the timeline.
--
-- APPLY: Supabase SQL Editor -> paste -> Run. Additive + idempotent-ish.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------- new columns (additive) ------------------------------------------
alter table public.party_rooms   add column if not exists password_hash text;
alter table public.party_members add column if not exists approved boolean not null default true;

-- ---------- config default now carries approveGuests ------------------------
create or replace function public.party_default_config()
returns jsonb language sql immutable set search_path = public as $$
  select jsonb_build_object('access','open','passwordRequired',false,'chatEnabled',true,
    'gifsEnabled',true,'queueEnabled',true,'pollsEnabled',true,'guestControlDefault',false,
    'approveGuests',false);
$$;

-- ---------- snapshot: expose per-member `approved` --------------------------
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
        'role', m.role, 'permissions', m.permissions, 'approved', m.approved,
        'joinedAt', (extract(epoch from m.joined_at) * 1000)::bigint,
        'connected', (m.last_seen_at > now() - interval '15 seconds')
      ) order by m.joined_at) from public.party_members m where m.room_code = p_code), '[]'::jsonb),
    'serverTimeMs', (extract(epoch from now()) * 1000)::bigint
  )
  from public.party_rooms r where r.code = p_code;
$$;

-- ---------- join: password + access enforcement + approval ------------------
-- The 3-arg join is replaced by a 4-arg (adds p_password); drop the old overload
-- so the client can't accidentally bypass enforcement via the shorter signature.
drop function if exists public.party_join(text, text, text);

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
         or v_room.password_hash <> crypt(p_password, v_room.password_hash) then
        raise exception 'bad password';
      end if;
    end if;
  end if;

  -- New guests join un-approved when the host gates entry; existing members keep in.
  v_approved := not (not v_is_member
                     and coalesce((v_room.config->>'approveGuests')::boolean, false));

  v_perms := jsonb_build_object(
    'canControlPlayback', coalesce((v_room.config->>'guestControlDefault')::boolean, false),
    'canChat', true, 'canQueue', false, 'canVote', true);

  insert into public.party_members (room_code, user_id, installation_id, display_name, role, permissions, approved)
    values (p_code, v_uid, p_installation_id, p_display_name, 'guest', v_perms, v_approved)
  on conflict (room_code, user_id) do update
    set display_name = excluded.display_name,
        installation_id = excluded.installation_id, last_seen_at = now();

  return public.party_snapshot(p_code);
end $$;

-- ---------- host: patch room config (+ optional password) -------------------
create or replace function public.party_set_config(
  p_code text, p_patch jsonb, p_password text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_room public.party_rooms; v_config jsonb; v_access text;
begin
  select * into v_room from public.party_rooms where code = p_code for update;
  if not found then raise exception 'no such room'; end if;
  if v_room.host_id <> v_uid or v_room.lease_expires_at < now() then raise exception 'not host'; end if;

  v_config := v_room.config || coalesce(p_patch, '{}'::jsonb);
  v_access := coalesce(v_config->>'access', 'open');

  if v_access = 'password' then
    if p_password is not null and length(p_password) > 0 then
      update public.party_rooms set password_hash = crypt(p_password, gen_salt('bf')) where code = p_code;
      v_config := jsonb_set(v_config, '{passwordRequired}', 'true'::jsonb);
    elsif v_room.password_hash is null then
      raise exception 'password required';
    else
      v_config := jsonb_set(v_config, '{passwordRequired}', 'true'::jsonb);
    end if;
  else
    update public.party_rooms set password_hash = null where code = p_code;
    v_config := jsonb_set(v_config, '{passwordRequired}', 'false'::jsonb);
  end if;

  update public.party_rooms
    set config = v_config, seq = seq + 1,
        play_position_ms = public.party_effpos(v_room), play_anchor_at = now(),
        lease_expires_at = now() + interval '6 seconds'
    where code = p_code;
  return public.party_snapshot(p_code);
end $$;

-- ---------- host: remove a member -------------------------------------------
create or replace function public.party_kick(p_code text, p_target uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_room public.party_rooms;
begin
  select * into v_room from public.party_rooms where code = p_code for update;
  if not found then raise exception 'no such room'; end if;
  if v_room.host_id <> v_uid or v_room.lease_expires_at < now() then raise exception 'not host'; end if;
  if p_target = v_uid then raise exception 'cannot kick self'; end if;

  delete from public.party_members where room_code = p_code and user_id = p_target;
  update public.party_rooms
    set seq = seq + 1, play_position_ms = public.party_effpos(v_room), play_anchor_at = now(),
        lease_expires_at = now() + interval '6 seconds'
    where code = p_code;
  return public.party_snapshot(p_code);
end $$;

-- ---------- host: patch a member's permissions ------------------------------
create or replace function public.party_set_permissions(p_code text, p_target uuid, p_patch jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_room public.party_rooms;
begin
  select * into v_room from public.party_rooms where code = p_code for update;
  if not found then raise exception 'no such room'; end if;
  if v_room.host_id <> v_uid or v_room.lease_expires_at < now() then raise exception 'not host'; end if;

  update public.party_members
    set permissions = permissions || coalesce(p_patch, '{}'::jsonb)
    where room_code = p_code and user_id = p_target;
  update public.party_rooms
    set seq = seq + 1, play_position_ms = public.party_effpos(v_room), play_anchor_at = now(),
        lease_expires_at = now() + interval '6 seconds'
    where code = p_code;
  return public.party_snapshot(p_code);
end $$;

-- ---------- host: approve a pending guest -----------------------------------
create or replace function public.party_approve_member(p_code text, p_target uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_room public.party_rooms;
begin
  select * into v_room from public.party_rooms where code = p_code for update;
  if not found then raise exception 'no such room'; end if;
  if v_room.host_id <> v_uid or v_room.lease_expires_at < now() then raise exception 'not host'; end if;

  update public.party_members set approved = true where room_code = p_code and user_id = p_target;
  update public.party_rooms
    set seq = seq + 1, play_position_ms = public.party_effpos(v_room), play_anchor_at = now(),
        lease_expires_at = now() + interval '6 seconds'
    where code = p_code;
  return public.party_snapshot(p_code);
end $$;

-- ---------- guest: take control (only when the host opted in) ---------------
-- A clean, single-authority takeover: identical to a transfer, but guest-
-- initiated and gated on config.guestControlDefault. Bumps epoch + re-anchors.
create or replace function public.party_grab_control(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_room public.party_rooms;
begin
  select * into v_room from public.party_rooms where code = p_code for update;
  if not found then raise exception 'no such room'; end if;
  if not coalesce((v_room.config->>'guestControlDefault')::boolean, false) then
    raise exception 'guest control disabled';
  end if;
  if not exists (select 1 from public.party_members
                 where room_code = p_code and user_id = v_uid and approved) then
    raise exception 'not an approved member';
  end if;

  update public.party_rooms
    set host_id = v_uid, epoch = epoch + 1, seq = seq + 1,
        lease_expires_at = now() + interval '6 seconds',
        play_position_ms = public.party_effpos(v_room), play_anchor_at = now()
    where code = p_code;
  update public.party_members set role = 'guest' where room_code = p_code and role = 'host';
  update public.party_members set role = 'host', last_seen_at = now()
    where room_code = p_code and user_id = v_uid;
  return public.party_snapshot(p_code);
end $$;

-- ---------- grants ----------------------------------------------------------
grant execute on function
  public.party_join(text, text, text, text),
  public.party_set_config(text, jsonb, text),
  public.party_kick(text, uuid),
  public.party_set_permissions(text, uuid, jsonb),
  public.party_approve_member(text, uuid),
  public.party_grab_control(text)
to authenticated;

revoke execute on function
  public.party_join(text, text, text, text),
  public.party_set_config(text, jsonb, text),
  public.party_kick(text, uuid),
  public.party_set_permissions(text, uuid, jsonb),
  public.party_approve_member(text, uuid),
  public.party_grab_control(text)
from public, anon;
