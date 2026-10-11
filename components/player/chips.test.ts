import { controlChips } from "./chips";

describe("controlChips", () => {
  it("picks the active audio and quality and the selected subtitles", () => {
    expect(
      controlChips(
        [{ label: "English", active: false }, { label: "Hindi", active: true }],
        [{ label: "Auto", active: false }, { label: "720p", active: true }],
        [{ id: "in:0", label: "English", language: "en", selected: true }],
      ),
    ).toEqual({ audio: "Hindi", quality: "720p", subtitles: "English" });
  });

  it("uses the quality summary when given, and no subtitles when none is selected", () => {
    expect(controlChips([], [], [], "Auto (576p)")).toEqual({ audio: undefined, quality: "Auto (576p)", subtitles: null });
  });
});
