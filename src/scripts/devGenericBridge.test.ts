import type { Provider } from "@/components/player/providerRegistry";
import { DEV_BRIDGE_SUFFIX, devBridgeEnabled, withDevBridge } from "./devGenericBridge";

const prov = (id: string, supported: boolean, scriptVersion: string | null = null): Provider => ({
  id,
  name: id,
  urls: { movie: "", tv: "" },
  allowedDomain: `${id}.test`,
  hijack: { supported },
  scriptVersion,
});

describe("withDevBridge", () => {
  it("gives every hijack-capable provider without a published script the bundled one", () => {
    const out = withDevBridge([prov("vidfast", true), prov("vsembed", false)]);
    expect(out[0].scriptVersion).toBe(`vidfast${DEV_BRIDGE_SUFFIX}`);
    expect(out[1].scriptVersion).toBeNull();
  });

  it("never overrides a published script, nor videasy's legacy bridge", () => {
    const out = withDevBridge([prov("vidlink", true, "vidlink@abc12345"), prov("videasy", true)]);
    expect(out[0].scriptVersion).toBe("vidlink@abc12345");
    expect(out[1].scriptVersion).toBeNull();
  });
});

describe("devBridgeEnabled", () => {
  const old = process.env.EXPO_PUBLIC_DEV_GENERIC_BRIDGE;
  afterEach(() => {
    process.env.EXPO_PUBLIC_DEV_GENERIC_BRIDGE = old;
  });

  it("is off unless the dev flag is set", () => {
    delete process.env.EXPO_PUBLIC_DEV_GENERIC_BRIDGE;
    expect(devBridgeEnabled()).toBe(false);
    process.env.EXPO_PUBLIC_DEV_GENERIC_BRIDGE = "1";
    expect(devBridgeEnabled()).toBe(true);
  });
});
