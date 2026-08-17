package {{PACKAGE}}.playback

import android.content.Intent
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class BearoomPlaybackModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "BearoomPlayback"

  @ReactMethod
  fun start(title: String, artworkUrl: String?) {
    BearoomPlaybackHub.reactContext = reactApplicationContext
    val intent = Intent(reactApplicationContext, BearoomPlaybackService::class.java).apply {
      putExtra(BearoomPlaybackService.EXTRA_TITLE, title)
      putExtra(BearoomPlaybackService.EXTRA_ARTWORK, artworkUrl ?: "")
    }
    ContextCompat.startForegroundService(reactApplicationContext, intent)
    BearoomWebViews.setForceWindowVisible(reactApplicationContext.currentActivity, true)
  }

  @ReactMethod
  fun updateState(paused: Boolean, positionSec: Double, durationSec: Double) {
    BearoomPlaybackService.updatePlayback(
      paused = paused,
      positionMs = (positionSec * 1000.0).toLong().coerceAtLeast(0L),
      durationMs = (durationSec * 1000.0).toLong().coerceAtLeast(0L),
    )
  }

  @ReactMethod
  fun stop() {
    val ctx = reactApplicationContext
    BearoomWebViews.setForceWindowVisible(ctx.currentActivity, false)
    ctx.stopService(Intent(ctx, BearoomPlaybackService::class.java))
  }

  /** Required by NativeEventEmitter (even though we emit via DeviceEventEmitter). */
  @ReactMethod
  fun addListener(eventName: String) {
    // no-op
  }

  @ReactMethod
  fun removeListeners(count: Int) {
    // no-op
  }
}
