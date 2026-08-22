import React, { useRef, useEffect } from "react";
import { View, TextInput, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, ms, radius, spacing } from "@/theme/bearoom";
import { textVariant } from "@/theme/styles/typography";

interface Props {
  value: string;
  onChangeText: (text: string) => void;
  onClear: () => void;
}

const SearchInput = React.memo(({ value, onChangeText, onClear }: Props) => {
  const inputRef = useRef<TextInput>(null);

  return (
    <View style={styles.searchWrap}>
      <Ionicons name="search" size={20} color={colors.textDim} />
      <TextInput
        ref={inputRef}
        placeholder="Search movies, shows, people…"
        placeholderTextColor={colors.textDim}
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
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
    </View>
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
