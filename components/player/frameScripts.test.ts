/**
 * @jest-environment jsdom
 */
import { WALL_WATCH_JS, relayInjectJs, relayListenerJs, sessionNonces } from "./frameScripts";

const ran = () => (window as any).__ran;

beforeEach(() => {
  delete (window as any).__ran;
  delete (window as any).__vlRelayI;
  delete (window as any).__vlWall;
});

describe("relay listener", () => {
  it("ignores relayed code that doesn't come from this frame's parent (an ad frame posting up)", () => {
    new Function(relayListenerJs("r1"))();
    // At the top frame every message comes from a child (or itself) — never its parent.
    window.dispatchEvent(new MessageEvent("message", { data: { __vlEval: "window.__ran=1", __vlN: "r1" }, source: window }));
    expect(ran()).toBeUndefined();
  });

  it("runs relayed code from its parent with the right secret, and only then", () => {
    const frame = document.createElement("iframe");
    document.body.appendChild(frame);
    const child = frame.contentWindow as any;
    child.eval(relayListenerJs("r1"));
    child.dispatchEvent(new child.MessageEvent("message", { data: { __vlEval: "window.__ran=2", __vlN: "bad" }, source: window }));
    expect(child.__ran).toBeUndefined();
    child.dispatchEvent(new child.MessageEvent("message", { data: { __vlEval: "window.__ran=2", __vlN: "r1" }, source: window }));
    expect(child.__ran).toBe(2);
    frame.remove();
  });
});

describe("session secrets", () => {
  it("keeps the inbound message secret out of everything relayed to frames", () => {
    const n = sessionNonces();
    expect(n.msg).not.toBe(n.relay);
    expect(relayInjectJs("window.__vlCmd && window.__vlCmd({})", n.relay)).not.toContain(n.msg);
  });
});

describe("not-found wall watcher", () => {
  it("never hands its message to the page's JSON.stringify", () => {
    jest.useFakeTimers();
    const posted: string[] = [];
    (window as any).ReactNativeWebView = { postMessage: (s: string) => posted.push(s) };
    (window as any).__vlMsgNonce = "m1";
    new Function(WALL_WATCH_JS)();
    const seen: unknown[] = [];
    const real = JSON.stringify;
    JSON.stringify = ((v: unknown, ...rest: unknown[]) => {
      seen.push(v);
      return (real as (...a: unknown[]) => string)(v, ...rest);
    }) as typeof JSON.stringify;
    try {
      document.body.textContent = "We couldn't find that title";
      jest.advanceTimersByTime(1000);
    } finally {
      JSON.stringify = real;
      jest.useRealTimers();
    }
    expect(posted.map((s) => JSON.parse(s))).toEqual([{ event: "notFound", __n: "m1" }]);
    expect(seen).toHaveLength(0);
  });
});
