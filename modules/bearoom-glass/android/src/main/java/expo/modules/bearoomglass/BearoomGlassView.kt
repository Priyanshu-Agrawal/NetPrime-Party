package expo.modules.bearoomglass

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.ColorMatrix
import android.graphics.ColorMatrixColorFilter
import android.graphics.RenderEffect
import android.graphics.RenderNode
import android.graphics.Shader
import android.os.Build
import android.view.View
import android.view.ViewTreeObserver
import android.view.animation.AnimationUtils
import androidx.annotation.RequiresApi
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.views.ExpoView
import kotlin.math.ceil

/**
 * Real glass on Android 12+. Samples its backdrop's shared quarter-resolution copy — only the part under this
 * view, plus a blur margin — into a small RenderNode carrying a RenderEffect blur, scales it back up, and lays
 * an opaque base under it and a tint over it. Every layer involved is tiny, the backdrop's content is rendered
 * once per frame however many glass views use it, and there is no window capture, software drawing or timer.
 */
class BearoomGlassView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  private val blur: Blur? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) Blur() else null
  private var backdrop: BearoomGlassBackdropView? = null
  private var blurRadiusDp = 20f
  private var saturation = 1f
  private var baseColor = Color.TRANSPARENT
  private var overlayColor = Color.TRANSPARENT
  private val own = IntArray(2)
  private val theirs = IntArray(2)
  private var drawnDx = Int.MIN_VALUE
  private var drawnDy = Int.MIN_VALUE

  // Runs only for frames the window draws anyway (scrolling, video, animations) — it never schedules one.
  // - Scrolling and transitions move this view (or the backdrop) without redrawing it: re-check the offset
  //   (two getLocationInWindow calls) and redraw only when it changed.
  // - The renderer caches blur layers and doesn't re-render them when only the content they reference
  //   changes: mark them for re-render in this frame.
  private val frameWatcher = ViewTreeObserver.OnPreDrawListener {
    val b = backdrop
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && blur != null && b != null && canBlur(b)) {
      measureOffset(b)
      if (own[0] != drawnDx || own[1] != drawnDy) {
        invalidate()
      } else {
        b.refreshSmall(AnimationUtils.currentAnimationTimeMillis())
        blur.refresh()
      }
    }
    true
  }

  init {
    setWillNotDraw(false)
  }

  fun setBackdropTag(tag: Int?) {
    backdrop = tag?.let { appContext.findView<BearoomGlassBackdropView>(it) }
    drawnDx = Int.MIN_VALUE
    invalidate()
  }

  fun setBlurRadiusDp(dp: Float) {
    if (dp == blurRadiusDp) return
    blurRadiusDp = dp
    blur?.markDirty()
    invalidate()
  }

  fun setSaturation(value: Float) {
    if (value == saturation) return
    saturation = value
    blur?.markDirty()
    invalidate()
  }

  fun setBaseColor(color: Int) {
    if (color == baseColor) return
    baseColor = color
    invalidate()
  }

  fun setOverlayColor(color: Int) {
    if (color == overlayColor) return
    overlayColor = color
    invalidate()
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    viewTreeObserver.addOnPreDrawListener(frameWatcher)
  }

  override fun onDetachedFromWindow() {
    viewTreeObserver.removeOnPreDrawListener(frameWatcher)
    super.onDetachedFromWindow()
  }

  override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) {}

  override fun onDraw(canvas: Canvas) {
    super.onDraw(canvas)
    val b = backdrop
    val small = b?.small
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && blur != null && b != null && small != null &&
      canvas.isHardwareAccelerated && canBlur(b)
    ) {
      measureOffset(b)
      drawnDx = own[0]
      drawnDy = own[1]
      // The backdrop records content, not the background behind it: without an opaque base, text and gaps in
      // the blurred copy stay see-through and the sharp originals show through the glass.
      if (baseColor != Color.TRANSPARENT) canvas.drawColor(baseColor)
      val radiusPx = blurRadiusDp * resources.displayMetrics.density
      blur.draw(canvas, small, width, height, drawnDx, drawnDy, radiusPx, saturation)
    }
    if (overlayColor != Color.TRANSPARENT) canvas.drawColor(overlayColor)
  }

  /** Attached, sized, and not inside the backdrop (drawing that would make the render tree contain itself). */
  private fun canBlur(b: View): Boolean = b.isAttachedToWindow && width > 0 && height > 0 && !isInside(b)

  /** Leaves this view's offset from the backdrop in own[0], own[1]. */
  private fun measureOffset(b: View) {
    getLocationInWindow(own)
    b.getLocationInWindow(theirs)
    own[0] -= theirs[0]
    own[1] -= theirs[1]
  }

  private fun isInside(b: View): Boolean {
    var p = parent
    while (p != null) {
      if (p === b) return true
      p = p.parent
    }
    return false
  }

  @RequiresApi(Build.VERSION_CODES.S)
  private class Blur {
    private val node = RenderNode("BearoomGlass")
    private var effectDirty = true
    private var flip = false

    fun markDirty() {
      effectDirty = true
    }

    /** Re-render the cached blur layer this frame (a changed property; the pivot has no visible effect). */
    fun refresh() {
      flip = !flip
      node.setPivotX(if (flip) 1f else 0f)
    }

    /** Everything here runs at the backdrop's quarter resolution; the result is scaled up by DOWNSAMPLE. */
    fun draw(canvas: Canvas, small: RenderNode, width: Int, height: Int, dx: Int, dy: Int, radiusPx: Float, saturation: Float) {
      val radius = radiusPx / DOWNSAMPLE
      val margin = ceil(radius).toInt()
      node.setPosition(0, 0, ceil(width / DOWNSAMPLE).toInt() + 2 * margin, ceil(height / DOWNSAMPLE).toInt() + 2 * margin)
      val recording = node.beginRecording()
      try {
        recording.translate(margin - dx / DOWNSAMPLE, margin - dy / DOWNSAMPLE)
        recording.drawRenderNode(small)
      } finally {
        node.endRecording()
      }
      if (effectDirty) {
        node.setRenderEffect(effect(radius, saturation))
        effectDirty = false
      }
      canvas.save()
      canvas.clipRect(0, 0, width, height)
      canvas.scale(DOWNSAMPLE, DOWNSAMPLE)
      canvas.translate(-margin.toFloat(), -margin.toFloat())
      canvas.drawRenderNode(node)
      canvas.restore()
    }

    private fun effect(radius: Float, saturation: Float): RenderEffect {
      val r = radius.coerceAtLeast(1f)
      val blur = RenderEffect.createBlurEffect(r, r, Shader.TileMode.CLAMP)
      if (saturation == 1f) return blur
      val lift = ColorMatrix().apply { setSaturation(saturation) }
      return RenderEffect.createChainEffect(RenderEffect.createColorFilterEffect(ColorMatrixColorFilter(lift)), blur)
    }
  }
}
