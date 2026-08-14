-- ============================================================================
-- Regression fix for 0005: requiring membership to reclaim a room broke the
-- legitimate reconnect case — party_leave deletes the leaver's membership AND
-- clears host_id, so a host who left (or whose client remounted / Fast-Refreshed)
-- couldn't rejoin their OWN room by code and hit 'room in use'.
--
-- Allow the original CREATOR (`created_by`) to reclaim a FREE host slot (host
-- absent or lease lapsed), in addition to members. Safe: an attacker is neither
-- the creator nor a member (so the 0005 access/password bypass stays closed),
-- and an actively-hosted room (live lease held by someone else) is never seized.
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
           and (party_rooms.created_by = v_uid
                or exists (select 1 from public.party_members m
                           where m.room_code = p_code and m.user_id = v_uid)))
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

grant execute on function public.party_create(text, text, text, jsonb) to authenticated;
revoke execute on function public.party_create(text, text, text, jsonb) from public, anon;
