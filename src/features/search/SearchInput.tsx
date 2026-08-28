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
  onFilterPress?: () => void;
  filterActive?: boolean;
}

const SearchInput = React.memo(({ value, onChangeText, onClear, onFilterPress, filterActive }: Props) => {
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
        <>
          {/* Filters apply to search RESULTS → the trigger lives here, only while
              searching (browse filters live in BrowseHeader). Honey + dot = active. */}
          <Pressable onPress={onFilterPress} hitSlop={8} style={styles.filterBtn}>
            <Ionicons name="options-outline" size={20} color={filterActive ? colors.honey : colors.textDim} />
            {filterActive ? <View style={styles.filterDot} /> : null}
          </Pressable>
          <Pressable onPress={onClear} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={colors.textDim} />
          </Pressable>
        </>
      ) : null}
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
  filterBtn: { position: "relative", padding: 2 },
  filterDot: {
    position: "absolute",
    top: 0,
    right: 0,
    width: ms(7),
    height: ms(7),
    borderRadius: ms(4),
    backgroundColor: colors.honey,
  },
});

export default SearchInput;
