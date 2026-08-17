import React from "react";
import { View, type ViewProps, type ViewStyle } from "react-native";
import { spacing } from "@/theme/bearoom";

type SpacingKey = keyof typeof spacing;

type StackProps = ViewProps & {
  gap?: SpacingKey | number;
  align?: ViewStyle["alignItems"];
  justify?: ViewStyle["justifyContent"];
  wrap?: boolean;
  flex?: number;
  fill?: boolean;
};

function resolveGap(g?: SpacingKey | number): number | undefined {
  if (g === undefined) return undefined;
  if (typeof g === "number") return g;
  return spacing[g];
}

export function Stack({
  gap: g,
  align,
  justify,
  wrap,
  flex,
  fill,
  style,
  children,
  ...rest
}: StackProps) {
  return (
    <View
      style={[
        {
          gap: resolveGap(g),
          alignItems: align,
          justifyContent: justify,
          flexWrap: wrap ? "wrap" : undefined,
          flex: fill ? 1 : flex,
        },
        style,
      ]}
      {...rest}
    >
      {children}
    </View>
  );
}

export function HStack(props: StackProps) {
  return <Stack {...props} style={[{ flexDirection: "row" }, props.style]} />;
}

export function VStack(props: StackProps) {
  return <Stack {...props} style={[{ flexDirection: "column" }, props.style]} />;
}

export default Stack;
