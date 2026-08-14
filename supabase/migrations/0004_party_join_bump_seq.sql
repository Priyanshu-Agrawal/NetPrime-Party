-- ============================================================================
-- Make party_join bump seq + re-anchor for a NEW membership, so a join fans out
-- as STRICTLY-NEWER than any prior host lease-heartbeat. Without this, the host's
-- pre-join heartbeat (equal seq, member list lacking the new guest) is applied by
-- the guest via the `>=` newest-wins rule and momentarily drops the guest from
-- the member list — which the kicked-detection could read as a removal.
-- Re-anchor keeps the effective timeline position identical (same pattern as
-- party_claim_host / party_transfer_host). Re-joins + heartbeats don't bump.
-- ============================================================================

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
    'canChat', true, 'canQueue', false, 'canVote', true);

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

grant execute on function public.party_join(text, text, text, text) to authenticated;
revoke execute on function public.party_join(text, text, text, text) from public, anon;
