package expo.modules.bearoomglass

import android.content.Context
import android.graphics.Canvas
import android.graphics.RenderNode
import android.os.Build
import androidx.annotation.RequiresApi
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.views.ExpoView

/**
 * What glass may blur. Records its children into a RenderNode during its normal draw (no extra work — it is
 * the draw that happens anyway) and draws that node; BearoomGlassView draws the same node, blurred.
 */
class BearoomGlassBackdropView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  private val recorder: Recorder? =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) Recorder() else null

  /** The recorded children, or null below Android 12. */
  val renderNode: RenderNode?
    get() = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) recorder?.node else null

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

    fun draw(canvas: Canvas, width: Int, height: Int, drawChildren: (Canvas) -> Unit) {
      node.setPosition(0, 0, width, height)
      val recording = node.beginRecording()
      try {
        drawChildren(recording)
      } finally {
        node.endRecording()
      }
      canvas.drawRenderNode(node)
    }
  }
}
