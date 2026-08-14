/**
 * Hijack-capability overlay, keyed by provider id in providers.json.
 *
 * "Hijackable" = the provider renders its <video> somewhere our injected bridge
 * can REACH — the top document, or a SAME-ORIGIN iframe we can walk into — with
 * no Cloudflare wall. That reachability is what lets us drive play/pause/seek for
 * watch-party sync. Providers whose <video> is in a cross-origin iframe (or that
 * block us, or refuse to run outside an iframe) are NOT hijackable and only work
 * for solo watching.
 *
 * Each entry is set from an empirical DOM probe (Playwright deep-find walking
 * same-origin iframes, 2026-08-14). Unlisted providers default to
 * { supported: false } until audited — so the "Watch Party" button only lights up
 * on providers we've actually verified we can control.
 */
export interface HijackCapability {
  /** Do we have a verified hijack (video reachable + controllable)? */
  supported: boolean;
  /** Where the <video> lives, when supported. */
  videoLocation?: "top" | "same-origin-iframe";
  /** Extra hostnames the top frame may navigate to (redirect/CDN), for popup blocking. */
  navHosts?: string[];
  /** Query param that disables the provider's autoplay (so party starts in unison). */
  autoplayParam?: string;
  /**
   * Flaky for sync: the provider hosts its OWN internal server/source picker
   * (multiple upstreams that go offline independently), so different members can
   * land on different/dead streams and playback/sync is unreliable. Still
   * hijackable, but flagged so the UI can warn.
   */
  unstable?: boolean;
  /** When this was probed / any quirks. */
  notes?: string;
}

export const HIJACK_CAPS: Record<string, HijackCapability> = {
  // ================= Verified HIJACKABLE (2026-08-14 DOM probe) =================
  vidfast: {
    supported: true,
    videoLocation: "top",
    navHosts: ["vidfast.pro", "vidfast.vc", "vidfast.to", "vidfast.net"],
    autoplayParam: "autoPlay=false",
    notes: "top-doc video; verified live on device; advertises watch-party. redirects pro→vc",
  },
  vixsrc: {
    supported: true,
    videoLocation: "same-origin-iframe",
    navHosts: ["vixsrc.to"],
    autoplayParam: "autoplay=false",
    notes: "video in same-origin vixsrc.to/embed iframe (bridge walks in); deep catalog",
  },
  vidlink: {
    supported: true,
    videoLocation: "top",
    navHosts: ["vidlink.pro"],
    autoplayParam: "autoplay=false",
    notes: "top-doc video; thinner catalog",
  },
  // videasy IS the app's existing "NetPrime" provider (id: videasy) — now party-capable.
  videasy: {
    supported: true,
    videoLocation: "top",
    navHosts: ["player.videasy.to", "player.videasy.net", "videasy.to", "videasy.net"],
    notes: "NetPrime. Top-doc video created after a user gesture; the bridge polls, so it binds once play is tapped.",
  },
  vidcore: {
    supported: true,
    videoLocation: "top",
    navHosts: ["vidcore.org"],
    autoplayParam: "autoPlay=false",
    notes: "clean single-player, rich params, 4K",
  },
  mycineby: {
    supported: true,
    videoLocation: "top",
    navHosts: ["mycineby.cc"],
    notes: "MyCineBy player, top-doc video",
  },
  vidphantom: {
    supported: true,
    videoLocation: "top",
    navHosts: ["vidphantom.com"],
    notes: "top-doc video",
  },
  vidnest: {
    supported: true,
    videoLocation: "top",
    navHosts: ["vidnest.fun"],
    notes: "top-doc video; movie/tv/anime",
  },
  "111movies": {
    supported: true,
    videoLocation: "top",
    navHosts: ["111movies.com", "111movies.net", "vidlove.cc"],
    unstable: true,
    notes: "hijackable BUT has its own internal server picker (Golem/Archer Queen/… — several OFFLINE); streams flaky per-title → unreliable for sync. Verified live: internal servers offline, 0:00 stream on a new title.",
  },

  // ================= Probed NOT hijackable / unusable =================
  vidsrcTo: { supported: false, notes: "video in cross-origin vsembed.ru iframe" },
  multiembed: { supported: false, notes: "nested cross-origin iframes → video unreachable; ad-heavy" },
  // vsembed.ru (VidSrc), vidsrccc2 (Netflix/vidsrc.cc — 522 down at probe), vidsrcvip2 (Amazon):
  // left default-false (cross-origin family / undetermined).
};
