import React from "react";
import { act, create } from "react-test-renderer";

jest.mock("./glass", () => {
  const { View } = jest.requireActual("react-native");
  return { Glass: (p: object) => <View testID="glass" {...p} /> };
});

// eslint-disable-next-line import/first
import { GlassCard } from "./GlassCard";

const glassOf = (el: React.ReactElement) => {
  let r!: ReturnType<typeof create>;
  act(() => {
    r = create(el);
  });
  return r.root.findAll((n) => n.props.testID === "glass");
};

describe("GlassCard", () => {
  it("is a bar of glass shaped like the card by default", () => {
    const [g] = glassOf(<GlassCard rounded={30} />);
    expect(g.props).toMatchObject({ material: "bar", radius: 30, visible: true });
  });
  it("passes visibility through (fading player bar)", () => {
    const [g] = glassOf(<GlassCard material="control" visible={false} />);
    expect(g.props).toMatchObject({ material: "control", visible: false });
  });
  it("passes backdrop through (a card inside a Modal must not blur the screen in another window)", () => {
    const [g] = glassOf(<GlassCard backdrop="none" />);
    expect(g.props.backdrop).toBe("none");
  });
  it("draws no glass when blur is off", () => {
    expect(glassOf(<GlassCard blur={false} />)).toHaveLength(0);
  });
});
