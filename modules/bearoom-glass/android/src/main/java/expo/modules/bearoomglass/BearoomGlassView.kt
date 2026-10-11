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
import androidx.annotation.RequiresApi
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.views.ExpoView
import kotlin.math.ceil

/**
 * Real glass on Android 12+. Draws its backdrop's RenderNode — clipped to this view plus a blur margin — into a
 * small RenderNode carrying a RenderEffect blur, then an overlay tint. The offscreen layer is this view's size,
 * not the backdrop's, so a tab bar costs a tab bar's worth of GPU. No window capture, no software drawing, no
 * timers: content changes flow through because the small node references the backdrop's node.
 */
class BearoomGlassView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  private val blur: Blur? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) Blur() else null
  private var backdrop: BearoomGlassBackdropView? = null
  private var blurRadiusDp = 20f
  private var saturation = 1f
  private var overlayColor = Color.TRANSPARENT
  private val own = IntArray(2)
  private val theirs = IntArray(2)
  private var drawnDx = Int.MIN_VALUE
  private var drawnDy = Int.MIN_VALUE

  // Scrolling and transitions move this view (or the backdrop) without redrawing it: re-check the offset each
  // frame — two getLocationInWindow calls — and redraw only when it changed.
  private val offsetWatcher = ViewTreeObserver.OnPreDrawListener {
    val b = backdrop
    if (blur != null && b != null && b.isAttachedToWindow) {
      measureOffset(b)
      if (own[0] != drawnDx || own[1] != drawnDy) invalidate()
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

  fun setOverlayColor(color: Int) {
    if (color == overlayColor) return
    overlayColor = color
    invalidate()
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    viewTreeObserver.addOnPreDrawListener(offsetWatcher)
  }

  override fun onDetachedFromWindow() {
    viewTreeObserver.removeOnPreDrawListener(offsetWatcher)
    super.onDetachedFromWindow()
  }

  override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) {}

  override fun onDraw(canvas: Canvas) {
    super.onDraw(canvas)
    val b = backdrop
    val source = b?.renderNode
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && blur != null && b != null && source != null &&
      canvas.isHardwareAccelerated && b.isAttachedToWindow && width > 0 && height > 0 && !isInside(b)
    ) {
      measureOffset(b)
      drawnDx = own[0]
      drawnDy = own[1]
      val radiusPx = blurRadiusDp * resources.displayMetrics.density
      blur.draw(canvas, source, width, height, drawnDx, drawnDy, radiusPx, saturation)
    }
    if (overlayColor != Color.TRANSPARENT) canvas.drawColor(overlayColor)
  }

  /** Leaves this view's offset from the backdrop in own[0], own[1]. */
  private fun measureOffset(b: View) {
    getLocationInWindow(own)
    b.getLocationInWindow(theirs)
    own[0] -= theirs[0]
    own[1] -= theirs[1]
  }

  /** Drawing a backdrop we sit inside would make the render tree contain itself (libhwui recursion crash). */
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

    fun markDirty() {
      effectDirty = true
    }

    fun draw(canvas: Canvas, source: RenderNode, width: Int, height: Int, dx: Int, dy: Int, radiusPx: Float, saturation: Float) {
      val margin = ceil(radiusPx).toInt()
      node.setPosition(0, 0, width + 2 * margin, height + 2 * margin)
      val recording = node.beginRecording()
      try {
        recording.translate((margin - dx).toFloat(), (margin - dy).toFloat())
        recording.drawRenderNode(source)
      } finally {
        node.endRecording()
      }
      if (effectDirty) {
        node.setRenderEffect(effect(radiusPx, saturation))
        effectDirty = false
      }
      canvas.save()
      canvas.clipRect(0, 0, width, height)
      canvas.translate(-margin.toFloat(), -margin.toFloat())
      canvas.drawRenderNode(node)
      canvas.restore()
    }

    private fun effect(radiusPx: Float, saturation: Float): RenderEffect {
      val r = radiusPx.coerceAtLeast(1f)
      val blur = RenderEffect.createBlurEffect(r, r, Shader.TileMode.CLAMP)
      if (saturation == 1f) return blur
      val lift = ColorMatrix().apply { setSaturation(saturation) }
      return RenderEffect.createChainEffect(RenderEffect.createColorFilterEffect(ColorMatrixColorFilter(lift)), blur)
    }
  }
}
