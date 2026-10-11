-- Operator-controlled plugin repos (spec §5.4). Read only by the worker with the service-role key:
-- RLS on and no policies, so anon/authenticated clients can neither read nor write it.
create table if not exists public.plugin_repos (
  id            text primary key check (id ~ '^[a-z0-9][a-z0-9-]{1,40}$'),
  manifest_url  text not null check (manifest_url like 'https://%'),
  version       integer not null check (version >= 1),
  files         jsonb not null default '[]'::jsonb check (jsonb_typeof(files) = 'array'),
  enabled       boolean not null default false,
  down          boolean not null default false,
  allow_plugins text[],
  note          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.plugin_repos enable row level security;
revoke all on public.plugin_repos from anon, authenticated;

comment on table public.plugin_repos is
  'Plugin repos the operator enabled. files = [{path, sha256}] relative to the manifest folder; the app runs only pinned files. down=true unloads remotely.';
