import { View } from "react-native";
import { NativeGlassBackdrop, NativeGlassView } from "./index";

// jest-expo runs as iOS: the Android-only engine must degrade to plain views there.
describe("bearoom-glass off Android", () => {
  it("renders the backdrop as a plain View", () => {
    expect(NativeGlassBackdrop).toBe(View);
  });
  it("has no native glass view", () => {
    expect(NativeGlassView).toBeNull();
  });
});
