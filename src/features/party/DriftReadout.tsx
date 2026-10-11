/** Test builds only: how far this device sits from the room (spec S5 — p95 ≤ 0.5 s on the native lane). */
import { useTestStreamsEnabled } from "@/src/features/dev/testStreamsGate";
import { colors, font, ms } from "@/theme/bearoom";
import React, { useEffect, useState } from "react";
import { StyleSheet, Text } from "react-native";

export function DriftReadout({ stats }: { stats: () => { n: number; p50: number; p95: number } }) {
  const on = useTestStreamsEnabled();
  const [line, setLine] = useState("drift –");
  useEffect(() => {
    if (!on) return;
    const t = setInterval(() => {
      const s = stats();
      setLine(`drift p50 ${s.p50.toFixed(2)} s · p95 ${s.p95.toFixed(2)} s · n ${s.n}`);
    }, 2000);
    return () => clearInterval(t);
  }, [on, stats]);
  if (!on) return null;
  return (
    <Text accessibilityLabel="drift-readout" style={styles.text}>
      {line}
    </Text>
  );
}

const styles = StyleSheet.create({
  text: { color: colors.honey, fontFamily: font.label, fontSize: ms(10), paddingHorizontal: ms(12), paddingTop: ms(4) },
});
