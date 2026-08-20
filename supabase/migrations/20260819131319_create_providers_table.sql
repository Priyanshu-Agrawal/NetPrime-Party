-- Providers registry (initial). Superseded shape — see the follow-up migration
-- 20260820055924 which adds the full-dynamic playback columns.
create table if not exists public.providers (
  id text primary key,
  name text not null,
  enabled boolean not null default true,
  unstable boolean not null default false,
  url_template text not null,
  requires_client_sniff boolean not null default false,
  capabilities jsonb not null default '{}'::jsonb,
  priority integer not null,
  user_description text,
  dev_description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists providers_priority_idx on public.providers (priority);
create index if not exists providers_enabled_idx on public.providers (enabled);

alter table public.providers enable row level security;

-- Public read; writes require the service role (RLS default-deny). The WebView
-- nav-security data lives here, so it must never be viewer-writable.
drop policy if exists "providers_read_all" on public.providers;
create policy "providers_read_all" on public.providers
  for select using (true);
