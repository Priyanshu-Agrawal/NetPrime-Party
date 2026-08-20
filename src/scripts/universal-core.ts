/**
 * universal-core.ts — the Universal Userscript Core (Phase 6).
 *
 * This is the shared prefix injected into EVERY provider's WebView at
 * document-start. Per-provider "deltas" (videasy, vidsrc, …) are concatenated
 * AFTER this core and register themselves on `window.__np` to supply the bits
 * that differ (how to find the <video>, how to switch dub/quality tabs).
 *
 * In production the compiled string is served from the Cloudflare Worker and
 * cached in MMKV (cat-and-mouse: fix a broken provider without an app update).
 * This file is the TYPED, in-repo reference — keep it as the source of truth and
 * compile it to the string that gets uploaded.
 *
 * ⚠️ SECURITY / SAFETY NOTES (see NetPrime-Party docs/project-board.md Phase 6):
 * The four "assassins" are deliberately CONSERVATIVE — several naive versions
 * break the very stream they protect. Read the inline notes before hardening.
 * Every protection is device-tested per provider; this is a DRAFT skeleton.
 */

/* -------------------------------------------------------------------------- */
/*  Bridge contract (TypeScript) — what crosses the RN ⇄ WebView boundary.     */
/* -------------------------------------------------------------------------- */

/** Messages the core emits UP to React Native (postMessage payloads). The DATA
 *  fields (currentTime/duration/paused/readyState) match the existing PlayerEvent,
 *  but the event NAMES (`ready`/`timeupdate`/`state`) are the new Phase-6 contract
 *  — RN's onEvent currently keys on the legacy names (`tick`/`playing`/`pause`), so
 *  full wiring needs a small mapping layer (or the core emits legacy names during
 *  the transition). Flagged, not yet reconciled. */
export interface CoreEmit {
  event:
    | "ready" // a controllable <video> was found + bound
    | "timeupdate" // heartbeat: currentTime/duration advanced
    | "state" // paused/buffering changed
    | "error" // provider-level failure (fatal ⇒ host should fall back)
    | "gesture" // first user interaction (play-intent)
    | "quality"
    | "audio";
  currentTime?: number;
  duration?: number;
  paused?: boolean;
  readyState?: number;
  fatal?: boolean;
  message?: string;
  qualities?: { label: string; active: boolean }[];
  audios?: { label: string; active: boolean }[];
}

/** Commands RN sends DOWN via `window.__np.cmd(...)`. */
export interface CoreCommand {
  action:
    | "play"
    | "pause"
    | "seek"
    | "setRate"
    | "readQuality"
    | "setQuality"
    | "readAudio"
    | "setAudio";
  value?: number;
  label?: string;
}

/** A per-provider delta registers this to override provider-specific behaviour. */
export interface ProviderDelta {
  /** Custom locator for providers whose <video> lives in a same-origin iframe /
   *  shadow DOM, or to skip a pre-play poster. Return null to let the core's
   *  default finder keep polling. */
  findVideo?: () => HTMLVideoElement | null;
  /** Open the provider's settings UI, then EMIT a `quality` CoreEmit. Async by
   *  nature (many players must open a tab and wait for it to render), so this
   *  returns void and posts the result rather than returning it. */
  readQuality?: () => void;
  setQuality?: (label: string) => void;
  /** Emits an `audio` CoreEmit (async, same rationale). */
  readAudio?: () => void;
  setAudio?: (label: string) => void;
}

/** The global the core installs; deltas read/extend it. */
export interface UniversalBridge {
  post: (e: CoreEmit) => void;
  registerDelta: (d: ProviderDelta) => void;
  cmd: (c: CoreCommand) => void;
  video: HTMLVideoElement | null;
}

/* -------------------------------------------------------------------------- */
/*  The injected core (document-start). A self-contained IIFE string.          */
/*  NOTE: plain ES5-ish JS, no TS, no template `${}` — it's a raw payload.      */
/* -------------------------------------------------------------------------- */

