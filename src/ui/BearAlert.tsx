/**
 * BearAlert — themed replacement for React Native Alert.alert.
 */
import { colors, font, glow, ms, radius } from "@/theme/bearoom";
import { BlurView } from "expo-blur";
import React, { useEffect, useState } from "react";
import { Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";

export interface BearAlertButton {
  text: string;
  onPress?: () => void;
  style?: "default" | "cancel" | "destructive";
}

interface AlertState {
  title: string;
  message?: string;
  buttons: BearAlertButton[];
}

let listener: ((s: AlertState) => void) | null = null;

export function bearAlert(title: string, message?: string, buttons?: BearAlertButton[]): void {
  const b = buttons && buttons.length ? buttons : [{ text: "OK" }];
  if (listener) listener({ title, message, buttons: b });
}

export function AlertHost() {
  const [queue, setQueue] = useState<AlertState[]>([]);

  useEffect(() => {
    listener = (s) => setQueue((q) => [...q, s]);
    return () => {
      listener = null;
    };
  }, []);

  const state = queue[0] ?? null;
  const close = () => setQueue((q) => q.slice(1));
  const run = (b: BearAlertButton) => {
    const cb = b.onPress;
    close();
    cb?.();
  };

  return (
    <Modal visible={queue.length > 0} transparent animationType="fade" onRequestClose={close} statusBarTranslucent>
      {state ? (
        <View style={styles.overlay} pointerEvents="box-none">
          <Pressable style={StyleSheet.absoluteFill} onPress={close} />
          <AlertCard state={state} run={run} />
        </View>
      ) : null}
    </Modal>
  );
}

function AlertCard({ state, run }: { state: AlertState; run: (b: BearAlertButton) => void }) {
  const { title, message, buttons } = state;
  const stacked = buttons.length > 2;
  return (
    <View style={styles.card}>
      <BlurView
        intensity={40}
        tint="dark"
        experimentalBlurMethod={Platform.OS === "android" ? "dimezisBlurView" : undefined}
        style={StyleSheet.absoluteFill}
      />
      <View style={[StyleSheet.absoluteFill, styles.cardTint]} />
      <View style={styles.cardInner}>
        <Text style={styles.title}>{title}</Text>
        {message ? <Text style={styles.message}>{message}</Text> : null}
        {stacked ? (
          <View style={styles.stack}>
            {buttons
              .filter((b) => b.style !== "cancel")
              .map((b, i) => (
                <Pressable key={i} style={styles.stackRow} onPress={() => run(b)}>
                  <Text style={[styles.stackText, b.style === "destructive" && styles.destructiveText]}>{b.text}</Text>
                </Pressable>
              ))}
            {buttons.find((b) => b.style === "cancel") ? (
              <Pressable style={styles.cancelBtn} onPress={() => run(buttons.find((b) => b.style === "cancel")!)}>
                <Text style={styles.cancelText}>{buttons.find((b) => b.style === "cancel")!.text}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : (
          <View style={styles.row}>
            {buttons.map((b, i) => {
              const isCancel = b.style === "cancel";
              const isDestructive = b.style === "destructive";
              return (
                <Pressable
                  key={i}
                  style={[styles.btn, isCancel ? styles.btnGhost : isDestructive ? styles.btnDanger : styles.btnHoney]}
                  onPress={() => run(b)}
                >
                  <Text
                    style={[
                      styles.btnText,
                      isCancel ? styles.btnTextGhost : isDestructive ? styles.btnTextDanger : styles.btnTextHoney,
                    ]}
                  >
                    {b.text}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.modalBackdrop,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: ms(32),
    zIndex: 9999,
    elevation: 9999,
  },
  card: {
    width: "100%",
    maxWidth: ms(360),
    borderRadius: radius.xxl,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    ...glow.soft,
  },
  cardTint: { backgroundColor: colors.overlayStrong },
  cardInner: { padding: ms(22) },
  title: { color: colors.text, fontFamily: font.headline, fontSize: ms(18), textAlign: "center" },
  message: {
    color: colors.textDim,
    fontFamily: font.body,
    fontSize: ms(14),
    lineHeight: ms(20),
    textAlign: "center",
    marginTop: ms(8),
  },
  row: { flexDirection: "row", gap: ms(10), marginTop: ms(20) },
  btn: { flex: 1, height: ms(48), borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  btnHoney: { backgroundColor: colors.honey, ...glow.honey },
  btnGhost: { backgroundColor: colors.surfaceStrong, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderStrong },
  btnDanger: { backgroundColor: colors.dangerSoft, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.danger },
  btnText: { fontFamily: font.label, fontSize: ms(14) },
  btnTextHoney: { color: colors.onHoney },
  btnTextGhost: { color: colors.text },
  btnTextDanger: { color: colors.danger },
  stack: { marginTop: ms(16), gap: ms(2) },
  stackRow: { paddingVertical: ms(14), alignItems: "center" },
  stackText: { color: colors.text, fontFamily: font.bodyMed, fontSize: ms(15) },
  destructiveText: { color: colors.danger },
  cancelBtn: {
    marginTop: ms(8),
    height: ms(48),
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceStrong,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelText: { color: colors.text, fontFamily: font.label, fontSize: ms(15) },
});

export default AlertHost;
