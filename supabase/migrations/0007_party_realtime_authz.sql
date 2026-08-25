-- 0007: C1 — private watch-party Realtime channels (RLS on realtime.messages).
--
-- Until now the sync (`party:<code>`) and chat (`party-chat:<code>`) channels were
-- PUBLIC broadcast: anyone holding the anon key could subscribe to a guessed room
-- code and forge `snap` payloads (mass-hijack playback / remote-kick a member) or
-- impersonate in chat. The Postgres RPC authority was solid; the transport bypassed it.
--
-- Fix: make both channels PRIVATE (client sets `{ config: { private: true } }`) and
-- gate `realtime.messages` so only an AUTHENTICATED room MEMBER may read or send on
-- that room's topics. Membership is the existing `public.party_is_member` (SECURITY
-- DEFINER, granted to authenticated — no RLS recursion). The room code is parsed from
-- the topic with `split_part(topic, ':', 2)` (works for both `party:` and
-- `party-chat:`; codes are [A-Z2-9] with no ':').
--
-- ORDER: apply this BEFORE shipping the client that sets `private: true`. A PUBLIC
-- channel ignores realtime.messages RLS, so this migration is INERT for the current
-- client — safe to apply ahead of the app update. Rollback: drop the two policies.
--
-- Residual (tracked in docs/plans/backend-hardening.md): a legit MEMBER can still forge
-- a snapshot within their own room; fully closing that needs server-authored state
-- (postgres_changes) or RPC-stamped chat identity. This migration removes the CRITICAL
-- external-attacker vector (guess-a-code → hijack), which was the C1 severity.

create policy "party members read realtime"
  on realtime.messages
  for select
  to authenticated
  using (
    (realtime.topic() like 'party:%' or realtime.topic() like 'party-chat:%')
    and public.party_is_member(split_part(realtime.topic(), ':', 2), (select auth.uid()))
  );

create policy "party members send realtime"
  on realtime.messages
  for insert
  to authenticated
  with check (
    (realtime.topic() like 'party:%' or realtime.topic() like 'party-chat:%')
    and public.party_is_member(split_part(realtime.topic(), ':', 2), (select auth.uid()))
  );
