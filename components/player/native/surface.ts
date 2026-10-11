/**
 * Android video surface for the native lane. `surfaceView` is composited by the system (no app frame per video
 * frame); `textureView` draws inside the view tree, which live glass over the video needs. Set by the Phase 1B
 * A/B on the phone (docs/project-board.md, "Phase 1B").
 */
export const VIDEO_SURFACE = "surfaceView" as "surfaceView" | "textureView";

/** Live glass over the video needs its frames inside the view tree. */
export const GLASS_OVER_VIDEO = VIDEO_SURFACE === "textureView";
