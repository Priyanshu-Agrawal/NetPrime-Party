-- Phase 6: served injection scripts. bridge_script = compiled universal-core +
-- provider delta (the JS HijackPlayer injects); script_version = content-hash tag
-- the upload CLI stamps (powers cat-and-mouse updates + the scriptVersion telemetry
-- field). The heavy body is NEVER sent in /config (kept lean) — served via /scripts.
alter table public.providers
  add column if not exists bridge_script text,
  add column if not exists script_version text;
