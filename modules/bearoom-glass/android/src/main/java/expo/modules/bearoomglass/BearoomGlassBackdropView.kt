package expo.modules.bearoomglass

import android.content.Context
import android.graphics.Canvas
import android.graphics.RenderNode
import android.os.Build
import androidx.annotation.RequiresApi
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.views.ExpoView
import kotlin.math.ceil

/** Glass samples the backdrop at 1/DOWNSAMPLE resolution: the blur hides it, and it is 16× fewer pixels. */
internal const val DOWNSAMPLE = 4f

/**
 * What glass may blur. Records its children into a RenderNode during its normal draw (no extra work — it is
 * the draw that happens anyway) and draws that node. Glass views sample a shared quarter-resolution copy of it
 * ([small]), rendered once per frame however many glass views sit on this backdrop.
 *
 * Never wrap a WebView: Chromium draws nothing when drawn scaled (black video), and drawing it a second time
 * per frame at full size made playback 37–50 % janky on the Nothing Phone 1.
 */
class BearoomGlassBackdropView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  private val recorder: Recorder? =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) Recorder() else null

  /** The shared quarter-resolution copy of the children, or null below Android 12. */
  val small: RenderNode?
    get() = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) recorder?.small else null

  /** Re-render [small] in the frame being drawn (once per frame, whichever glass asks first). */
  fun refreshSmall(frameTimeMs: Long) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) recorder?.refresh(frameTimeMs)
  }

  // React Native positions the children; LinearLayout (ExpoView's base) must not re-arrange them.
  override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) {}

  override fun dispatchDraw(canvas: Canvas) {
    val rec = recorder
    if (rec == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.S || !canvas.isHardwareAccelerated) {
      super.dispatchDraw(canvas)
      return
    }
    rec.draw(canvas, width, height) { super.dispatchDraw(it) }
  }

  @RequiresApi(Build.VERSION_CODES.S)
  private class Recorder {
    val node = RenderNode("BearoomGlassBackdrop")

    /** A compositing layer: rendered once per frame, then every glass view only samples its pixels. */
    val small = RenderNode("BearoomGlassBackdropSmall").apply { setUseCompositingLayer(true, null) }
    private var smallW = -1
    private var smallH = -1
    private var flip = false
    private var lastFrameMs = Long.MIN_VALUE

    fun draw(canvas: Canvas, width: Int, height: Int, drawChildren: (Canvas) -> Unit) {
      node.setPosition(0, 0, width, height)
      val recording = node.beginRecording()
      try {
        drawChildren(recording)
      } finally {
        node.endRecording()
      }
      canvas.drawRenderNode(node)

      // The small copy references `node`, so it only needs re-recording when the size changes.
      val w = ceil(width / DOWNSAMPLE).toInt().coerceAtLeast(1)
      val h = ceil(height / DOWNSAMPLE).toInt().coerceAtLeast(1)
      if (w != smallW || h != smallH) {
        small.setPosition(0, 0, w, h)
        val rec = small.beginRecording()
        try {
          rec.scale(1f / DOWNSAMPLE, 1f / DOWNSAMPLE)
          rec.drawRenderNode(node)
        } finally {
          small.endRecording()
        }
        smallW = w
        smallH = h
      }
    }

    /**
     * The renderer caches the layer and doesn't re-render it when only the content it references changes; a
     * changed property makes it. The pivot has no visible effect (no rotation or scale) and setting it never
     * schedules a frame.
     */
    fun refresh(frameTimeMs: Long) {
      if (frameTimeMs == lastFrameMs) return
      lastFrameMs = frameTimeMs
      flip = !flip
      small.setPivotX(if (flip) 1f else 0f)
    }
  }
}
