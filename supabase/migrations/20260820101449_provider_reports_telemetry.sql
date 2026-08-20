-- Provider failure/success telemetry (Phase 7). Service-role-only: RLS on with
-- NO policies, so clients can never read/write directly — every write goes
-- through the rate-limited worker /report route (anti-poisoning).
create table if not exists public.provider_reports (
  id bigint generated always as identity primary key,
  provider_id text not null,
  tmdb_id text not null,
  media_type text not null check (media_type in ('movie','tv')),
  outcome text not null check (outcome in (
    'success','no_bind','http_error','render_crash',
    'captcha_block','playback_stall','not_found','manual_switch'
  )),
  time_to_fail_ms integer,
  script_version text,
  platform text not null check (platform in ('ios','android','web')),
  app_version text,
  error_message text,        -- untrusted, capped client-side
  country text,              -- server-derived from CF (never trust client)
  client_hash text,          -- hashed IP, for distinct-client weighting (not raw IP)
  created_at timestamptz not null default now()
);
create index if not exists provider_reports_provider_time_idx
  on public.provider_reports (provider_id, created_at desc);
create index if not exists provider_reports_title_idx
  on public.provider_reports (provider_id, tmdb_id);

alter table public.provider_reports enable row level security;
-- Intentionally NO policies → only the service role (worker) can touch it.

-- Rolling 24h health per provider. Failure RATE (not raw count) with success as
-- the denominator, weighted by DISTINCT clients so one spammer can't tank a
-- provider. not_found / manual_switch excluded from the health numerator
-- (per-title catalog gaps / weak signals), surfaced separately.
create or replace view public.provider_health as
select
  provider_id,
  count(*) filter (where outcome = 'success') as successes,
  count(*) filter (where outcome in
    ('no_bind','http_error','render_crash','captcha_block','playback_stall')) as hard_failures,
  count(*) filter (where outcome = 'not_found') as not_found_count,
  count(distinct client_hash) as distinct_clients,
  round(
    count(*) filter (where outcome in
      ('no_bind','http_error','render_crash','captcha_block','playback_stall'))::numeric
    / nullif(count(*) filter (where outcome in
      ('success','no_bind','http_error','render_crash','captcha_block','playback_stall')), 0),
    3
  ) as failure_rate,
  max(created_at) as last_report
from public.provider_reports
where created_at > now() - interval '24 hours'
group by provider_id;
