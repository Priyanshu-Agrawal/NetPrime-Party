import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { PlayLanguageRow } from "./PlayLanguageRow";

// The icon font loads asynchronously and would update after the test ends.
jest.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));

const texts = (r: ReactTestRenderer) =>
  r.root.findAll((n) => (n.type as unknown) === "Text" && typeof n.props.children === "string").map((n) => n.props.children as string);
const press = (r: ReactTestRenderer, label: string) =>
  act(() =>
    r.root
      .findAll((n) => typeof n.props.onPress === "function" && n.findAll((c) => (c.type as unknown) === "Text" && c.props.children === label).length > 0)[0]
      .props.onPress(),
  );
function render(el: React.ReactElement) {
  let r!: ReactTestRenderer;
  act(() => {
    r = create(el);
  });
  return r;
}

describe("PlayLanguageRow", () => {
  it("renders nothing when there's nothing to say", () => {
    expect(render(<PlayLanguageRow button={{ label: "Play", others: [] }} onChoose={jest.fn()} />).toJSON()).toBeNull();
  });

  it("shows the quiet note", () => {
    const r = render(<PlayLanguageRow button={{ label: "Play", note: "Hindi not available for this title", others: [] }} onChoose={jest.fn()} />);
    expect(texts(r)).toEqual(["Hindi not available for this title"]);
  });

  it("opens the other languages inline; a pick reports it and folds the row", () => {
    const onChoose = jest.fn();
    const r = render(
      <PlayLanguageRow
        button={{ label: "Play in Hindi", others: [{ code: "en", label: "English" }, { code: "ta", label: "Tamil" }] }}
        onChoose={onChoose}
      />,
    );
    expect(texts(r)).toEqual(["Other languages"]);
    press(r, "Other languages");
    expect(texts(r)).toEqual(["Other languages", "English", "Tamil"]);
    press(r, "Tamil");
    expect(onChoose).toHaveBeenCalledWith("ta");
    expect(texts(r)).toEqual(["Other languages"]);
  });
});
