import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { PlayerErrorCard } from "./PlayerErrorCard";
import { PlayerLoadingCard } from "./PlayerLoadingCard";

jest.mock("expo-image", () => {
  const { View } = jest.requireActual("react-native");
  return { Image: (p: object) => <View testID="image" {...p} /> };
});

const texts = (r: ReactTestRenderer) =>
  r.root.findAll((n) => typeof n.type === "string" && typeof n.props.children === "string").map((n) => n.props.children as string);
function render(el: React.ReactElement) {
  let r!: ReactTestRenderer;
  act(() => {
    r = create(el);
  });
  return r;
}

describe("PlayerLoadingCard", () => {
  it("shows the status over the blurred poster and the poster card, and lets touches through", () => {
    const r = render(<PlayerLoadingCard posterUrl="https://image.test/p.jpg" status="Starting…" />);
    expect(texts(r)).toContain("Starting…");
    expect(r.root.findAll((n) => typeof n.type === "string" && n.props?.testID === "image" && n.props.blurRadius === 25)).toHaveLength(1);
    expect(r.root.findAll((n) => n.props?.pointerEvents === "none").length).toBeGreaterThan(0);
  });

  it("falls back to the brand mark without a poster", () => {
    const r = render(<PlayerLoadingCard status="Getting your stream ready…" />);
    expect(r.root.findAll((n) => typeof n.type === "string" && n.props?.testID === "image" && n.props.blurRadius === 25)).toHaveLength(0);
    expect(texts(r)).toContain("Getting your stream ready…");
  });
});

describe("PlayerErrorCard", () => {
  it("shows the title, message and every action", () => {
    const retry = jest.fn();
    const other = jest.fn();
    const r = render(
      <PlayerErrorCard
        title="Couldn’t play this stream"
        message="Check your connection and try again."
        actions={[
          { label: "Retry", icon: "refresh", kind: "primary", onPress: retry },
          { label: "Try another source", kind: "ghost", onPress: other },
        ]}
      />,
    );
    expect(texts(r)).toEqual(expect.arrayContaining(["Couldn’t play this stream", "Check your connection and try again."]));
    act(() => r.root.find((n) => n.props?.accessibilityLabel === "Retry" && n.props.onPress).props.onPress());
    act(() => r.root.find((n) => n.props?.accessibilityLabel === "Try another source" && n.props.onPress).props.onPress());
    expect(retry).toHaveBeenCalled();
    expect(other).toHaveBeenCalled();
  });
});
