-- ============================================================================
-- SECURITY: party_create's ON CONFLICT reclaim path checked neither membership
-- nor access/password, so a non-member who knows the room code could seize host
-- of a locked/private/password room during a >6s host-lease gap — bypassing the
-- bcrypt password + access mode entirely. Require membership to RECLAIM an
-- existing room. A brand-new room still creates via the plain INSERT; the
-- original host reclaims via `host_id = v_uid`. Everyone else must go through
-- party_join, which enforces access + password.
--
-- Also: party_claim_host (the open failover election) now requires `approved`,
-- matching party_grab_control — an unapproved guest (approveGuests room) must
-- not seize host when the lease lapses.
-- ============================================================================

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
        play_position_ms = public.party_effpos(party_rooms),
        play_anchor_at   = now()
    where party_rooms.host_id = v_uid
       or ((party_rooms.host_id is null or party_rooms.lease_expires_at < now())
           and exists (select 1 from public.party_members m
                       where m.room_code = p_code and m.user_id = v_uid))
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
  if not exists (select 1 from public.party_members
                 where room_code = p_code and user_id = v_uid and approved) then
    raise exception 'not an approved member';
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

grant execute on function public.party_create(text, text, text, jsonb),
                          public.party_claim_host(text) to authenticated;
revoke execute on function public.party_create(text, text, text, jsonb),
                           public.party_claim_host(text) from public, anon;
