/**
 * videasy.delta.ts — provider delta for videasy / NetPrime (priority-1).
 *
 * Concatenated AFTER universal-core.ts and injected as one script; it registers
 * itself on `window.__np` (installed by the core). Ported verbatim-in-behaviour
 * from the legacy BRIDGE_JS videasy logic.
 *
 * videasy = a Radix-UI player on player.videasy.to:
 *  - The real <video> is top-document (the core's default finder works). We only
 *    bind a <video> that has a source, to skip the pre-play poster's empty element.
 *  - QUALITY lives in a "Quality" settings tab; DUBS live in a "Servers" tab as
 *    buttons like "FadeHindi audio" (Fade = Hindi, the default).
 *  - Radix only mounts the ACTIVE tab's options, so we must ACTIVATE a tab
 *    before read/set, and a bare `.click()` does NOT flip Radix state — it needs
 *    a full synthetic pointer sequence (verified via CDP on player.videasy.to).
 *
 * Emits `quality` / `audio` CoreEmit messages (the fields RN already consumes).
 */

/** Provider id this delta is keyed to in the worker `scripts` payload. */
export const VIDEASY_DELTA_ID = "videasy";

export const VIDEASY_DELTA: string = `
(function(){
  var np = window.__np; if(!np) return;
  function post(o){ np.post(o); }
  function vid(){ return np.video || document.querySelector('video'); }

  // Full synthetic pointer sequence — the recipe that actually flips videasy's
  // Radix options (a plain .click() is swallowed).
  function hit(el){
    if(!el) return;
    try {
      var r=el.getBoundingClientRect(), x=r.left+r.width/2, y=r.top+r.height/2;
      ['pointerover','pointerenter','pointerdown','pointerup','mousedown','mouseup','click'].forEach(function(t){
        try{ var E=(t.indexOf('pointer')===0)?PointerEvent:MouseEvent; el.dispatchEvent(new E(t,{bubbles:true,cancelable:true,composed:true,clientX:x,clientY:y})); }catch(e){}
      });
    } catch(e){}
  }
  // Radix only renders the ACTIVE tab's options → activate before read/set.
  function activateTab(tab){ hit(document.querySelector('[id*="trigger-'+tab+'"]')); }
  function camelLast(s){ var m=(s||'').match(/[A-Z][a-z]+/g); return m?m[m.length-1]:''; }
  function on(b){ return (b.className||'').indexOf('primary')>=0; }

  /* ---- Quality (the "Quality" tab) ---- */
  function qLabel(t){ t=(t||'').trim(); if(t.indexOf('Auto')===0) return 'Auto'; var i=0; while(i<t.length&&t[i]>='0'&&t[i]<='9')i++; return (i>0&&t[i]==='p')?t.slice(0,i+1):t.slice(0,8); }
  function isQ(t){ t=(t||'').trim(); if(t.indexOf('Auto')===0) return true; var i=0; while(i<t.length&&t[i]>='0'&&t[i]<='9')i++; return i>0&&t[i]==='p'; }
  function qButtons(){ return Array.prototype.slice.call(document.querySelectorAll('button')).filter(function(b){ return isQ(b.textContent); }); }
  function readQuality(){
    activateTab('Quality');
    setTimeout(function(){
      try {
        var seen={}, qs=[], v=vid();
        qButtons().forEach(function(b){ var l=qLabel(b.textContent); if(seen[l])return; seen[l]=1; qs.push({label:l, active:on(b)}); });
        post({ event:'quality', currentTime:(v&&v.currentTime)||0, duration:(v&&v.duration)||0, paused:v?!!v.paused:true, qualities:qs });
      } catch(e){}
    }, 340);
  }
  function setQuality(label){
    activateTab('Quality');
    setTimeout(function(){
      try { var b=qButtons().filter(function(x){ return qLabel(x.textContent)===label; })[0]; if(b){ hit(b); setTimeout(readQuality,600); } } catch(e){}
    }, 300);
  }

  /* ---- Audio / dub (the "Servers" tab; buttons like "FadeHindi audio") ---- */
  function aButtons(){ return Array.prototype.slice.call(document.querySelectorAll('button')).filter(function(b){ var t=(b.textContent||'').trim(); return t.toLowerCase().indexOf('audio')>=0 && t.length<44 && !(b.id&&b.id.indexOf('trigger-')>=0); }); }
  function aLang(b){ var t=(b.textContent||'').trim(); return camelLast(t.split('audio')[0]) || t.slice(0,10); }
  function readAudio(){
    activateTab('Servers');
    setTimeout(function(){
      try {
        var seen={}, as=[], v=vid();
        aButtons().forEach(function(b){ var lang=aLang(b); if(!lang)return; if(seen[lang]){ if(on(b)) as.forEach(function(o){ if(o.label===lang) o.active=true; }); return; } seen[lang]=1; as.push({label:lang, active:on(b)}); });
        post({ event:'audio', currentTime:(v&&v.currentTime)||0, duration:(v&&v.duration)||0, paused:v?!!v.paused:true, audios:as });
      } catch(e){}
    }, 360);
  }
  function setAudio(label){
    activateTab('Servers');
    setTimeout(function(){
      try { var b=aButtons().filter(function(x){ return aLang(x)===label; })[0]; if(b){ hit(b); setTimeout(readAudio,900); } } catch(e){}
    }, 300);
  }

  np.registerDelta({
    // Real videasy <video> is top-document; bind only once it has a source so we
    // skip the pre-play poster's empty <video> element ("fake" pre-play state).
    findVideo: function(){ var v=document.querySelector('video'); return (v && (v.currentSrc || v.src || v.readyState>0)) ? v : null; },
    readQuality: readQuality,
    setQuality: setQuality,
    readAudio: readAudio,
    setAudio: setAudio
  });
})();
`;
