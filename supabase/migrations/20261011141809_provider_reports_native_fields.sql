-- Phase 1B telemetry (spec §5.7): which lane played, where it got to, and time to first frame.
-- Nullable and additive: older apps keep inserting without them.
alter table public.provider_reports
  add column if not exists lane text check (lane in ('native', 'embed')),
  add column if not exists stage text check (stage in ('load', 'bind', 'first_frame', 'playing')),
  add column if not exists ttff_ms integer check (ttff_ms >= 0);
