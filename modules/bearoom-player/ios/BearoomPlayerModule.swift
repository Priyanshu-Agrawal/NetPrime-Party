import AVFoundation
import ExpoModulesCore

/// Manual quality for expo-video: caps adaptive selection at a size (AVPlayerItem.preferredMaximumResolution)
/// instead of reloading one variant, so audio and subtitle renditions keep playing. expo-video's player is a
/// SharedRef<AVPlayer>; its class is internal, so the module takes the shared reference.
public class BearoomPlayerModule: Module {
  public func definition() -> ModuleDefinition {
    Name("BearoomPlayer")

    Function("setMaxVideoSize") { (player: SharedRef<AVPlayer>, maxWidth: Double, maxHeight: Double) in
      DispatchQueue.main.async {
        player.ref.currentItem?.preferredMaximumResolution = CGSize(width: maxWidth, height: maxHeight)
      }
    }

    Function("clearMaxVideoSize") { (player: SharedRef<AVPlayer>) in
      DispatchQueue.main.async {
        player.ref.currentItem?.preferredMaximumResolution = .zero
      }
    }
  }
}
