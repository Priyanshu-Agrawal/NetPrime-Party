import React from "react";
import { AccessibilityInfo } from "react-native";
import { act, create } from "react-test-renderer";
import { useReduceTransparency } from "./useReduceTransparency";

it("reports iOS Reduce Transparency (glass then draws its solid look)", async () => {
  jest.spyOn(AccessibilityInfo, "isReduceTransparencyEnabled").mockResolvedValue(true);
  jest.spyOn(AccessibilityInfo, "addEventListener").mockReturnValue({ remove: () => {} } as never);
  const seen: boolean[] = [];
  function Probe() {
    seen.push(useReduceTransparency());
    return null;
  }
  await act(async () => {
    create(<Probe />);
  });
  expect(seen[0]).toBe(false);
  expect(seen[seen.length - 1]).toBe(true);
});
