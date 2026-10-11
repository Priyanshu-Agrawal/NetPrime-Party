/**
 * The title page's language preview (spec §6.1): after 600 ms on the page, ask the plugins which languages this title
 * has — never on data saver or a metered network unless the user allowed it, never when the native lane is off — and
 * say it on the Play button. Play is never blocked: the answer only relabels it, and the streams it found seed Play.
 */
import { useConnectivity } from "@/hooks/useConnectivity";
import { nativeFetchAvailable } from "@/modules/bearoom-fetch";
import { previewTitle } from "@/services/playback";
import { useFeatureFlags } from "@/src/store/features/providers/hooks";
import { getTitleLanguage, languageOrder, resolveOrder, setTitleLanguage, titleKeyOf } from "@/utils/languagePrefs";
import { getDataSaver, getPreviewOnMetered } from "@/utils/prefs";
import { useNetInfo } from "@react-native-community/netinfo";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform } from "react-native";
import { playButton, type PlayButton, type PreviewAnswer, type PreviewStatus } from "./languagePreview";

export const PREVIEW_DELAY_MS = 600;

export interface PreviewInput {
  type: "movie" | "tv";
  tmdbId: string;
  /** The episode Play opens (TV). */
  season?: number;
  episode?: number;
  details?: { original_language?: string; title?: string; name?: string; original_title?: string; original_name?: string };
  /** The page is ready: details loaded and the title released. */
  enabled: boolean;
}

export function useLanguagePreview({ type, tmdbId, season, episode, details, enabled }: PreviewInput): {
  status: PreviewStatus;
  button: PlayButton;
  choose(code: string): void;
} {
  const { pluginHost, nativeLane } = useFeatureFlags();
  const offline = useConnectivity();
  const net = useNetInfo();
  const metered = (net.details as { isConnectionExpensive?: boolean } | null)?.isConnectionExpensive === true;
  const allowed =
    enabled && pluginHost && nativeLane && nativeFetchAvailable && Platform.OS !== "web" && !offline && !getDataSaver() && (!metered || getPreviewOnMetered());

  const key = titleKeyOf(type, tmdbId);
  const target = `${key}:${season ?? ""}:${episode ?? ""}`;
  const [choice, setChoice] = useState<string | null>(null);
  const wanted = useMemo(() => resolveOrder(languageOrder(), details?.original_language, choice ?? getTitleLanguage(key)), [details?.original_language, choice, key]);

  // The answer belongs to the episode it was asked for; a different target reads as still waiting.
  const [state, setState] = useState<{ target: string; status: PreviewStatus; answer: PreviewAnswer | null }>({ target: "", status: "off", answer: null });
  const detailsRef = useRef(details);
  const wantedRef = useRef(wanted);
  useEffect(() => {
    detailsRef.current = details;
    wantedRef.current = wanted;
  });

  useEffect(() => {
    if (!allowed) return;
    let live = true;
    const timer = setTimeout(() => {
      setState({ target, status: "checking", answer: null });
      const d = detailsRef.current;
      previewTitle(
        { tmdbId, type, season, episode, titleName: d?.title ?? d?.name, originalTitle: d?.original_title ?? d?.original_name, originalLanguage: d?.original_language },
        wantedRef.current,
      ).then(
        (r) => live && setState({ target, status: "done", answer: { langs: r.ranked.map((c) => c.languages), complete: r.complete } }),
        () => live && setState({ target, status: "off", answer: null }),
      );
    }, PREVIEW_DELAY_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [allowed, target, tmdbId, type, season, episode]);

  const status: PreviewStatus = !allowed ? "off" : state.target !== target ? "waiting" : state.status;
  const answer = allowed && state.target === target ? state.answer : null;

  const choose = useCallback(
    (code: string) => {
      setTitleLanguage(key, code); // the native player reads the same per-title choice when Play starts
      setChoice(code);
    },
    [key],
  );

  return { status, button: playButton(status, answer, wanted), choose };
}
