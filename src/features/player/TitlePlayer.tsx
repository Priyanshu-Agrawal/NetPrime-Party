/**
 * One title's native session (spec §6.2, §6.3, §7 F4/F6):
 * - resolve the title's streams and play the best one in Bearoom's own player;
 * - switch language or source keeping the position;
 * - fail over without silence, and hand over to the web player when no native stream plays here (8 s cap).
 */
import { CandidateSheet } from "@/components/player/CandidateSheet";
import { nextEpisode } from "@/components/player/nextEpisode";
import { PlayerErrorCard } from "@/components/player/PlayerErrorCard";
import { PlayerLoadingCard } from "@/components/player/PlayerLoadingCard";
import type { PlayerNotice } from "@/components/player/PlayerToast";
import { successReport } from "@/components/player/reportFields";
import type { PlayerEvent } from "@/components/player/types";
import { resolveTitle } from "@/services/playback";
import type { PlaybackCandidate } from "@/services/playback/candidate";
import { pluginHost } from "@/services/plugins";
import { NativePlayerView } from "@/src/features/player/NativePlayerView";
import { useDetailsQuery } from "@/src/store/services/tmdbApi";
import { useReportOutcomeMutation } from "@/src/store/services/workerApi";
import type { ReportOutcome } from "@/src/types/worker.types";
import { colors, font, ms } from "@/theme/bearoom";
import { getTitleLanguage, languageOrder, resolveOrder, setTitleLanguage, titleKeyOf } from "@/utils/languagePrefs";
import { setPreferredAudio } from "@/utils/prefs";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  bestIn,
  languageOptions,
  nativeReport,
  nextAfterFailure,
  preferenceNotice,
  primaryLanguage,
  sidecarsOf,
  sourceLine,
  switchNotice,
  toNativeSource,
} from "./nativeSession";

export const RESOLVE_CAP_MS = 8000;
const DETAILS_WAIT_MS = 2000;

export interface TitlePlayerProps {
  tmdbId: string;
  type: "movie" | "tv";
  season?: number;
  episode?: number;
  title?: string;
  posterUrl?: string;
  /** When Play was pressed (epoch ms) — the TTFF baseline. */
  startedAt: number;
  /** No native stream plays here, or the user chose the web player. */
  onUseWeb: () => void;
  onClose: () => void;
  /** Go to another episode (the route re-keys and resolves again). */
  onEpisode?: (season: number, ep: number) => void;
}

interface Session {
  ranked: PlaybackCandidate[];
  current: PlaybackCandidate;
  startAt: number;
  wanted: string[];
  /** Bumps on every (re)start so the player remounts even for the same stream. */
  attempt: number;
}

type Phase = "resolving" | "playing" | "failed";

