package expo.modules.bearoomglass

import android.graphics.Color
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class BearoomGlassModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("BearoomGlass")

    View(BearoomGlassBackdropView::class) {
      Name("BearoomGlassBackdrop")
    }

    View(BearoomGlassView::class) {
      Name("BearoomGlassView")
      Prop("backdropTag") { view: BearoomGlassView, tag: Int? -> view.setBackdropTag(tag) }
      Prop("blurRadius") { view: BearoomGlassView, dp: Float -> view.setBlurRadiusDp(dp) }
      Prop("saturation") { view: BearoomGlassView, value: Float -> view.setSaturation(value) }
      Prop("baseColor") { view: BearoomGlassView, color: Int? -> view.setBaseColor(color ?: Color.TRANSPARENT) }
      Prop("overlayColor") { view: BearoomGlassView, color: Int? -> view.setOverlayColor(color ?: Color.TRANSPARENT) }
    }
  }
}
