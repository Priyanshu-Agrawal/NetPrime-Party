\pset pager off
\set QUIET on
\echo '=== 1  guest WITHOUT canQueue is refused'
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select public.party_create('AAAA','inst-h','Host') is not null as room_created;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select public.party_join('AAAA','inst-g','Guest') is not null as guest_joined;
do $$ begin
  perform public.party_queue_add('AAAA','[{"ref":{"source":"tmdb","tmdbId":"9","type":"movie"}}]');
  raise notice '!! FAIL: guest add allowed';
exception when others then raise notice 'PASS guest blocked (%)', sqlerrm; end $$;

\echo '=== 2  cap is enforced at 100'
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select jsonb_array_length(public.party_queue_add('AAAA', (
  select jsonb_agg(jsonb_build_object('ref', jsonb_build_object(
    'source','tmdb','tmdbId', g::text, 'type','movie')))
  from generate_series(1,100) g))->'queue') as filled_to_100;
do $$ begin
  perform public.party_queue_add('AAAA','[{"ref":{"source":"tmdb","tmdbId":"99999","type":"movie"}}]');
  raise notice '!! FAIL: 101st item accepted';
exception when others then raise notice 'PASS cap enforced (%)', sqlerrm; end $$;
select jsonb_array_length(queue) as still_100 from public.party_rooms where code='AAAA';

\echo '=== 3  remove the current item AND every successor -> room idles, no infinite loop'
select public.party_create('CCCC','i','H') is not null as ok;
select public.party_queue_add('CCCC', jsonb_build_array(
  jsonb_build_object('ref', jsonb_build_object('source','tmdb','tmdbId','1','type','movie')),
  jsonb_build_object('ref', jsonb_build_object('source','tmdb','tmdbId','2','type','movie')),
  jsonb_build_object('ref', jsonb_build_object('source','tmdb','tmdbId','3','type','movie')))) is not null as added3;
select queue_current_id as current_is_1 from public.party_rooms where code='CCCC';
select public.party_queue_remove('CCCC', array['movie:1','movie:2','movie:3']) is not null as removed_all;
select queue_current_id is null as current_null, media is null as media_null,
       jsonb_array_length(queue) as len, play_status, play_position_ms
  from public.party_rooms where code='CCCC';

\echo '=== 4  remove current + its immediate successor -> lands on the SECOND successor'
select public.party_queue_add('CCCC', jsonb_build_array(
  jsonb_build_object('ref', jsonb_build_object('source','tmdb','tmdbId','10','type','movie')),
  jsonb_build_object('ref', jsonb_build_object('source','tmdb','tmdbId','11','type','movie')),
  jsonb_build_object('ref', jsonb_build_object('source','tmdb','tmdbId','12','type','movie')))) is not null as refilled;
select public.party_queue_remove('CCCC', array['movie:10','movie:11']) is not null as removed_two;
select queue_current_id as should_be_movie_12, media->>'tmdbId' as media_mirror
  from public.party_rooms where code='CCCC';

\echo '=== 5  reason=skipped leaves the item replayable (status stays queued)'
select public.party_queue_add('CCCC', jsonb_build_array(
  jsonb_build_object('ref', jsonb_build_object('source','tmdb','tmdbId','13','type','movie')))) is not null as added13;
select public.party_queue_advance('CCCC','movie:12','skipped') is not null as skipped;
select queue_current_id,
       (select el->>'status' from jsonb_array_elements(queue) el where el->>'id'='movie:12') as skipped_status
  from public.party_rooms where code='CCCC';

\echo '=== 6  reason=failed marks failed and advance never returns to it'
select public.party_queue_advance('CCCC','movie:13','failed') is not null as failed;
select queue_current_id as current_after_fail,
       (select el->>'status' from jsonb_array_elements(queue) el where el->>'id'='movie:13') as st13
  from public.party_rooms where code='CCCC';
do $$ begin perform public.party_queue_advance('CCCC', null, 'ended'); end $$;
select queue_current_id as still_not_13 from public.party_rooms where code='CCCC';

\echo '=== 7  bad reason / bad scope are rejected'
do $$ begin perform public.party_queue_advance('CCCC', null, 'lolwut');
  raise notice '!! FAIL: bad reason accepted';
exception when others then raise notice 'PASS bad reason (%)', sqlerrm; end $$;
do $$ begin perform public.party_queue_clear('CCCC','everything');
  raise notice '!! FAIL: bad scope accepted';
exception when others then raise notice 'PASS bad scope (%)', sqlerrm; end $$;

