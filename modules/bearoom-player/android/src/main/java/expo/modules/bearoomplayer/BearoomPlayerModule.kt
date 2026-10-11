package expo.modules.bearoomplayer

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.video.player.VideoPlayer
import kotlinx.coroutines.launch

/**
 * Manual quality for expo-video: caps adaptive track selection at a size instead of reloading one variant, so
 * demuxed audio and subtitle renditions keep playing. ExoPlayer is touched on the main thread only (as expo-video does).
 */
class BearoomPlayerModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("BearoomPlayer")

    Function("setMaxVideoSize") { ref: VideoPlayer, maxWidth: Int, maxHeight: Int ->
      appContext.mainQueue.launch {
        val exo = ref.player
        exo.trackSelectionParameters = exo.trackSelectionParameters.buildUpon()
          .setMaxVideoSize(maxWidth, maxHeight)
          .build()
      }
    }

    Function("clearMaxVideoSize") { ref: VideoPlayer ->
      appContext.mainQueue.launch {
        val exo = ref.player
        exo.trackSelectionParameters = exo.trackSelectionParameters.buildUpon()
          .clearVideoSizeConstraints()
          .build()
      }
    }
  }
}
