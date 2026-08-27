import React, { useCallback, useRef } from "react";
import { View, TextInput, Pressable, StyleSheet } from "react-native";
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { colors, ms, radius, spacing } from "@/theme/bearoom";
import { spring } from "@/theme/motion";
import { textVariant } from "@/theme/styles/typography";

interface Props {
  value: string;
  onChangeText: (text: string) => void;
  onClear: () => void;
}

const SearchInput = React.memo(({ value, onChangeText, onClear }: Props) => {
  const inputRef = useRef<TextInput>(null);

  // Subtle focus polish: spring the border toward honey + a hair of scale.
  const focus = useSharedValue(0);
  const onFocus = useCallback(() => {
    focus.value = withSpring(1, spring.press);
  }, [focus]);
  const onBlur = useCallback(() => {
    focus.value = withSpring(0, spring.press);
  }, [focus]);
  const wrapStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(focus.value, [0, 1], [colors.borderStrong, colors.honey]),
    transform: [{ scale: 1 + focus.value * 0.01 }],
  }));

  return (
    <Animated.View style={[styles.searchWrap, wrapStyle]}>
      <Ionicons name="search" size={20} color={colors.textDim} />
      <TextInput
        ref={inputRef}
        placeholder="Search movies, shows, people…"
        placeholderTextColor={colors.textDim}
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        onFocus={onFocus}
        onBlur={onBlur}
        autoCorrect={false}
        returnKeyType="search"
        selectionColor={colors.honey}
      />
      {value ? (
        <Pressable onPress={onClear} hitSlop={8}>
          <Ionicons name="close-circle" size={18} color={colors.textDim} />
        </Pressable>
      ) : (
        <Ionicons name="options-outline" size={20} color={colors.textDim} />
      )}
    </Animated.View>
  );
});

SearchInput.displayName = "SearchInput";

const styles = StyleSheet.create({
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surfaceStrong,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.md + 2,
    height: ms(46),
    borderRadius: radius.lg,
  },
  input: { flex: 1, ...textVariant("body"), fontSize: ms(15) },
});

export default SearchInput;
