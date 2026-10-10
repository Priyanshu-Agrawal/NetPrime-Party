/**
 * election.ts — when a guest may start a host election.
 *
 * A host renews its lease every ~2 s and re-broadcasts the snapshot as a heartbeat.
 * A guest only calls the host gone when BOTH signals agree: the lease it knows of has
 * lapsed AND it has heard nothing from the host for HOST_TIMEOUT_MS. Silence is counted
 * from when the guest started listening, not from its join: the snapshot a guest joins
 * with carries a lease that can lapse before its private channel finishes subscribing,
 * and claiming on that alone let a guest seize the room whenever the host's renewal
 * happened to run late.
 */

/** No host heartbeat this long (and a lapsed lease) → consider the host gone. */
export const HOST_TIMEOUT_MS = 7000;

export interface HostLiveness {
  /** Lease expiry on the server clock, as last seen in a snapshot. */
  leaseExpiresAt: number | null | undefined;
  /** Now, on the server clock. */
  serverNow: number;
  /** Device time of the last snapshot we applied (join result or heartbeat). */
  lastHeardAt: number;
  /** Device time our channel started listening for heartbeats. */
  listeningSince: number;
  /** Now, on the device clock. */
  now: number;
}

export function hostLooksGone(p: HostLiveness, timeoutMs = HOST_TIMEOUT_MS): boolean {
  const leaseLapsed = !p.leaseExpiresAt || p.leaseExpiresAt < p.serverNow;
  const silentFor = p.now - Math.max(p.lastHeardAt, p.listeningSince);
  return leaseLapsed && silentFor > timeoutMs;
}
