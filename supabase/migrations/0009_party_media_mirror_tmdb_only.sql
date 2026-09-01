-- ============================================================================
-- Fix: the media mirror must only describe what the EMBED lane can play.
--
-- 0008's party_media_of_item mirrored `plugin` refs into a PartyMedia too. But a
-- plugin ref carries `pluginId`, not `providerId` — so the mirror came out with
-- no providerId, and every current client gates playback on
-- `!!(providerId && media)`. The result was a room holding a queue whose current
-- item produced media the client could not play AND could not recognise as
-- absent: the party screen fell through to its empty state and claimed "nothing
-- queued" while items sat in the queue.
--
-- `media` exists for exactly one reason — to let a client that knows nothing
-- about queues keep working. A source that lane cannot play must mirror to NULL,
-- the same as `direct` and `youtube`. When P3 lands and plugin playback exists,
-- it will read `queue`/`currentItemId` directly, not this mirror.
--
-- Found end-to-end: queued a plugin item on a live room and watched the client
-- report an empty queue.
-- ============================================================================

create or replace function public.party_media_of_item(p_item jsonb)
returns jsonb language sql immutable set search_path = public as $$
  select case
    when p_item is null then null
    -- tmdb ONLY: the embed lane is the only thing `media` can describe.
    when coalesce(p_item->'ref'->>'source', 'tmdb') = 'tmdb' then
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

revoke execute on function public.party_media_of_item(jsonb) from public, anon;
