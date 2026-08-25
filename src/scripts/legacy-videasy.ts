/**
 * legacy-videasy.ts — the PROVEN legacy BRIDGE_JS, moved verbatim (byte-for-byte)
 * so it can be served over-the-air via the upload CLI + worker /scripts.
 *
 * This is Option 1 of the Phase-6 cutover: we serve the existing, battle-tested
 * injection script (watch-party sync echo-suppression, background keepAlive,
 * lock-screen __soloCmd, guest __vlSetGuest, nativeControls __vlChromeOff, videasy
 * Radix quality/dub, the control-bar CSS fix) with ZERO behaviour change — only
 * the DELIVERY moves from hardcoded-in-binary to Supabase-served. The clean
 * universal-core/videasy.delta split stays in the repo as the future refactor
 * target; this is what actually ships until then.
 *
 * NOT imported by the app (so it is not bundled into the binary) — only the
 * upload CLI reads it. HijackPlayer injects the MMKV-cached served copy.
 */
export const LEGACY_VIDEASY_ID = "videasy";

export const LEGACY_VIDEASY_BRIDGE: string = `
(function(){
  if (window.__vlBridge) return; window.__vlBridge = true;
  function post(o){ try { window.ReactNativeWebView.postMessage(JSON.stringify(o)); } catch(e){} }
  try { window.open = function(){ return null; }; } catch(e){}
  try {
    document.addEventListener('click', function(ev){
      var a = ev.target && ev.target.closest && ev.target.closest('a[target=_blank]');
      if (a){ ev.preventDefault(); ev.stopPropagation(); }
    }, true);
  } catch(e){}
  // First user interaction = play-intent. Lets the host distinguish a real
  // DOM-break (gestured but never bound) from someone idling on the pre-play
  // gate. Passive, fires once, then removes itself.
  try {
    var __g = function(){
      post({ event: 'gesture' });
      document.removeEventListener('pointerdown', __g, true);
      document.removeEventListener('touchstart', __g, true);
      document.removeEventListener('click', __g, true);
    };
    document.addEventListener('pointerdown', __g, true);
    document.addEventListener('touchstart', __g, true);
    document.addEventListener('click', __g, true);
  } catch(e){}
  // Some embed players (videasy) use a FIXED-height bottom control bar
  // (absolute bottom-0 h-44 = 176px). In the short inline/collapsed viewport that
  // bar blankets the vertical-center play/pause/+-10s buttons and, being
  // pointer-events:auto, swallows their taps (fullscreen is tall, so the bar is a
  // thin strip and the same controls work — hence "collapsed broken, expanded
  // fine"). Collapsing it to content height ONLY in short viewports removes the
  // overlap; children keep their own pointer-events, so the scrubber / quality /
  // subtitle controls are unaffected. Verified via CDP on player.videasy.to.
  try {
    var __addSt = function(){
      try {
        if (document.getElementById('__vlStyle')) return;
        var st = document.createElement('style'); st.id = '__vlStyle';
        st.textContent = '@media (max-height:480px){div.absolute.bottom-0.h-44{height:auto!important}}';
        (document.head || document.documentElement).appendChild(st);
      } catch(e){}
    };
    __addSt();
    document.addEventListener('DOMContentLoaded', __addSt);
  } catch(e){}
  var vid = null, applying = 0, wasPlaying = false;
  function markApplying(){ applying = Date.now() + 500; }
  function isApplying(){ return Date.now() < applying; }
  function findVideo(doc){
    try {
      var v = doc.getElementsByTagName('video')[0];
      if (v) return v;
      var frames = doc.getElementsByTagName('iframe');
      for (var i=0;i<frames.length;i++){
        var cd = null; try { cd = frames[i].contentDocument; } catch(e){}
        if (cd){ var r = findVideo(cd); if (r) return r; }
      }
    } catch(e){}
    return null;
  }
  function keepAlive(){
    if (!vid) vid = findVideo(document);
    if (!vid) return;
    if (document.hidden && wasPlaying && vid.paused) {
      markApplying();
      var kp = vid.play();
      if (kp && kp.catch) kp.catch(function(){});
    }
  }
  function bind(v){
    if (!v || v.__vlBound) return; v.__vlBound = true; vid = v;
    wasPlaying = !v.paused;
    ['play','pause','seeking','seeked','ended','waiting','playing','canplay'].forEach(function(ev){
      v.addEventListener(ev, function(){
        if (ev === 'pause' && document.hidden && wasPlaying) { keepAlive(); return; }
        if (isApplying()) return;
        if (ev === 'play' || ev === 'playing') wasPlaying = true;
        if (ev === 'pause' || ev === 'ended') wasPlaying = false;
        post({ event:ev, currentTime:v.currentTime||0, duration:v.duration||0, paused:!!v.paused, readyState:v.readyState });
      });
    });
    post({ event:'ready', currentTime:v.currentTime||0, duration:v.duration||0, paused:!!v.paused, readyState:v.readyState });
  }
  // Persistent finder (NOT one-shot): videasy tears the <video> down when it reverts
  // to its poster on pause and mounts a FRESH element on resume, so a bind-once finder
  // would leave the vid ref pointing at a detached, dead element (resume no-ops). Keep
  // polling: drop a detached vid, and (re)bind whenever the live <video> differs from
  // the bound one. bind() is idempotent (guards on v.__vlBound).
  setInterval(function(){
    // isConnected (not document.contains): findVideo may bind a <video> inside a
    // same-origin sub-iframe, which the TOP document doesn't "contain" — isConnected
    // is true while the element is attached to ANY document, so we only drop it when
    // videasy actually removes it.
    if (vid && vid.isConnected === false) vid = null;
    var v = findVideo(document);
    if (v && v !== vid) bind(v);
  }, 700);
  document.addEventListener('visibilitychange', function(){
    if (!document.hidden) return;
    keepAlive();
    setTimeout(keepAlive, 50);
    setTimeout(keepAlive, 250);
    setTimeout(keepAlive, 1000);
  });
  setInterval(function(){
    keepAlive();
    if (vid) post({ event:'tick', currentTime:vid.currentTime||0, duration:vid.duration||0, paused:!!vid.paused, readyState:vid.readyState });
  }, 1000);
  window.__soloKeepAlive = keepAlive;
  // --- Quality (videasy's settings tab; hls.js isn't reachable, so drive the DOM
  // with the SAME pointer-dispatch recipe the dub switch needs — verified: it
  // flips the active option AND the <video> resolution actually changes). ---
  function __vlPointerHit(el){
    if(!el) return;
    try {
      var r=el.getBoundingClientRect(), x=r.left+r.width/2, y=r.top+r.height/2;
      ['pointerover','pointerenter','pointerdown','pointerup','mousedown','mouseup','click'].forEach(function(t){
        try{ var E=(t.indexOf('pointer')===0)?PointerEvent:MouseEvent; el.dispatchEvent(new E(t,{bubbles:true,cancelable:true,composed:true,clientX:x,clientY:y})); }catch(e){}
      });
    } catch(e){}
  }
  // Radix only renders the ACTIVE settings tab's options → activate before read/set.
  function __vlActivateTab(tab){ __vlPointerHit(document.querySelector('[id*="trigger-'+tab+'"]')); }
  function __vlCamelLast(s){ var m=(s||'').match(/[A-Z][a-z]+/g); return m?m[m.length-1]:''; }
  function __vlOn(b){ return (b.className||'').indexOf('primary')>=0; }
  function __vlQualityLabel(t){ t=(t||'').trim(); if(t.indexOf('Auto')===0) return 'Auto'; var i=0; while(i<t.length&&t[i]>='0'&&t[i]<='9')i++; return (i>0&&t[i]==='p')?t.slice(0,i+1):t.slice(0,8); }
  function __vlIsQuality(t){ t=(t||'').trim(); if(t.indexOf('Auto')===0) return true; var i=0; while(i<t.length&&t[i]>='0'&&t[i]<='9')i++; return i>0&&t[i]==='p'; }
  function __vlQualityButtons(){ return Array.prototype.slice.call(document.querySelectorAll('button')).filter(function(b){ return __vlIsQuality(b.textContent); }); }
  function __vlReadQuality(){
    __vlActivateTab('Quality');
    setTimeout(function(){
      try {
        var seen={}, qs=[];
        __vlQualityButtons().forEach(function(b){ var label=__vlQualityLabel(b.textContent); if(seen[label])return; seen[label]=1; qs.push({label:label, active:__vlOn(b)}); });
        post({ event:'quality', currentTime:(vid&&vid.currentTime)||0, duration:(vid&&vid.duration)||0, paused:vid?!!vid.paused:true, qualities:qs });
      } catch(e){}
    }, 340);
  }
  function __vlSetQuality(label){
    __vlActivateTab('Quality');
    setTimeout(function(){
      try { var b=__vlQualityButtons().filter(function(x){ return __vlQualityLabel(x.textContent)===label; })[0]; if(b){ __vlPointerHit(b); setTimeout(__vlReadQuality,600); } } catch(e){}
    }, 300);
  }
  // Audio / dub = videasy's "Servers" tab: buttons like "FadeHindi audio" → language.
  function __vlAudioButtons(){ return Array.prototype.slice.call(document.querySelectorAll('button')).filter(function(b){ var t=(b.textContent||'').trim(); return t.toLowerCase().indexOf('audio')>=0 && t.length<44 && !(b.id&&b.id.indexOf('trigger-')>=0); }); }
  function __vlAudioLang(b){ var t=(b.textContent||'').trim(); return __vlCamelLast(t.split('audio')[0]) || t.slice(0,10); }
  function __vlReadAudio(){
    __vlActivateTab('Servers');
    setTimeout(function(){
      try {
        var seen={}, as=[];
        __vlAudioButtons().forEach(function(b){ var lang=__vlAudioLang(b); if(!lang)return; if(seen[lang]){ if(__vlOn(b)) as.forEach(function(o){if(o.label===lang)o.active=true;}); return; } seen[lang]=1; as.push({label:lang, active:__vlOn(b)}); });
        post({ event:'audio', currentTime:(vid&&vid.currentTime)||0, duration:(vid&&vid.duration)||0, paused:vid?!!vid.paused:true, audios:as });
      } catch(e){}
    }, 360);
  }
  function __vlSetAudio(label){
    __vlActivateTab('Servers');
    setTimeout(function(){
      try { var b=__vlAudioButtons().filter(function(x){ return __vlAudioLang(x)===label; })[0]; if(b){ __vlPointerHit(b); setTimeout(__vlReadAudio,900); } } catch(e){}
    }, 300);
  }
  // videasy's pre-play / paused "poster card" shows a white round play button and,
  // in that state, the real <video> isn't mounted yet (or was torn down) — so a bare
  // vid.play() can't lift the card. Click videasy's OWN button (needs the full
  // synthetic pointer sequence a plain .click() can't trigger); the finder then
  // re-binds the <video> videasy (re)creates. Selector: a rounded-full bg-white/95
  // circle (verified live on player.videasy.to). NB: this button lives in videasy's
  // top frame; harmless (returns null) in the sub-frame that owns the <video>.
  function __vlPrePlayBtn(){ try { return document.querySelector('button[class*="bg-white/95"], button[class*="bg-white/9"]'); } catch(e){ return null; } }
  window.__vlCmd = function(cmd){
    try {
      // PLAY must work even with NO bound <video> (pure poster state) — handle it
      // before the no-video guard below so we can still click videasy's play button.
      if (cmd.action === 'play') {
        wasPlaying = true;
        var pre = __vlPrePlayBtn();
        if (pre) __vlPointerHit(pre);
        if (vid) { markApplying(); var p = vid.play(); if (p && p.catch) p.catch(function(){}); }
        return;
      }
      if (!vid) return;
      // Only echo-suppress commands that actually emit a listened event (pause/
      // seeked). 'rate' emits 'ratechange' (which we don't observe), so suppressing
      // after it is needless AND harmful: the drift engine nudges playbackRate on
      // nearly every tick, and a blanket markApplying() there was swallowing the
      // user's real play/pause/seek taps during playback.
      if (cmd.action === 'pause') { wasPlaying = false; markApplying(); vid.pause(); }
      else if (cmd.action === 'seek') { markApplying(); vid.currentTime = cmd.time; }
      else if (cmd.action === 'rate') { vid.playbackRate = cmd.rate; }
      else if (cmd.action === 'fullscreen') {
        var fs = vid.requestFullscreen || vid.webkitRequestFullscreen || vid.webkitEnterFullscreen || vid.mozRequestFullScreen;
        if (fs) fs.call(vid);
      }
      else if (cmd.action === 'readQuality') { __vlReadQuality(); }
      else if (cmd.action === 'setQuality') { __vlSetQuality(cmd.label); }
      else if (cmd.action === 'readAudio') { __vlReadAudio(); }
      else if (cmd.action === 'setAudio') { __vlSetAudio(cmd.label); }
    } catch(e){}
  };
  // Lock-screen / notification: drive video WITHOUT markApplying so genuine
  // play/pause/seeked reach handleUserControl (host pauses room, guest detaches).
  window.__soloCmd = function(cmd){
    if (!vid || !cmd) return;
    try {
      if (cmd.action === 'play') {
        wasPlaying = true;
        var up = vid.play();
        if (up && up.catch) up.catch(function(){});
      } else if (cmd.action === 'pause') {
        wasPlaying = false;
        vid.pause();
      } else if (cmd.action === 'seek' && typeof cmd.time === 'number') {
        vid.currentTime = cmd.time;
      }
    } catch(e){}
  };
  // Guest transport-hide: hide the seek bar + play/pause + ±10s for a
  // non-controlling guest (the host owns the timeline). Toggled from RN via
  // window.__vlSetGuest(on). Selectors verified via CDP on player.videasy.to
  // (mobile): [class*=mobileCenterControls] wraps rewind-10 / play-pause /
  // forward-10; the seek bar is a .cursor-pointer container holding a
  // [class*=videoSeekBar] fill. Fullscreen (#ButtonFullscreen) + settings tabs
  // are left alone. A <style> survives React re-renders (selectors re-match).
  var __vlGuestCss = '[class*="mobileCenterControls"]{display:none!important}'
    + '#ButtonPlay{display:none!important}'
    + '[class*="videoSeekBar"]{display:none!important}'
    + 'div.cursor-pointer:has([class*="videoSeekBar"]){display:none!important}';
  function __vlGuestStyleEl(){
    var el = document.getElementById('__vlGuestStyle');
    if (!el){ el = document.createElement('style'); el.id = '__vlGuestStyle'; (document.head||document.documentElement).appendChild(el); }
    return el;
  }
  window.__vlGuest = false;
  window.__vlSetGuest = function(on){
    window.__vlGuest = !!on;
    try { __vlGuestStyleEl().textContent = on ? __vlGuestCss : ''; } catch(e){}
  };
  // Full chrome-off: hide ALL of videasy's controls so our native overlay is the
  // ONLY control surface. In HTML5 fullscreen we RESTORE them — our RN overlay
  // sits behind the native fullscreen view, so quality/subs/server stay reachable
  // there until we build native settings sheets.
  var __vlChromeCss = '[class*="mobileCenterControls"]{display:none!important}'
    + 'div.absolute.bottom-0.h-44{display:none!important}';
  var __vlChromeActive = false;
  function __vlChromeStyleEl(){
    var el = document.getElementById('__vlChromeStyle');
    if (!el){ el = document.createElement('style'); el.id = '__vlChromeStyle'; (document.head||document.documentElement).appendChild(el); }
    return el;
  }
  function __vlApplyChrome(){
    try { __vlChromeStyleEl().textContent = (__vlChromeActive && !document.fullscreenElement) ? __vlChromeCss : ''; } catch(e){}
  }
  window.__vlChromeOff = function(on){ __vlChromeActive = !!on; __vlApplyChrome(); };
  document.addEventListener('fullscreenchange', function(){
    __vlApplyChrome();
    try {
      post({ event: document.fullscreenElement ? 'enterfullscreen' : 'exitfullscreen',
        currentTime: (vid && vid.currentTime) || 0, duration: (vid && vid.duration) || 0,
        paused: vid ? !!vid.paused : true });
    } catch(e){}
  });
  true;
})();
`;
