package com.cody669.Uott.playback

import android.app.Activity
import android.view.View
import android.view.ViewGroup
import android.webkit.WebView
import com.reactnativecommunity.webview.AlwaysVisibleRNCWebView

internal object BearoomWebViews {
  fun forEach(activity: Activity?, block: (WebView) -> Unit) {
    if (activity == null) return
    walk(activity.window?.decorView, block)
  }

  fun inject(activity: Activity?, js: String) {
    if (activity == null) return
    activity.runOnUiThread {
      forEach(activity) { wv ->
        wv.evaluateJavascript(js, null)
      }
    }
  }

  fun setForceWindowVisible(activity: Activity?, enabled: Boolean) {
    if (activity == null) return
    activity.runOnUiThread {
      forEach(activity) { wv ->
        if (wv is AlwaysVisibleRNCWebView) {
          wv.forceWindowVisible = enabled
        }
      }
    }
  }

  /** Keep Chromium timers/media alive when the Activity is no longer visible. */
  fun resume(activity: Activity?) {
    if (activity == null) return
    activity.runOnUiThread {
      forEach(activity) { wv ->
        wv.resumeTimers()
        wv.onResume()
      }
    }
  }

  private fun walk(view: View?, block: (WebView) -> Unit) {
    if (view == null) return
    if (view is WebView) block(view)
    if (view is ViewGroup) {
      for (i in 0 until view.childCount) walk(view.getChildAt(i), block)
    }
  }
}
