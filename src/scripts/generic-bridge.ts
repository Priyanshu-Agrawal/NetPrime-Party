/**
 * generic-bridge.ts — the provider-agnostic injection bridge (Phase 1A, spec §6.2.4).
 *
 * The proven videasy bridge (legacy-videasy.ts) with every videasy-specific part
 * replaced by a provider-agnostic one: paint only the <video> (chrome-off), bind the
 * feature rather than an ad (longest duration wins, rebinding when a better one
 * mounts), subtitles from textTracks, and a start click from data. Served OTA per
 * provider via scripts/upload-bridge.ts; HijackPlayer sets window.__vlCfg (a
 * BridgeConfig) in its prologue before this runs.
 *
 * NOT imported by the app — only the upload CLI and tests read it.
 * It lives in a template literal: no backticks and no dollar-brace inside.
 */
export const GENERIC_BRIDGE_ID = "generic";

export interface BridgeConfig {
  /** Paint only the <video> from document-start (default false: older app builds send no config and turn it on after bind). */
  chromeOff?: boolean;
  /** Click the provider's start control at 3 s and 8 s if no <video> exists (default true). */
  autoStart?: boolean;
  /** Selectors tried in order before the centre-of-page fallback. */
  startSelectors?: string[];
}

export const GENERIC_BRIDGE: string = `
(function(){
  if (window.__vlBridge) return; window.__vlBridge = true;
  var CFG = window.__vlCfg || {};
  var __vlN; try { __vlN = window.__vlMsgNonce; delete window.__vlMsgNonce; } catch(e){}
  var __rnpost; try { __rnpost = window.ReactNativeWebView.postMessage.bind(window.ReactNativeWebView); } catch(e){}
  // Captured now, before page scripts run: a page that swapped JSON.stringify would see the nonce.
  var __json = JSON.stringify;
  function post(o){ try { if (__vlN !== undefined) o.__n = __vlN; (__rnpost || window.ReactNativeWebView.postMessage)(__json(o)); } catch(e){} }
  function snap(v, o){
    o.currentTime = (v && v.currentTime) || 0;
    o.duration = (v && isFinite(v.duration) && v.duration) || 0;
    o.paused = v ? !!v.paused : true;
    o.readyState = v ? v.readyState : 0;
    return o;
  }

  try { window.open = function(){ return null; }; } catch(e){}
  try {
    document.addEventListener('click', function(ev){
      var a = ev.target && ev.target.closest && ev.target.closest('a[target=_blank]');
      if (a){ ev.preventDefault(); ev.stopPropagation(); }
    }, true);
  } catch(e){}
  try {
    var GEV = ['pointerdown', 'touchstart', 'click'];
    var __g = function(){
      post({ event: 'gesture' });
      GEV.forEach(function(t){ document.removeEventListener(t, __g, true); });
    };
    GEV.forEach(function(t){ document.addEventListener(t, __g, true); });
  } catch(e){}

  // The bound video is also forced opaque: some providers fade their own video out while their
  // (now hidden) UI thinks it hasn't started — VidFast solo plays at opacity 0.
  // Hidden UI still costs: VidFast's kept ~70 style recalcs/s going through transitions (>50% of the
  // page's work), and its looping spinners make the WebView tick the app's main thread every
  // refresh. Our controls own the surface now, so its transitions and animations can stop.
  var CALM_CSS = 'body *:not(video){transition:none!important;animation:none!important}';
  var CHROME_CSS = 'html,body{background:#000!important}body *{visibility:hidden!important}video{visibility:visible!important}video[data-vl-bound]{opacity:1!important}' + CALM_CSS;
  var FRAME_CSS = 'html,body{background:#000!important}body *{visibility:hidden!important}iframe{visibility:visible!important}' + CALM_CSS;
  var chromeOn = CFG.chromeOff === true;
  function styleEl(){
    var el = document.getElementById('__vlChromeStyle');
    if (!el){ el = document.createElement('style'); el.id = '__vlChromeStyle'; (document.head || document.documentElement).appendChild(el); }
    return el;
  }
  function applyChrome(){
    try {
      var css = !chromeOn ? '' : (document.getElementsByTagName('video').length ? CHROME_CSS : FRAME_CSS);
      var el = styleEl(); if (el.textContent !== css) el.textContent = css;
    } catch(e){}
  }
  window.__vlChromeOff = function(on){ chromeOn = !!on; applyChrome(); };
  window.__vlSetGuest = function(){};
  applyChrome();
  try { document.addEventListener('DOMContentLoaded', applyChrome); } catch(e){}

  function collect(doc, out){
    try {
      var vs = doc.getElementsByTagName('video');
      for (var i = 0; i < vs.length; i++) out.push(vs[i]);
      var fs = doc.getElementsByTagName('iframe');
      for (var j = 0; j < fs.length; j++){
        var cd = null; try { cd = fs[j].contentDocument; } catch(e){}
        if (cd) collect(cd, out);
      }
    } catch(e){}
    return out;
  }
  function score(v){
    var d = (isFinite(v.duration) && v.duration > 0) ? v.duration : 0;
    var a = 0; try { var r = v.getBoundingClientRect(); a = r.width * r.height; } catch(e){}
    return d * 1e6 + a;
  }
  function pickVideo(){
    var all = collect(document, []), best = null;
    for (var i = 0; i < all.length; i++){
      if (all[i].isConnected === false) continue;
      if (!best || score(all[i]) > score(best)) best = all[i];
    }
    return best;
  }

  // wantPlay: a play was asked for and not cancelled by a pause. A provider may attach its
  // stream after we bind, so the first play() can land too early (iOS drops it); retry
  // when the video says it can play.
  var vid = null, applying = 0, wasPlaying = false, wantPlay = false;
  // The speed we were asked for (party drift correction, solo speed). Some providers put the
  // video back to 1x on their own (VidFast after a seek), which froze party catch-up — hold it.
  var wantRate = null;
  function holdRate(v){
    if (wantRate == null || !v) return;
    try { if (Math.abs(v.playbackRate - wantRate) > 0.001) v.playbackRate = wantRate; } catch(e){}
  }
  function markApplying(){ applying = Date.now() + 500; }
  function isApplying(){ return Date.now() < applying; }
  function isSubTrack(t){ return !t.kind || t.kind === 'subtitles' || t.kind === 'captions'; }
  // A track can show text if the browser loads it itself (a <track> file) or it holds cues. Tracks
  // a player made but fills itself (VidFast draws its own subtitles) would show nothing when picked.
  // Remembered once seen: browsers report no cues for a track after it's switched off.
  var showable = [];
  function canShow(t, v){
    if (showable.indexOf(t) !== -1) return true;
    var ok = !!(t.cues && t.cues.length);
    try { var els = v.getElementsByTagName('track'); for (var j = 0; j < els.length && !ok; j++) if (els[j].track === t) ok = true; } catch(e){}
    if (ok) showable.push(t);
    return ok;
  }
  function subsOf(v){
    var out = [];
    try {
      var tt = v.textTracks || [];
      for (var i = 0; i < tt.length; i++){
        var t = tt[i];
        if (!isSubTrack(t) || !canShow(t, v)) continue;
        out.push({ id: String(i), label: t.label || t.language || ('Track ' + (i + 1)), language: t.language || '', selected: t.mode === 'showing' });
      }
    } catch(e){}
    return out;
  }
  function postSubs(){ if (vid) post(snap(vid, { event: 'subs', subs: subsOf(vid) })); }
  function postCaps(){
    if (!vid) return;
    post(snap(vid, { event: 'caps', caps: { quality: false, audio: false, subtitles: subsOf(vid).length > 0 } }));
    postSubs();
  }
  function keepAlive(){
    if (!vid) return;
    if (document.hidden && wasPlaying && vid.paused){
      markApplying();
      var p = vid.play(); if (p && p.catch) p.catch(function(){});
    }
  }
  window.__soloKeepAlive = keepAlive;
  function bind(v){
    if (!v || v === vid) return;
    try { if (vid) vid.removeAttribute('data-vl-bound'); v.setAttribute('data-vl-bound', ''); } catch(e){}
    vid = v; wasPlaying = !v.paused;
    holdRate(v);
    if (!v.__vlBound){
      v.__vlBound = true;
      ['play','pause','seeking','seeked','ended','waiting','playing','canplay'].forEach(function(ev){
        v.addEventListener(ev, function(){
          // A removed element fires pause before the next scan swaps it out — not the user's.
          if (v !== vid || v.isConnected === false) return;
          if (ev === 'pause' && document.hidden && wasPlaying){ keepAlive(); return; }
          if (isApplying()) return;
          if (ev === 'play' || ev === 'playing') wasPlaying = true;
          if (ev === 'pause' || ev === 'ended') wasPlaying = false;
          post(snap(v, { event: ev }));
        });
      });
      try { v.addEventListener('loadedmetadata', function(){ if (v === vid) postCaps(); }); } catch(e){}
      v.addEventListener('ratechange', function(){ if (v === vid) holdRate(v); });
      ['canplay', 'loadeddata'].forEach(function(ev){
        v.addEventListener(ev, function(){
          if (v !== vid || !wantPlay || !v.paused) return;
          markApplying();
          var p = v.play(); if (p && p.catch) p.catch(function(){});
        });
      });
      try { if (v.textTracks && v.textTracks.addEventListener) v.textTracks.addEventListener('addtrack', function(){ if (v === vid) postCaps(); }); } catch(e){}
    }
    applyChrome();
    post(snap(v, { event: 'ready' }));
    postCaps();
  }
  function better(c){
    if (!vid || vid.isConnected === false) return true;
    return c !== vid && score(c) > score(vid) * 1.5;
  }
  function scan(){
    var c = pickVideo();
    if (c && better(c)) bind(c);
    else if (vid && vid.isConnected === false) vid = null;
    applyChrome();
  }
  setInterval(scan, 700);
  setInterval(function(){ keepAlive(); if (vid){ holdRate(vid); post(snap(vid, { event: 'tick' })); } }, 1000);
  document.addEventListener('visibilitychange', function(){
    if (!document.hidden) return;
    keepAlive(); setTimeout(keepAlive, 50); setTimeout(keepAlive, 250); setTimeout(keepAlive, 1000);
  });

  function pointerHit(el){
    try {
      var r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
      ['pointerover','pointerenter','pointerdown','pointerup','mousedown','mouseup','click'].forEach(function(t){
        try {
          var E = (t.indexOf('pointer') === 0 && typeof PointerEvent !== 'undefined') ? PointerEvent : MouseEvent;
          el.dispatchEvent(new E(t, { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y }));
        } catch(e){}
      });
    } catch(e){}
  }
  function clickStart(){
    var sels = CFG.startSelectors || [];
    for (var i = 0; i < sels.length; i++){
      var el = null; try { el = document.querySelector(sels[i]); } catch(e){}
      if (el){ pointerHit(el); return true; }
    }
    var c = null; try { c = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2); } catch(e){}
    if (c && c.tagName !== 'IFRAME' && c !== document.body && c !== document.documentElement){ pointerHit(c); return true; }
    return false;
  }
  if (CFG.autoStart !== false){
    [3000, 8000].forEach(function(ms){ setTimeout(function(){ if (!vid || vid.ended) clickStart(); }, ms); });
  }

  window.__vlCmd = function(cmd){
    try {
      if (cmd.action === 'play'){
        wasPlaying = true; wantPlay = true;
        // An ended video is a finished pre-roll ad still in the page: the film needs its start.
        if (!vid || vid.ended){ clickStart(); return; }
        markApplying();
        var p = vid.play(); if (p && p.catch) p.catch(function(){});
        return;
      }
      if (cmd.action === 'readQuality'){ post(snap(vid, { event: 'quality', qualities: [] })); return; }
      if (cmd.action === 'readAudio'){ post(snap(vid, { event: 'audio', audios: [] })); return; }
      if (cmd.action === 'readSubs'){ postSubs(); return; }
      if (cmd.action === 'rate'){ wantRate = cmd.rate; if (vid) vid.playbackRate = cmd.rate; return; }
      if (!vid) return;
      if (cmd.action === 'pause'){ wasPlaying = false; wantPlay = false; markApplying(); vid.pause(); }
      else if (cmd.action === 'seek'){ markApplying(); vid.currentTime = cmd.time; }
      else if (cmd.action === 'setSub'){
        var tt = vid.textTracks || [];
        for (var i = 0; i < tt.length; i++){
          if (!isSubTrack(tt[i])) continue;
          tt[i].mode = (cmd.id != null && String(i) === String(cmd.id)) ? 'showing' : 'disabled';
        }
        postSubs();
      }
      else if (cmd.action === 'fullscreen'){
        var fs = vid.requestFullscreen || vid.webkitRequestFullscreen || vid.webkitEnterFullscreen;
        if (fs) fs.call(vid);
      }
    } catch(e){}
  };
  window.__soloCmd = function(cmd){
    if (!vid || !cmd) return;
    try {
      if (cmd.action === 'play'){ wasPlaying = true; wantPlay = true; var up = vid.play(); if (up && up.catch) up.catch(function(){}); }
      else if (cmd.action === 'pause'){ wasPlaying = false; wantPlay = false; vid.pause(); }
      else if (cmd.action === 'seek' && typeof cmd.time === 'number'){ vid.currentTime = cmd.time; }
    } catch(e){}
  };
  true;
})();
`;
