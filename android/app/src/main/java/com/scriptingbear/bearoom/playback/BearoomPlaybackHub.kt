package com.scriptingbear.bearoom.playback

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext

/**
 * Shared handle between the native module and [BearoomPlaybackService].
 * Remote MediaSession commands are forwarded to JS as `BearoomRemoteCommand`.
 */
internal object BearoomPlaybackHub {
  @Volatile
  var reactContext: ReactApplicationContext? = null

  fun emitRemote(action: String, positionMs: Double? = null) {
    val ctx = reactContext ?: return
    val cmd =
      if (action == "seek" && positionMs != null) {
        val time = positionMs / 1000.0
        "try{window.__soloCmd({action:'seek',time:$time});}catch(e){}"
      } else {
        "try{window.__soloCmd({action:'$action'});}catch(e){}"
      }
    // Drive the <video> from native so lock-screen/notification still work if RN JS is paused.
    BearoomWebViews.inject(ctx.currentActivity, cmd)
    if (action == "pause") BearoomPlaybackService.setPaused(true)
    if (action == "play") BearoomPlaybackService.setPaused(false)

    if (!ctx.hasActiveReactInstance()) return
    val map = Arguments.createMap().apply {
      putString("action", action)
      if (positionMs != null) putDouble("positionMs", positionMs)
    }
    ctx.runOnJSQueueThread {
      ctx.emitDeviceEvent("BearoomRemoteCommand", map)
    }
  }

  fun keepAliveSolo() {
    val ctx = reactContext ?: return
    BearoomWebViews.resume(ctx.currentActivity)
    BearoomWebViews.setForceWindowVisible(ctx.currentActivity, true)
    BearoomWebViews.inject(
      ctx.currentActivity,
      "try{if(window.__soloKeepAlive)window.__soloKeepAlive();}catch(e){}",
    )
  }
}
