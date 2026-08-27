/**
 * ConnectivityBanner — app-global offline indicator.
 *
 * Drops a floating status pill from under the notch when the device goes
 * positively offline ("No internet connection"), and shows a brief honey
 * "Back online" confirmation when connectivity returns, then retracts. Driven
 * by {@link useConnectivity} (NetInfo). Mounted once in App.tsx, above every
 * screen; insets come from the app's SafeAreaProvider.
 *
 * Styled to the app's cinema-lounge language: a warm-charcoal pill with a
 * hairline accent border + a soft state tint + an Ionicon, matching the
 * GlassChip / BearAlert surface treatment. Deliberately NO blur and NO
 * elevation — this can overlay the video player, and both re-sample every
 * frame on Android (the documented playback-stutter cause).
 */
import { useConnectivity } from "@/hooks/useConnectivity";
import { useHeroQuery } from "@/src/store/services/tmdbApi";
import { colors, font, ms, radius } from "@/theme/bearoom";
import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { duration, easing, RM } from "@/theme/motion";

/** How long the "Back online" confirmation lingers before retracting. */
const ONLINE_LINGER_MS = 1800;

type Mode = "hidden" | "offline" | "online";

export function ConnectivityBanner() {
  // Only surface the transient banner when we actually have content loaded and
  // the connection drops mid-use. On a cold/idle offline start (no content),
  // the browse screens show a full offline page instead — so the two never
  // both appear. `hero` present ⇒ the app has been online and has a feed.
  const { data: hero } = useHeroQuery();
  const hasContent = (hero?.length ?? 0) > 0;
  const offline = useConnectivity() && hasContent;
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<Mode>("hidden");
  // Height is measured on layout so the retract translate is exact; seed with a
  // sensible estimate (inset + one row) so the first frame isn't mispositioned.
  const [height, setHeight] = useState(insets.top + ms(52));
  const wasOffline = useRef(false);
  const progress = useSharedValue(0); // 0 = retracted, 1 = shown

  // Drive the mode machine off connectivity transitions.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (offline) {
      wasOffline.current = true;
      setMode("offline");
    } else if (wasOffline.current) {
      // Recovered from a genuine offline spell → confirm briefly, then hide.
      wasOffline.current = false;
      setMode("online");
      timer = setTimeout(() => setMode("hidden"), ONLINE_LINGER_MS);
    } else {
      // Online (or still probing) and never dropped → stay hidden.
      setMode("hidden");
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [offline]);

  const shown = mode !== "hidden";
  useEffect(() => {
    progress.value = withTiming(shown ? 1 : 0, {
      duration: duration.base,
      easing: easing.decelerate,
      reduceMotion: RM,
    });
  }, [shown, progress]);

  const containerStyle = useAnimatedStyle(
    () => ({
      transform: [{ translateY: (progress.value - 1) * height }],
      opacity: progress.value,
    }),
    [height],
  );

  const online = mode === "online";

  return (
    <Animated.View
      pointerEvents="none"
      // Drop below the screen header band (headers sit right under the notch)
      // so the pill floats cleanly instead of colliding with the app header.
      style={[styles.container, { paddingTop: insets.top + ms(44) }, containerStyle]}
      onLayout={(e) => setHeight(e.nativeEvent.layout.height)}
    >
      <View
        style={[styles.pill, online ? styles.pillOnline : styles.pillOffline]}
      >
        {/* Soft state tint under the content, clipped to the pill radius. */}
        <View
          style={[
            StyleSheet.absoluteFill,
            online ? styles.tintOnline : styles.tintOffline,
          ]}
        />
        <Ionicons
          name={online ? "checkmark-circle" : "cloud-offline"}
          size={ms(15)}
          color={online ? colors.honey : colors.danger}
        />
        <Text style={styles.label}>
          {online ? "Back online" : "No internet connection"}
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 9998, // just under BearAlert's Modal (9999); above all screens
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: ms(7),
    paddingVertical: ms(9),
    paddingHorizontal: ms(15),
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    backgroundColor: colors.overlayStrong,
    overflow: "hidden",
  },
  pillOffline: { borderColor: colors.danger },
  pillOnline: { borderColor: colors.honey },
  tintOffline: { backgroundColor: colors.dangerSoft },
  tintOnline: { backgroundColor: colors.honeySoft },
  label: {
    color: colors.text,
    fontFamily: font.label,
    fontSize: ms(13),
    letterSpacing: 0.2,
  },
});

export default ConnectivityBanner;