export const UNIVERSAL_CORE: string = `
(function(){
  if (window.__np) return;
  var W = window, D = document;
  function post(o){ try { W.ReactNativeWebView.postMessage(JSON.stringify(o)); } catch(e){} }
  var np = { post: post, delta: null, video: null,
    registerDelta: function(d){ np.delta = d || null; } };
  W.__np = np;

  /* --- command dispatch (RN → WebView). Generic media commands hit np.video;
     provider-specific ones (quality/audio) route to the registered delta. --- */
  np.cmd = function(c){
    if (!c) return;
    var v = np.video;
    try {
      if (c.action === 'play')            { if (v){ var p = v.play(); if (p && p.catch) p.catch(function(){}); } }
      else if (c.action === 'pause')      { if (v) v.pause(); }
      else if (c.action === 'seek')       { if (v && typeof c.value === 'number') v.currentTime = c.value; }
      else if (c.action === 'setRate')    { if (v && typeof c.value === 'number') v.playbackRate = c.value; }
      else if (c.action === 'readQuality'){ if (np.delta && np.delta.readQuality) np.delta.readQuality(); }
      else if (c.action === 'setQuality') { if (np.delta && np.delta.setQuality) np.delta.setQuality(c.label); }
      else if (c.action === 'readAudio')  { if (np.delta && np.delta.readAudio) np.delta.readAudio(); }
      else if (c.action === 'setAudio')   { if (np.delta && np.delta.setAudio) np.delta.setAudio(c.label); }
    } catch(e){}
  };
  // Back-compat entry point for the current RN PlayerHandle (window.__vlCmd) so
  // the cutover is a drop-in. Maps the old {time,rate} shape onto {value}.
  W.__vlCmd = function(c){ if (c && c.time != null && c.value == null) c.value = c.time; if (c && c.rate != null && c.value == null) c.value = c.rate; np.cmd(c); };

  /* --- play-intent: first user gesture, once (gates the host no-bind timeout) --- */
  try {
    var g = function(){ post({event:'gesture'}); ['pointerdown','touchstart','click'].forEach(function(t){ D.removeEventListener(t,g,true); }); };
    ['pointerdown','touchstart','click'].forEach(function(t){ D.addEventListener(t,g,true); });
  } catch(e){}

  /* ==== 3) POPUP / target=_blank HIJACK BLOCKER (safe; hardens the old bridge) ==== */
  try { Object.defineProperty(W,'open',{ value:function(){ return null; }, writable:false, configurable:false }); }
  catch(e){ try { W.open = function(){ return null; }; } catch(_){} }
  try {
    var _click = HTMLElement.prototype.click;
    HTMLElement.prototype.click = function(){
      var tgt = this && (this.target || (this.getAttribute && this.getAttribute('target')));
      if (this && this.tagName === 'A' && tgt === '_blank') return;   // swallow programmatic popunder
      return _click.apply(this, arguments);
    };
  } catch(e){}
  try {
    D.addEventListener('click', function(ev){
      var a = ev.target && ev.target.closest && ev.target.closest('a[target=_blank]');
      if (a){ ev.preventDefault(); ev.stopPropagation(); }
    }, true);
  } catch(e){}

  /* ==== 1) REDIRECT GUARD (SECONDARY to native onShouldStartLoadWithRequest) ====
     We do NOT freeze location (that breaks legit provider CDN redirects, e.g.
     vidfast pro->vc). Native is the primary top-frame gate. Here we only stop the
     JS ad trick of reassigning location to a DIFFERENT ORIGIN; same-origin SPA
     routing is allowed. */
  try {
    var sameOrigin = function(u){ try { return new URL(u, location.href).origin === location.origin; } catch(e){ return true; } };
    var _assign = location.assign.bind(location), _replace = location.replace.bind(location);
    try { location.assign  = function(u){ if (sameOrigin(u)) return _assign(u);  post({event:'error',fatal:false,message:'blocked x-origin assign'}); }; } catch(e){}
    try { location.replace = function(u){ if (sameOrigin(u)) return _replace(u); post({event:'error',fatal:false,message:'blocked x-origin replace'}); }; } catch(e){}
    try { Object.defineProperty(W,'onbeforeunload',{ get:function(){ return null; }, set:function(){}, configurable:false }); } catch(e){}
  } catch(e){}

  /* ==== 2) INVISIBLE TAP-HIJACK OVERLAY ASSASSIN (CONSERVATIVE) ====
     NOT a blanket z-index>9000 killer — provider chrome legitimately uses high z.
     Only neutralize elements that are (a) fixed/absolute + z>9000, (b) cover ~the
     whole viewport, (c) hold NO <video>/<iframe>, (d) are near-empty (a transparent
     click-catcher). We set pointer-events:none (not remove), so a misfire is
     recoverable. Tune per-provider via the delta if a site needs more/less. */
  try {
    var neutralize = function(el){
      try {
        if (!el || el.nodeType !== 1 || !el.getBoundingClientRect) return;
        var cs = getComputedStyle(el);
        if (cs.position !== 'fixed' && cs.position !== 'absolute') return;
        var z = parseInt(cs.zIndex, 10); if (!(z > 9000)) return;
        var r = el.getBoundingClientRect();
        if (r.width < W.innerWidth * 0.85 || r.height < W.innerHeight * 0.85) return; // not full-viewport
        if (el.querySelector('video,iframe')) return;   // this IS the player container — leave it
        if (el.childElementCount > 3) return;            // real UI, not an empty catcher
        el.style.setProperty('pointer-events','none','important');
      } catch(e){}
    };
    var scan = function(){ try { var a = D.querySelectorAll('div,ins,a,section'); for (var i=0;i<a.length;i++) neutralize(a[i]); } catch(e){} };
    var mo = new MutationObserver(function(m){ for (var i=0;i<m.length;i++){ var n=m[i].addedNodes; for (var j=0;j<n.length;j++) neutralize(n[j]); } });
    var start = function(){ try { mo.observe(D.documentElement, { childList:true, subtree:true }); scan(); } catch(e){} };
    if (D.documentElement) start(); else D.addEventListener('DOMContentLoaded', start);
  } catch(e){}

  /* ==== 4) ANTI-DEBUGGER (MINIMAL — mostly moot here) ====
     'debugger;' is a NO-OP unless a debugger is attached, so in a production RN
     WebView these loops do NOT freeze anything (only matters when WE attach CDP).
     We do the minimal safe thing: strip 'debugger' from STRING args to timers.
     We deliberately DO NOT touch Function.prototype.constructor — that breaks
     HLS.js and anything using new Function(). */
  try {
    var strip = function(fn){ return function(h){ if (typeof h === 'string') h = h.replace(/debugger/g, ''); return fn.apply(this, [h].concat([].slice.call(arguments,1))); }; };
    W.setInterval = strip(W.setInterval);
    W.setTimeout  = strip(W.setTimeout);
  } catch(e){}

  /* ==== SHARED VIDEO FINDER + ready/timeupdate/state contract ====
     Deltas may override np.delta.findVideo for cross-origin iframe / shadow DOM.
     Emits PlayerEvent-shaped messages the existing RN handleMessage understands.
     (Command dispatch + quality/audio tab logic is ported from the current
     BRIDGE_JS during the full Phase-6 build — this draft focuses on the core.) */
  function findVideo(){
    if (np.delta && np.delta.findVideo){ try { var v = np.delta.findVideo(); if (v) return v; } catch(e){} }
    return D.querySelector('video');
  }
  function bind(v){
    if (!v || v.__npBound) return; v.__npBound = true; np.video = v;
    var emit = function(ev){ post({ event: ev, currentTime: v.currentTime||0, duration: v.duration||0, paused: !!v.paused, readyState: v.readyState }); };
    v.addEventListener('timeupdate', function(){ emit('timeupdate'); });
    ['play','playing'].forEach(function(e2){ v.addEventListener(e2, function(){ emit('state'); }); });
    ['pause','waiting','ended','seeking','seeked','canplay'].forEach(function(e2){ v.addEventListener(e2, function(){ emit('state'); }); });
    post({ event:'ready', currentTime: v.currentTime||0, duration: v.duration||0, paused: !!v.paused, readyState: v.readyState });
  }
  var finder = setInterval(function(){ var v = findVideo(); if (v){ clearInterval(finder); bind(v); } }, 250);
})();
`;
