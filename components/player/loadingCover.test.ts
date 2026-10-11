import { loadingCoverVisible } from "./loadingCover";

const base = { bindable: true, bound: false, slow: false, noSource: false, fatal: false, pageLoaded: false };

describe("loadingCoverVisible", () => {
  it("covers a provider our skin binds until the bind", () => {
    expect(loadingCoverVisible({ ...base, pageLoaded: true })).toBe(true);
    expect(loadingCoverVisible({ ...base, pageLoaded: true, bound: true })).toBe(false);
  });

  it("shows a plain embed's own page as soon as it loads (it can never bind)", () => {
    expect(loadingCoverVisible({ ...base, bindable: false })).toBe(true);
    expect(loadingCoverVisible({ ...base, bindable: false, pageLoaded: true })).toBe(false);
  });

  it("gets out of the way of the slow banner, the not-found card and the error card", () => {
    expect(loadingCoverVisible({ ...base, slow: true })).toBe(false);
    expect(loadingCoverVisible({ ...base, noSource: true })).toBe(false);
    expect(loadingCoverVisible({ ...base, fatal: true })).toBe(false);
  });
});
