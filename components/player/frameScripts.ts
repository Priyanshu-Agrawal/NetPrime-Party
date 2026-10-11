/**
 * frameScripts.ts — the small scripts HijackPlayer injects into (or relays down to) every
 * frame of a provider page: the command relay and the not-found wall watcher.
 */

// Relay fan-out snippet (shared by the injector + the per-frame listener). Posts a
// payload to every CHILD browsing context via window.frames — which, unlike
// document.querySelectorAll('iframe'), reaches frames nested inside a shadow root
// (where videasy mounts its cross-origin <video> frame). Substitute the var name for
// RELAY_MSG. window.frames is a strict superset of the light-DOM iframe list, so it is
// used ALONE — fanning via both would double-deliver and blow up exponentially with
// each frame's re-broadcast.
export const RELAY_FAN_JS =
  "try{for(var _i=0;_i<window.frames.length;_i++){try{window.frames[_i].postMessage(RELAY_MSG,'*');}catch(_e){}}}catch(_e){}";

/** Appended to the injected bridge (runs in each frame): eval relayed code if it came from
 *  this frame's parent with the relay secret, then re-broadcast to this frame's own children
 *  (handles nesting). The top frame never takes relayed code — it runs injectJavaScript
 *  directly — so a child (say, an ad frame that read the secret) can't post code upward. */
export function relayListenerJs(relayNonce: string): string {
  return (
    `;(function(){try{if(window.__vlRelayI)return;window.__vlRelayI=1;` +
    `window.addEventListener('message',function(e){var d=e&&e.data;` +
    `if(d&&d.__vlEval&&d.__vlN===${JSON.stringify(relayNonce)}&&window.parent!==window&&e.source===window.parent){` +
    `try{(0,eval)(d.__vlEval);}catch(_){}` +
    RELAY_FAN_JS.replace("RELAY_MSG", "d") +
    `}});}catch(_){}})();`
  );
}

/** Run `code` in the main frame AND fan it out to all descendant frames. */
export function relayInjectJs(code: string, relayNonce: string): string {
  const payload = JSON.stringify({ __vlEval: code, __vlN: relayNonce });
  return (
    `(function(){var P=${payload};` +
    `try{(0,eval)(P.__vlEval);}catch(e){}` +
    RELAY_FAN_JS.replace("RELAY_MSG", "P") +
    `})();true;`
  );
}

/**
 * Per-mount secrets. `msg` authenticates bridge → app messages and only ever reaches a frame
 * through native injection; `relay` gates relayed code and travels over postMessage, where
 * any frame's own listener can read it — so the two must differ.
 */
export function sessionNonces(): { msg: string; relay: string } {
  const make = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
  return { msg: make(), relay: make() };
}

export // Not-found wall watcher — a SMALL, BUNDLED (non-OTA) scanner injected alongside the
// bridge. Providers answer "no such title" with an HTTP-200 branded wall (e.g. videasy's
// "We couldn't find that / We have searched through our providers…"), so no <video> ever
// binds and no HTTP error fires — the player would otherwise just spin, then reveal that
// raw wall. This polls the page text for the wall signature (ONLY while no <video>
// exists, so it can't fire over a playing-but-unbound frame) and posts a nonce-stamped
// `notFound`, letting the host show its OWN skinned overlay instead of the raw wall.
// Injected into every frame (the wall may live in a provider sub-frame) and captures the
// nonce synchronously BEFORE the bridge deletes window.__vlMsgNonce (bridge runs next).
const WALL_WATCH_JS = `(function(){try{
var N=window.__vlMsgNonce,J=JSON.stringify;
if(window.__vlWall)return;window.__vlWall=1;
var S=["couldn't find that","couldnt find that","could not find that","we couldn't find","we could not find","searched through"];
var n=0;
var iv=setInterval(function(){
n++;
try{if(document.getElementsByTagName('video').length){clearInterval(iv);return;}}catch(e){}
var t='';try{t=((document.body&&(document.body.innerText||document.body.textContent))||'').toLowerCase();}catch(e){}
for(var i=0;i<S.length;i++){if(t.indexOf(S[i])!==-1){clearInterval(iv);
try{window.ReactNativeWebView.postMessage(J({event:'notFound',__n:N}));}catch(e){}return;}}
if(n>=40)clearInterval(iv);
},1000);
}catch(e){}})();`;
