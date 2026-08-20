-- Full-dynamic playback shape: the app builds embed URLs from url_movie/url_tv
-- and gates WebView navigation with allowed_domain + hijack.navHosts. The app
-- has NO baked-in fallback, so these columns are the sole runtime source.
alter table public.providers
  add column if not exists url_movie text,
  add column if not exists url_tv text,
  add column if not exists allowed_domain text,
  add column if not exists hijack jsonb not null default '{"supported":false}'::jsonb;

-- url_template was NOT NULL for the old marketing shape; playback rows key on
-- url_movie/url_tv now, so relax it (legacy column kept for back-compat).
alter table public.providers alter column url_template drop not null;
