# Supabase (schema + seed)

Version-controlled database for local dev / E2E. **Production is the source of
truth** — these files are how you reproduce it locally, not a second master.

## Layout
- `migrations/` — schema changes, applied in filename order.
  - `20260819131319_create_providers_table.sql` — providers registry.
  - `20260820055924_providers_full_dynamic_playback_columns.sql` — full-dynamic
    playback columns (`url_movie`, `url_tv`, `allowed_domain`, `hijack`).
- `seed.sql` — a **dated snapshot** of the providers data (see the header + the
  domain-rot warning below).

## Spin up locally
```bash
supabase start          # boots Postgres, runs migrations/, then seed.sql
```

## ⚠️ Domain rot (read this)
Streaming domains get seized / rotated (e.g. `vidsrc.to` → `vidsrc.cc`) every few
months. Because the app is fully dynamic, you fix production instantly by editing
the Supabase row — **but `seed.sql` then goes stale.** A dev env spun up from a
stale seed will mysteriously fail to play (it's hitting dead domains).

**Rule:** treat prod as truth and refresh the seed mechanically — never hand-edit
a domain here and rely on remembering to also change prod.
```bash
supabase db dump --data-only --table public.providers -f supabase/seed.sql
```

## Completeness note
Only the two **providers** migrations are hand-committed here. The earlier
`party_*` migrations (2026-08-14) live in prod but aren't in this folder yet. To
backfill the COMPLETE tracked history, link the project and pull:
```bash
supabase link --project-ref kdcghbuknadvcmjctsqk
supabase db pull        # generates migration files for everything in prod
```
