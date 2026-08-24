/**
 * BearAvatar — Reusable Bear Avatar component.
 *
 * Renders the BeaRoom Bear SVG using expo-image and deterministic SVG generation.
 * Supports warm amber glow, host rings, custom sizing, and tap interaction.
 */
import { BearAvatarConfig, generateBearDataUri } from "@/services/avatar/bearAvatar";
import { getAvatarConfig } from "@/services/party/identity";
import { colors, ms, radius } from "@/theme/bearoom";
import { Image } from "expo-image";
import React, { useMemo } from "react";
import { Pressable, StyleProp, StyleSheet, View, ViewStyle } from "react-native";

export interface BearAvatarProps {
  config?: BearAvatarConfig;
  size?: number;
  showGlow?: boolean;
  hostRing?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  interactive?: boolean;
}

export default function BearAvatar({
  config,
  size = ms(48),
  showGlow = false,
  hostRing = false,
  onPress,
  style,
  interactive = false,
}: BearAvatarProps) {
  const activeConfig = useMemo(() => {
    return config || getAvatarConfig();
  }, [config]);

  const svgUri = useMemo(() => {
    return generateBearDataUri(activeConfig);
  }, [activeConfig]);

  const inner = (
    <View
      style={[
        styles.container,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
        },
        hostRing && styles.hostRing,
        showGlow && styles.glow,
        style,
      ]}
    >
      {showGlow && (
        <View
          style={[
            styles.glowEffect,
            {
              width: size * 1.25,
              height: size * 1.25,
              borderRadius: (size * 1.25) / 2,
            },
          ]}
        />
      )}
      <View
        style={[
          styles.avatarCircle,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
          },
        ]}
      >
        <Image
          source={{ uri: svgUri }}
          style={{ width: size, height: size }}
          contentFit="contain"
          cachePolicy="memory"
        />
      </View>
    </View>
  );

  if (onPress || interactive) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [pressed && styles.pressed]}>
        {inner}
      </Pressable>
    );
  }

  return inner;
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
  },
  avatarCircle: {
    overflow: "hidden",
    backgroundColor: colors.bgElevated,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  // NB: no shadow/elevation here — BearAvatar renders over the video on the party
  // surface (see no-elevation-on-video rule). The honey halo is the glowEffect view
  // + honey border, which don't re-capture the WebView per frame.
  hostRing: {
    borderColor: colors.honey,
    borderWidth: 2,
  },
  glow: {},
  glowEffect: {
    position: "absolute",
    backgroundColor: colors.honeyGlow,
    opacity: 0.25,
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.96 }],
  },
});