export function TitlePlayer({ tmdbId, type, season, episode, title, posterUrl, startedAt, onUseWeb, onClose, onEpisode }: TitlePlayerProps) {
  const { data: details } = useDetailsQuery({ type, id: tmdbId });
  const [reportOutcome] = useReportOutcomeMutation();
  const [detailsWaitOver, setDetailsWaitOver] = useState(false);
  const [phase, setPhase] = useState<Phase>("resolving");
  const [status, setStatus] = useState("Finding the best source…");
  const [session, setSession] = useState<Session | null>(null);
  const [notice, setNotice] = useState<PlayerNotice | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const sessionRef = useRef<Session | null>(null);
  const alive = useRef(true);
  const started = useRef(false);
  const capTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const failed = useRef(new Set<string>());
  const reResolved = useRef(new Set<string>());
  const outcomeSent = useRef(false);
  const firstProgressAt = useRef<number | null>(null);
  const lastTime = useRef<number | null>(null);
  const mountedAt = useRef(startedAt);
  const pos = useRef(0);
  const attempts = useRef(0);
  const noticeSeq = useRef(0);
  const req = useRef({ tmdbId, type });
  const titleKey = titleKeyOf(type, tmdbId);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);
  useEffect(() => {
    const wait = setTimeout(() => setDetailsWaitOver(true), DETAILS_WAIT_MS);
    return () => {
      alive.current = false;
      clearTimeout(wait);
      if (capTimer.current) clearTimeout(capTimer.current);
    };
  }, []);

  const say = useCallback((message: string, action?: PlayerNotice["action"]) => {
    setNotice({ id: ++noticeSeq.current, message, action });
  }, []);

  const report = useCallback(
    (c: PlaybackCandidate, outcome: ReportOutcome, extra?: { ttffMs?: number; timeToFailMs?: number }) => {
      void reportOutcome(nativeReport(c, req.current, outcome, extra));
    },
    [reportOutcome],
  );

  const resolve = useCallback(async () => {
    const wanted = resolveOrder(languageOrder(), details?.original_language, getTitleLanguage(titleKey));
    const runtime: number | undefined = type === "movie" ? details?.runtime : details?.episode_run_time?.[0];
    const r = await resolveTitle(
      {
        tmdbId,
        type,
        season,
        episode,
        titleName: details?.title ?? details?.name ?? title,
        runtimeMin: runtime || undefined,
        originalLanguage: details?.original_language,
      },
      wanted,
    );
    return { ranked: r.ranked, wanted };
  }, [details, titleKey, type, tmdbId, season, episode, title]);

  const play = useCallback((ranked: PlaybackCandidate[], current: PlaybackCandidate, startAt: number, wanted: string[]) => {
    outcomeSent.current = false;
    firstProgressAt.current = null;
    lastTime.current = null;
    mountedAt.current = attempts.current === 0 ? startedAt : Date.now();
    attempts.current += 1;
    const next: Session = { ranked, current, startAt, wanted, attempt: attempts.current };
    sessionRef.current = next;
    setSession(next);
    setPhase("playing");
  }, [startedAt]);

  const switchTo = useCallback(
    (c: PlaybackCandidate, manual: boolean) => {
      const s = sessionRef.current;
      if (!s) return;
      if (manual && !outcomeSent.current) {
        outcomeSent.current = true;
        report(s.current, "manual_switch");
      }
      play(s.ranked, c, pos.current, s.wanted);
    },
    [play, report],
  );

  // First resolve: as soon as the title's details are in (runtime, original language), or after 2 s without them.
  useEffect(() => {
    if (started.current || (!details && !detailsWaitOver)) return;
    started.current = true;
    capTimer.current = setTimeout(() => {
      capTimer.current = null;
      if (alive.current && !sessionRef.current) onUseWeb();
    }, RESOLVE_CAP_MS);
    resolve().then(
      ({ ranked, wanted }) => {
        if (!alive.current || !capTimer.current) return; // unmounted, or already handed over at the cap
        clearTimeout(capTimer.current);
        capTimer.current = null;
        if (!ranked.length) return onUseWeb();
        play(ranked, ranked[0], 0, wanted);
        const msg = preferenceNotice(wanted, details?.original_language, ranked[0]);
        if (msg) say(msg);
      },
      () => {
        if (!alive.current || !capTimer.current) return;
        clearTimeout(capTimer.current);
        capTimer.current = null;
        onUseWeb();
      },
    );
  }, [details, detailsWaitOver, resolve, play, say, onUseWeb]);

  const failover = useCallback(
    (s: Session, at: number) => {
      const next = nextAfterFailure(s.ranked, failed.current, primaryLanguage(s.current));
      if (!next) {
        setPhase("failed");
        return;
      }
      play(s.ranked, next.candidate, at, s.wanted);
      if (next.languageLost) say(switchNotice(next.candidate, primaryLanguage(s.current)), { label: "Change", onPress: () => setSheetOpen(true) });
    },
    [play, say],
  );

  // F6: re-resolve the same stream once (fresh tokens), then the next in the same language, then any other.
  const onStreamError = useCallback(
    (_message: string): boolean => {
      const s = sessionRef.current;
      if (!s) return false;
      const cur = s.current;
      const at = pos.current;
      if (!outcomeSent.current) {
        outcomeSent.current = true;
        report(cur, firstProgressAt.current ? "playback_stall" : "http_error", { timeToFailMs: Date.now() - mountedAt.current });
      }
      if (!reResolved.current.has(cur.key)) {
        reResolved.current.add(cur.key);
        setStatus("Reconnecting…");
        setPhase("resolving");
        pluginHost.clearCache();
        resolve().then(
          ({ ranked }) => {
            if (!alive.current) return;
            const fresh = ranked.find((c) => c.key === cur.key);
            if (fresh) play(ranked.length ? ranked : s.ranked, fresh, at, s.wanted);
            else {
              failed.current.add(cur.key);
              failover({ ...s, ranked: ranked.length ? ranked : s.ranked }, at);
            }
          },
          () => {
            if (!alive.current) return;
            failed.current.add(cur.key);
            failover(s, at);
          },
        );
        return true;
      }
      failed.current.add(cur.key);
      failover(s, at);
      return true;
    },
    [failover, play, report, resolve],
  );

  const retryAll = useCallback(() => {
    failed.current.clear();
    reResolved.current.clear();
    setStatus("Finding the best source…");
    setPhase("resolving");
    pluginHost.clearCache();
    resolve().then(
      ({ ranked, wanted }) => {
        if (!alive.current) return;
        if (!ranked.length) return onUseWeb();
        play(ranked, ranked[0], pos.current, wanted);
      },
      () => alive.current && onUseWeb(),
    );
  }, [onUseWeb, play, resolve]);

  const onPlayerEvent = useCallback(
    (e: PlayerEvent) => {
      if (!Number.isFinite(e.currentTime)) return;
      const last = lastTime.current;
      lastTime.current = e.currentTime;
      pos.current = e.currentTime;
      // Real progress: time moving forward in small steps while playing (a resume seek is a jump, not progress).
      if (firstProgressAt.current == null && !e.paused && last != null && e.currentTime > last && e.currentTime - last < 2) {
        firstProgressAt.current = Date.now();
      }
      const s = sessionRef.current;
      if (s && !outcomeSent.current) {
        const ok = successReport(e.currentTime, firstProgressAt.current, mountedAt.current);
        if (ok) {
          outcomeSent.current = true;
          report(s.current, "success", { ttffMs: ok.ttffMs });
        }
      }
    },
    [report],
  );

  const next = type === "tv" && season != null && episode != null ? nextEpisode(details?.seasons, season, episode) : null;
  const subtitle = type === "tv" && season != null && episode != null ? `S${season} · E${episode}` : undefined;

  if (phase === "failed") {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.player}>
          <PlayerErrorCard
            title="Couldn’t play this title here"
            message="None of the sources worked on this device."
            actions={[
              { label: "Retry", icon: "refresh", kind: "primary", onPress: retryAll },
              { label: "Try another source", kind: "ghost", onPress: onUseWeb },
            ]}
          />
        </View>
      </SafeAreaView>
    );
  }

  if (phase === "resolving" || !session) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.player}>
          <PlayerLoadingCard posterUrl={posterUrl} status={status} />
        </View>
        {title ? <Text style={styles.title}>{title}</Text> : null}
      </SafeAreaView>
    );
  }

  const cur = session.current;
  const options = languageOptions(session.ranked, cur);
  const audioChoices =
    options.length > 1
      ? {
          options: options.map((o) => ({ label: o.label, active: o.active })),
          onPick: (label: string) => {
            const o = options.find((x) => x.label === label);
            const s = sessionRef.current;
            if (!o || o.active || !s) return;
            const pick = bestIn(s.ranked, o.code, failed.current);
            if (!pick) return;
            if (o.code) {
              setTitleLanguage(titleKey, o.code);
              setPreferredAudio(o.label);
            }
            switchTo(pick, true);
          },
        }
      : undefined;

  return (
    <>
      <NativePlayerView
        key={`${cur.key}#${session.attempt}`}
        title={title ?? ""}
        subtitle={subtitle}
        source={toNativeSource(cur)}
        sidecarSubtitles={sidecarsOf(cur)}
        posterUrl={posterUrl}
        sourceLabel={sourceLine(cur)}
        startedAt={session.attempt === 1 ? startedAt : undefined}
        startAt={session.startAt}
        onPlayerEvent={onPlayerEvent}
        onStreamError={onStreamError}
        audioChoices={audioChoices}
        notice={notice}
        onNoticeDone={() => setNotice(null)}
        onClose={onClose}
        onOpenSource={() => setSheetOpen(true)}
        onNextEpisode={next && onEpisode ? () => onEpisode(next.season, next.ep) : undefined}
      />
      <CandidateSheet
        visible={sheetOpen}
        candidates={session.ranked}
        currentKey={cur.key}
        onPick={(c) => {
          setSheetOpen(false);
          if (c.key !== cur.key) switchTo(c, true);
        }}
        onUseWeb={() => {
          setSheetOpen(false);
          onUseWeb();
        }}
        onClose={() => setSheetOpen(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  player: { width: "100%", aspectRatio: 16 / 9, backgroundColor: colors.playerBg },
  title: { color: colors.text, fontFamily: font.headline, fontSize: ms(18), padding: ms(16) },
});
