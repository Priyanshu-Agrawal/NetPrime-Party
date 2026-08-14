-- ============================================================================
-- Fix: pgcrypto lives in the `extensions` schema on Supabase, but the party
-- functions pin `search_path = public`, so bare crypt()/gen_salt() fail at call
-- time with "function gen_salt(unknown) does not exist". Schema-qualify the
-- pgcrypto calls in party_join (verify) and party_set_config (hash).
-- Recreates both functions; nothing else changes.
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

  return public.party_snapshot(p_code);
end $$;

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
      update public.party_rooms set password_hash = extensions.crypt(p_password, extensions.gen_salt('bf')) where code = p_code;
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

grant execute on function
  public.party_join(text, text, text, text),
  public.party_set_config(text, jsonb, text)
to authenticated;
revoke execute on function
  public.party_join(text, text, text, text),
  public.party_set_config(text, jsonb, text)
from public, anon;
