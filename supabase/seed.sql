-- =============================================================================
-- providers seed — SNAPSHOT as of 2026-08-20 (14 rows, generated from the app's
-- providers.json + HIJACK_CAPS, then confirmed against production).
--
-- ⚠️  DOMAIN ROT: this is a POINT-IN-TIME snapshot, NOT the source of truth.
--    Production Supabase is the truth. Streaming domains WILL be seized/rotated
--    (e.g. vidsrc.to → vidsrc.cc) within months, so this file goes stale.
--    Do NOT trust it for anything beyond spinning up a local dev DB.
--
--    To refresh from production (do this whenever you change a domain in prod):
--        supabase db dump --data-only --table public.providers -f supabase/seed.sql
--    (prod is the truth → dump it; never hand-edit domains here and hope you
--     remember to also change prod.)
-- =============================================================================
delete from public.providers;
insert into public.providers
  (id, name, enabled, unstable, priority,
   url_movie, url_tv, allowed_domain, hijack,
   url_template, requires_client_sniff, capabilities)
values
  ('videasy', 'NetPrime', true, false, 1, 'https://player.videasy.to/movie/${id}', 'https://player.videasy.to/tv/${id}/${season}/${episode}', 'https://player.videasy.to', '{"supported":true,"videoLocation":"top","navHosts":["player.videasy.to","player.videasy.net","videasy.to","videasy.net"],"notes":"NetPrime. Top-doc video created after a user gesture; the bridge polls, so it binds once play is tapped."}'::jsonb, 'https://player.videasy.to/movie/${id}', true, '{"watchParty":true,"pip":true}'::jsonb),
  ('vsembed.ru', 'VidSrc', true, false, 2, 'https://vsembed.ru/embed/movie?tmdb=${id}', 'https://vidsrc.cc/embed/tv?tmdb=${id}&s=${season}&e=${episode}', 'https://vidsrc.ru', '{"supported":false}'::jsonb, 'https://vsembed.ru/embed/movie?tmdb=${id}', false, '{"watchParty":false,"pip":true}'::jsonb),
  ('vidsrccc2', 'Netflix', true, false, 3, 'https://vidsrc.cc/v2/embed/movie/${id}', 'https://vidsrc.cc/v2/embed/tv/${id}/${season}/${episode}', 'https://vidsrc.cc', '{"supported":false}'::jsonb, 'https://vidsrc.cc/v2/embed/movie/${id}', false, '{"watchParty":false,"pip":true}'::jsonb),
  ('vidsrcvip2', 'Amazon', true, false, 4, 'https://vsembed.su/embed/movie/${id}', 'https://vidsrc.vip/embed/tv/${id}/${season}/${episode}', 'https://vsembed.su', '{"supported":false}'::jsonb, 'https://vsembed.su/embed/movie/${id}', false, '{"watchParty":false,"pip":true}'::jsonb),
  ('multiembed', 'MultiEmbed', true, false, 5, 'https://multiembed.mov/?video_id=${id}&tmdb=1', 'https://multiembed.mov/?video_id=${id}&tmdb=1&s=${season}&e=${episode}', 'https://streamingnow.mov/', '{"supported":false,"notes":"nested cross-origin iframes → video unreachable; ad-heavy"}'::jsonb, 'https://multiembed.mov/?video_id=${id}&tmdb=1', false, '{"watchParty":false,"pip":true}'::jsonb),
  ('vidsrcTo', 'VidSrc.To', true, false, 6, 'https://vidsrc.to/embed/movie/${id}', 'https://vidsrc.to/embed/tv/${id}/${season}/${episode}', 'https://vidsrc.su', '{"supported":false,"notes":"video in cross-origin vsembed.ru iframe"}'::jsonb, 'https://vidsrc.to/embed/movie/${id}', false, '{"watchParty":false,"pip":true}'::jsonb),
  ('vidfast', 'VidFast', true, false, 7, 'https://vidfast.pro/movie/${id}', 'https://vidfast.pro/tv/${id}/${season}/${episode}', 'https://vidfast.pro', '{"supported":true,"videoLocation":"top","navHosts":["vidfast.pro","vidfast.vc","vidfast.to","vidfast.net"],"autoplayParam":"autoPlay=false","notes":"top-doc video; verified live on device; advertises watch-party. redirects pro→vc"}'::jsonb, 'https://vidfast.pro/movie/${id}', true, '{"watchParty":true,"pip":true}'::jsonb),
  ('vixsrc', 'VixSrc', true, false, 8, 'https://vixsrc.to/movie/${id}', 'https://vixsrc.to/tv/${id}/${season}/${episode}', 'https://vixsrc.to', '{"supported":true,"videoLocation":"same-origin-iframe","navHosts":["vixsrc.to"],"autoplayParam":"autoplay=false","notes":"video in same-origin vixsrc.to/embed iframe (bridge walks in); deep catalog"}'::jsonb, 'https://vixsrc.to/movie/${id}', true, '{"watchParty":true,"pip":true}'::jsonb),
  ('vidlink', 'VidLink', true, false, 9, 'https://vidlink.pro/movie/${id}', 'https://vidlink.pro/tv/${id}/${season}/${episode}', 'https://vidlink.pro', '{"supported":true,"videoLocation":"top","navHosts":["vidlink.pro"],"autoplayParam":"autoplay=false","notes":"top-doc video; thinner catalog"}'::jsonb, 'https://vidlink.pro/movie/${id}', true, '{"watchParty":true,"pip":true}'::jsonb),
  ('vidcore', 'VidCore', true, false, 10, 'https://vidcore.org/embed/movie/${id}', 'https://vidcore.org/embed/tv/${id}/${season}/${episode}', 'https://vidcore.org', '{"supported":true,"videoLocation":"top","navHosts":["vidcore.org"],"autoplayParam":"autoPlay=false","notes":"clean single-player, rich params, 4K"}'::jsonb, 'https://vidcore.org/embed/movie/${id}', true, '{"watchParty":true,"pip":true}'::jsonb),
  ('111movies', '111Movies', true, true, 11, 'https://111movies.com/movie/${id}', 'https://111movies.com/tv/${id}/${season}/${episode}', 'https://111movies.com', '{"supported":true,"videoLocation":"top","navHosts":["111movies.com","111movies.net","vidlove.cc"],"unstable":true,"notes":"hijackable BUT has its own internal server picker (Golem/Archer Queen/… — several OFFLINE); streams flaky per-title → unreliable for sync."}'::jsonb, 'https://111movies.com/movie/${id}', true, '{"watchParty":true,"pip":true}'::jsonb),
  ('vidnest', 'VidNest', true, false, 12, 'https://vidnest.fun/movie/${id}', 'https://vidnest.fun/tv/${id}/${season}/${episode}', 'https://vidnest.fun', '{"supported":true,"videoLocation":"top","navHosts":["vidnest.fun"],"notes":"top-doc video; movie/tv/anime"}'::jsonb, 'https://vidnest.fun/movie/${id}', true, '{"watchParty":true,"pip":true}'::jsonb),
  ('vidphantom', 'VidPhantom', true, false, 13, 'https://vidphantom.com/movie/${id}', 'https://vidphantom.com/tv/${id}/${season}/${episode}', 'https://vidphantom.com', '{"supported":true,"videoLocation":"top","navHosts":["vidphantom.com"],"notes":"top-doc video"}'::jsonb, 'https://vidphantom.com/movie/${id}', true, '{"watchParty":true,"pip":true}'::jsonb),
  ('mycineby', 'MyCineBy', true, false, 14, 'https://mycineby.cc/embed/movie/${id}', 'https://mycineby.cc/embed/tv/${id}/${season}/${episode}', 'https://mycineby.cc', '{"supported":true,"videoLocation":"top","navHosts":["mycineby.cc"],"notes":"MyCineBy player, top-doc video"}'::jsonb, 'https://mycineby.cc/embed/movie/${id}', true, '{"watchParty":true,"pip":true}'::jsonb);
