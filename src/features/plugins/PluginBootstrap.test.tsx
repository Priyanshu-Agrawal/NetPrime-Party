import { holdSandbox } from "@/services/plugins/demand";
import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import PluginBootstrap from "./PluginBootstrap";

const mockSync = jest.fn(async (..._repos: unknown[]) => []);
jest.mock("@/services/plugins", () => ({ sandboxBridge: { tag: "bridge" }, syncRepos: (...a: unknown[]) => mockSync(...a) }));
jest.mock("@/components/plugins/PluginSandbox", () => {
  const { View } = jest.requireActual("react-native");
  return { __esModule: true, default: () => <View testID="plugin-sandbox" /> };
});
let mockFlags = { embedApiLane: false, nativeLane: false, pluginHost: false };
const mockRepos = [{ id: "open-movies" }];
jest.mock("@/src/store/features/providers/hooks", () => ({ useFeatureFlags: () => mockFlags, usePluginRepos: () => mockRepos }));
let mockAvailable = true;
jest.mock("@/modules/bearoom-fetch", () => ({
  get nativeFetchAvailable() {
    return mockAvailable;
  },
}));

const sandboxes = (r: ReactTestRenderer) => r.root.findAll((n) => typeof n.type === "string" && n.props.testID === "plugin-sandbox");
const mounted: ReactTestRenderer[] = [];
function render() {
  let r!: ReactTestRenderer;
  act(() => {
    r = create(<PluginBootstrap />);
  });
  mounted.push(r);
  return r;
}

afterEach(() => {
  act(() => mounted.splice(0).forEach((r) => r.unmount()));
});

beforeEach(() => {
  mockSync.mockClear();
  mockFlags = { embedApiLane: false, nativeLane: false, pluginHost: false };
  mockAvailable = true;
});

describe("PluginBootstrap", () => {
  it("does nothing while the plugin-host flag is off", () => {
    expect(sandboxes(render())).toHaveLength(0);
    expect(mockSync).not.toHaveBeenCalled();
  });

  it("mounts the sandbox and installs /config's repos (the cached list offline) when the flag is on", () => {
    mockFlags = { ...mockFlags, pluginHost: true };
    expect(sandboxes(render())).toHaveLength(1);
    expect(mockSync).toHaveBeenCalledWith(mockRepos);
  });

  it("a dev screen can hold the sandbox open with the flag off, without installing anything", () => {
    const release = holdSandbox();
    const r = render();
    expect(sandboxes(r)).toHaveLength(1);
    expect(mockSync).not.toHaveBeenCalled();
    act(() => release());
    expect(sandboxes(r)).toHaveLength(0);
  });

  it("never mounts in a binary without BearoomFetch", () => {
    mockAvailable = false;
    mockFlags = { ...mockFlags, pluginHost: true };
    expect(sandboxes(render())).toHaveLength(0);
    expect(mockSync).not.toHaveBeenCalled();
  });
});