\echo '=== 8  a guest may not move/set_current/advance/clear even WITH canQueue'
select public.party_join('CCCC','i2','G2') is not null as x;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select public.party_set_permissions('CCCC','22222222-2222-2222-2222-222222222222','{"canQueue":true}') is not null as granted;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
do $$ declare n text; begin
  foreach n in array array['set_current','advance','clear'] loop
    begin
      if n='set_current' then perform public.party_queue_set_current('CCCC','movie:12');
      elsif n='advance'  then perform public.party_queue_advance('CCCC', null, 'ended');
      else                    perform public.party_queue_clear('CCCC','all'); end if;
      raise notice '!! FAIL: guest % allowed', n;
    exception when others then raise notice 'PASS guest % blocked (%)', n, sqlerrm; end;
  end loop;
end $$;

\echo '=== 9  a host whose LEASE HAS LAPSED cannot mutate the queue'
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
update public.party_rooms set lease_expires_at = now() - interval '1 minute' where code='CCCC';
do $$ begin perform public.party_queue_move('CCCC','movie:12',0);
  raise notice '!! FAIL: expired-lease host allowed';
exception when others then raise notice 'PASS expired lease blocked (%)', sqlerrm; end $$;

\echo '=== 10 snapshot shape'
update public.party_rooms set lease_expires_at = now() + interval '6 seconds' where code='CCCC';
select jsonb_pretty(public.party_snapshot('CCCC') - 'members' - 'queue') as snapshot_minus_bulk;
select (public.party_snapshot('CCCC') ? 'queue') as has_queue,
       (public.party_snapshot('CCCC') ? 'currentItemId') as has_current,
       (public.party_snapshot('CCCC') ? 'queueRev') as has_rev,
       (public.party_snapshot('CCCC')->'members'->0 ? 'approved') as members_still_have_approved;
select public.party_default_config()->>'guestQueueDefault' as guest_queue_default,
       public.party_default_config()->>'approveGuests' as approve_guests_preserved;

\echo '=== 11 realtime payload size at the 100-item cap'
select pg_size_pretty(length(public.party_snapshot('AAAA')::text)::bigint) as snapshot_bytes;

\echo '=== 12 backfill: a pre-0008 room (media set, queue empty) becomes a 1-item queue'
\echo '        without touching seq or the playback anchor'
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select public.party_create('OLDR','i','H') is not null as ok;
select public.party_set_media('OLDR','{"tmdbId":"42","type":"tv","season":3,"episode":7,"title":"Legacy Show"}') is not null as legacy_media;
-- simulate the pre-migration state, then replay 0008's backfill statement verbatim
update public.party_rooms set queue='[]'::jsonb, queue_current_id=null where code='OLDR';
select seq as seq_before, play_position_ms as pos_before from public.party_rooms where code='OLDR' \gset
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
select queue_current_id, jsonb_array_length(queue) as len,
       seq = :seq_before as seq_untouched, play_position_ms = :pos_before as anchor_untouched,
       (queue->0->>'title') as title_carried
  from public.party_rooms where code='OLDR';
do $$ declare v record; begin
  select * into v from public.party_rooms where code='OLDR';
  if v.queue_current_id <> 'tv:42:3:7' then raise notice '!! FAIL: backfill id % ', v.queue_current_id;
  else raise notice 'PASS backfill id + seq/anchor untouched'; end if;
end $$;

\echo '=== 13 config.guestQueueDefault is honoured by party_join (not an inert knob)'
select public.party_create('DFLT','i','H') is not null as ok;
set request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';
select public.party_join('DFLT','i','G') is not null as joined;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select public.party_create('OPNQ','i','H') is not null as ok;
select public.party_set_config('OPNQ','{"guestQueueDefault":true}') is not null as configured;
set request.jwt.claim.sub = '55555555-5555-5555-5555-555555555555';
select public.party_join('OPNQ','i','G5') is not null as joined;
do $$ declare a boolean; b boolean; begin
  select (permissions->>'canQueue')::boolean into a from public.party_members
    where room_code='DFLT' and user_id='44444444-4444-4444-4444-444444444444';
  select (permissions->>'canQueue')::boolean into b from public.party_members
    where room_code='OPNQ' and user_id='55555555-5555-5555-5555-555555555555';
  if a = false and b = true then raise notice 'PASS guestQueueDefault off=% on=%', a, b;
  else raise notice '!! FAIL guestQueueDefault off=% on=%', a, b; end if;
end $$;
-- and the granted guest can actually add
select public.party_queue_add('OPNQ','[{"ref":{"source":"tmdb","tmdbId":"5","type":"movie"}}]') is not null as guest_add_works;
