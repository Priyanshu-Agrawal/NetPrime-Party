import { HOST_TIMEOUT_MS, hostLooksGone } from "./election";

// Times in ms. `serverNow` is the shared server clock, `now` the device clock.
const base = { serverNow: 100_000, now: 50_000 };

describe("hostLooksGone", () => {
  it("waits for a just-joined guest to hear the host before electing", () => {
    // Joined at 40 s with a lease that has since lapsed; the channel only started
    // listening at 45 s, so the host's heartbeats haven't had a fair chance yet.
    expect(
      hostLooksGone({ ...base, leaseExpiresAt: 99_000, lastHeardAt: 40_000, listeningSince: 45_000 }),
    ).toBe(false);
  });

  it("elects once the lease lapsed and the host stayed silent for the whole timeout", () => {
    expect(
      hostLooksGone({
        ...base,
        leaseExpiresAt: 99_000,
        lastHeardAt: 40_000,
        listeningSince: base.now - HOST_TIMEOUT_MS - 1,
      }),
    ).toBe(true);
  });

  it("keeps a host whose lease is live even when its heartbeats aren't reaching us", () => {
    expect(
      hostLooksGone({ ...base, leaseExpiresAt: 103_000, lastHeardAt: 0, listeningSince: 0 }),
    ).toBe(false);
  });

  it("keeps a host it heard from recently", () => {
    expect(
      hostLooksGone({ ...base, leaseExpiresAt: 99_000, lastHeardAt: 48_000, listeningSince: 0 }),
    ).toBe(false);
  });

  it("treats a room with no lease as hostless once the host stayed silent", () => {
    expect(
      hostLooksGone({ ...base, leaseExpiresAt: null, lastHeardAt: 0, listeningSince: 0 }),
    ).toBe(true);
  });
});
