/**
 * Under the title page's Play (spec §6.1): the quiet "Hindi not available" note, and the other languages the preview
 * found, one tap away. Inline chips — no sheet, no layout animation.
 */
import { Chip } from "@/src/ui/Chip";
import { colors, font, ms } from "@/theme/bearoom";
import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { PlayButton } from "./languagePreview";

export function PlayLanguageRow({ button, onChoose }: { button: PlayButton; onChoose(code: string): void }) {
  const [open, setOpen] = useState(false);
  if (!button.note && !button.others.length) return null;
  return (
    <View style={styles.row}>
      {button.note ? <Text style={styles.note}>{button.note}</Text> : null}
      {button.others.length ? (
        <View style={styles.chips}>
          <Chip label="Other languages" icon={open ? "chevron-up" : "chevron-down"} active={open} onPress={() => setOpen((o) => !o)} />
          {open
            ? button.others.map((o) => (
                <Chip
                  key={o.code}
                  label={o.label}
                  onPress={() => {
                    setOpen(false);
                    onChoose(o.code);
                  }}
                />
              ))
            : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: ms(16), marginTop: ms(10), gap: ms(8) },
  note: { color: colors.textDim, fontFamily: font.body, fontSize: ms(12.5) },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: ms(8) },
});
