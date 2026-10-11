import { SANDBOX_HTML } from "@/services/plugins/sandbox/runtime.generated";
import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import PluginSandbox, { SANDBOX_ORIGIN } from "./PluginSandbox";

const mockInject = jest.fn();
let mockProps: Record<string, any> = {};
let mockMounts = 0;
jest.mock("react-native-webview", () => {
  const React = jest.requireActual("react");
  const { View } = jest.requireActual("react-native");
  const WebView = React.forwardRef(function MockWebView(props: Record<string, unknown>, ref: unknown) {
    mockProps = props;
    React.useImperativeHandle(ref, () => ({ injectJavaScript: mockInject }));
    React.useEffect(() => {
      mockMounts++;
    }, []);
    return React.createElement(View, { testID: "sandbox-webview" });
  });
  return { __esModule: true, default: WebView, WebView };
});

function fakeBridge() {
  let restart = () => {};
  return {
    attach: jest.fn(),
    detach: jest.fn(),
    onMessage: jest.fn(),
    crashed: jest.fn(() => restart()),
    setRestartHandler: jest.fn((fn: () => void) => {
      restart = fn;
    }),
  };
}

function render(bridge: ReturnType<typeof fakeBridge>) {
  let r!: ReactTestRenderer;
  act(() => {
    r = create(<PluginSandbox bridge={bridge} />);
  });
  return r;
}

beforeEach(() => {
  mockMounts = 0;
  mockInject.mockReset();
});

describe("PluginSandbox", () => {
  it("connects the WebView to the bridge both ways", () => {
    const bridge = fakeBridge();
    render(bridge);
    const inject = bridge.attach.mock.calls[0][0] as (js: string) => void;
    inject("x();");
    expect(mockInject).toHaveBeenCalledWith("x();");
    mockProps.onMessage({ nativeEvent: { data: '{"t":"ready"}' } });
    expect(bridge.onMessage).toHaveBeenCalledWith('{"t":"ready"}');
  });

  it("loads only the sandbox page, with storage, cookies, files and pop-ups off", () => {
    render(fakeBridge());
    expect(mockProps.source).toEqual({ html: SANDBOX_HTML, baseUrl: SANDBOX_ORIGIN });
    expect(mockProps).toMatchObject({
      javaScriptEnabled: true,
      domStorageEnabled: false,
      cacheEnabled: false,
      thirdPartyCookiesEnabled: false,
      sharedCookiesEnabled: false,
      allowFileAccess: false,
      allowFileAccessFromFileURLs: false,
      allowUniversalAccessFromFileURLs: false,
      setSupportMultipleWindows: false,
      javaScriptCanOpenWindowsAutomatically: false,
    });
  });

  it("never clears the app's cookies or cache (Android's incognito wipes every WebView's cookies app-wide)", () => {
    render(fakeBridge());
    expect(mockProps.incognito).toBeFalsy();
  });

  it("refuses to navigate anywhere but the sandbox page", () => {
    render(fakeBridge());
    expect(mockProps.onShouldStartLoadWithRequest({ url: SANDBOX_ORIGIN })).toBe(true);
    expect(mockProps.onShouldStartLoadWithRequest({ url: "about:blank" })).toBe(true);
    expect(mockProps.onShouldStartLoadWithRequest({ url: "https://evil.test/" })).toBe(false);
  });

  it.each(["onRenderProcessGone", "onContentProcessDidTerminate"])("mounts a fresh WebView after %s", (event) => {
    const bridge = fakeBridge();
    render(bridge);
    expect(mockMounts).toBe(1);
    act(() => mockProps[event]());
    expect(bridge.crashed).toHaveBeenCalledTimes(1);
    expect(mockMounts).toBe(2);
    expect(bridge.detach).toHaveBeenCalledTimes(1);
    expect(bridge.attach).toHaveBeenCalledTimes(2);
  });

  it("detaches when unmounted", () => {
    const bridge = fakeBridge();
    const r = render(bridge);
    act(() => r.unmount());
    expect(bridge.detach).toHaveBeenCalledTimes(1);
  });
});
