package com.cody669.Uott.playback

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.support.v4.media.MediaMetadataCompat
import android.support.v4.media.session.MediaSessionCompat
import android.support.v4.media.session.PlaybackStateCompat
import androidx.core.app.NotificationCompat
import androidx.media.app.NotificationCompat as MediaNotificationCompat
import com.cody669.Uott.MainActivity
import com.cody669.Uott.R
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

/**
 * Foreground media service so Android 16 will not mute WebView audio, plus a
 * MediaSession that drives the lock-screen / notification controls.
 * Audio still comes from the WebView — this service does not play anything.
 */
class BearoomPlaybackService : Service() {

  companion object {
    const val CHANNEL_ID = "bearoom_playback"
    const val NOTIF_ID = 42
    const val EXTRA_TITLE = "title"
    const val EXTRA_ARTWORK = "artworkUrl"
    const val ACTION_REMOTE_PLAY = "com.cody669.Uott.playback.PLAY"
    const val ACTION_REMOTE_PAUSE = "com.cody669.Uott.playback.PAUSE"
    const val ACTION_REMOTE_STOP = "com.cody669.Uott.playback.STOP"

    @Volatile
    private var instance: BearoomPlaybackService? = null

    fun updatePlayback(paused: Boolean, positionMs: Long, durationMs: Long) {
      val svc = instance ?: return
      svc.main.post { svc.applyPlayback(paused, positionMs, durationMs) }
    }

    fun setPaused(paused: Boolean) {
      val svc = instance ?: return
      svc.main.post { svc.applyPlayback(paused, svc.positionMs, svc.durationMs) }
    }
  }

  private var mediaSession: MediaSessionCompat? = null
  private var audioManager: AudioManager? = null
  private var focusRequest: AudioFocusRequest? = null
  private var title: String = "Bearoom"
  private var artwork: Bitmap? = null
  private var paused: Boolean = false
  private var positionMs: Long = 0
  private var durationMs: Long = 0
  private val io = Executors.newSingleThreadExecutor()
  private val main = Handler(Looper.getMainLooper())
  private val keepAliveTick =
    object : Runnable {
      override fun run() {
        // Resume Chromium timers only — do not hammer video.play() (audio-focus spam).
        if (!paused) {
          BearoomPlaybackHub.reactContext?.let { BearoomWebViews.resume(it.currentActivity) }
        }
        main.postDelayed(this, 2000)
      }
    }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    instance = this
    ensureChannel()
    audioManager = getSystemService(AUDIO_SERVICE) as AudioManager
    requestAudioFocus()

    val session = MediaSessionCompat(this, "BearoomPlayback").apply {
      setCallback(
        object : MediaSessionCompat.Callback() {
          override fun onPlay() {
            BearoomPlaybackHub.emitRemote("play")
          }

          override fun onPause() {
            BearoomPlaybackHub.emitRemote("pause")
          }

          override fun onStop() {
            BearoomPlaybackHub.emitRemote("pause")
          }

          override fun onSeekTo(pos: Long) {
            BearoomPlaybackHub.emitRemote("seek", pos.toDouble())
          }
        },
      )
      isActive = true
    }
    mediaSession = session
    main.post(keepAliveTick)
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_REMOTE_PLAY -> BearoomPlaybackHub.emitRemote("play")
      ACTION_REMOTE_PAUSE -> BearoomPlaybackHub.emitRemote("pause")
      ACTION_REMOTE_STOP -> BearoomPlaybackHub.emitRemote("pause")
    }
    intent?.getStringExtra(EXTRA_TITLE)?.takeIf { it.isNotBlank() }?.let { title = it }
    val artUrl = intent?.getStringExtra(EXTRA_ARTWORK)
    startForegroundInternal()
    if (!artUrl.isNullOrBlank()) loadArtwork(artUrl)
    publish()
    return START_STICKY
  }

  private fun remotePending(action: String): PendingIntent {
    val i = Intent(this, BearoomPlaybackService::class.java).setAction(action)
    return PendingIntent.getService(
      this,
      action.hashCode(),
      i,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }

  override fun onDestroy() {
    main.removeCallbacks(keepAliveTick)
    abandonAudioFocus()
    mediaSession?.isActive = false
    mediaSession?.release()
    mediaSession = null
    io.shutdownNow()
    instance = null
    super.onDestroy()
  }

  private fun applyPlayback(paused: Boolean, positionMs: Long, durationMs: Long) {
    this.paused = paused
    this.positionMs = positionMs
    if (durationMs > 0) this.durationMs = durationMs
    publish()
  }

  private fun publish() {
    val session = mediaSession ?: return
    val state =
      if (paused) PlaybackStateCompat.STATE_PAUSED else PlaybackStateCompat.STATE_PLAYING
    val speed = if (paused) 0f else 1f
    session.setPlaybackState(
      PlaybackStateCompat.Builder()
        .setActions(
          PlaybackStateCompat.ACTION_PLAY or
            PlaybackStateCompat.ACTION_PAUSE or
            PlaybackStateCompat.ACTION_PLAY_PAUSE or
            PlaybackStateCompat.ACTION_SEEK_TO or
            PlaybackStateCompat.ACTION_STOP,
        )
        .setState(state, positionMs, speed)
        .build(),
    )
    val meta =
      MediaMetadataCompat.Builder()
        .putString(MediaMetadataCompat.METADATA_KEY_TITLE, title)
        .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, "Bearoom")
        .putLong(MediaMetadataCompat.METADATA_KEY_DURATION, durationMs)
    artwork?.let {
      meta.putBitmap(MediaMetadataCompat.METADATA_KEY_ALBUM_ART, it)
      meta.putBitmap(MediaMetadataCompat.METADATA_KEY_DISPLAY_ICON, it)
    }
    session.setMetadata(meta.build())
    val nm = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
    nm.notify(NOTIF_ID, buildNotification())
  }

  private fun startForegroundInternal() {
    val notif = buildNotification()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(NOTIF_ID, notif, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
    } else {
      startForeground(NOTIF_ID, notif)
    }
  }

  private fun buildNotification(): Notification {
    val session = mediaSession
    val launch =
      PendingIntent.getActivity(
        this,
        0,
        Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )
    val playPauseAction =
      if (paused) {
        NotificationCompat.Action(
          android.R.drawable.ic_media_play,
          "Play",
          remotePending(ACTION_REMOTE_PLAY),
        )
      } else {
        NotificationCompat.Action(
          android.R.drawable.ic_media_pause,
          "Pause",
          remotePending(ACTION_REMOTE_PAUSE),
        )
      }
    val builder =
      NotificationCompat.Builder(this, CHANNEL_ID)
        .setContentTitle(title)
        .setContentText("Bearoom")
        .setSmallIcon(R.drawable.ic_stat_play)
        .setContentIntent(launch)
        .setOngoing(!paused)
        .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
        .setOnlyAlertOnce(true)
        .addAction(playPauseAction)
        .setStyle(
          MediaNotificationCompat.MediaStyle()
            .setMediaSession(session?.sessionToken)
            .setShowActionsInCompactView(0)
            .setShowCancelButton(true)
            .setCancelButtonIntent(remotePending(ACTION_REMOTE_STOP)),
        )
    artwork?.let { builder.setLargeIcon(it) }
    return builder.build()
  }

  private fun ensureChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val nm = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
    if (nm.getNotificationChannel(CHANNEL_ID) != null) return
    val ch =
      NotificationChannel(CHANNEL_ID, "Playback", NotificationManager.IMPORTANCE_LOW).apply {
        setSound(null, null)
        lockscreenVisibility = Notification.VISIBILITY_PUBLIC
        setShowBadge(false)
      }
    nm.createNotificationChannel(ch)
  }

  private fun requestAudioFocus() {
    val am = audioManager ?: return
    val attrs =
      AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_MEDIA)
        .setContentType(AudioAttributes.CONTENT_TYPE_MOVIE)
        .build()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val req =
        AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
          .setAudioAttributes(attrs)
          .setOnAudioFocusChangeListener { }
          .build()
      focusRequest = req
      am.requestAudioFocus(req)
    } else {
      @Suppress("DEPRECATION")
      am.requestAudioFocus(null, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN)
    }
  }

  private fun abandonAudioFocus() {
    val am = audioManager ?: return
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      focusRequest?.let { am.abandonAudioFocusRequest(it) }
    } else {
      @Suppress("DEPRECATION")
      am.abandonAudioFocus(null)
    }
  }

  private fun loadArtwork(url: String) {
    io.execute {
      try {
        val conn = URL(url).openConnection() as HttpURLConnection
        conn.connectTimeout = 5000
        conn.readTimeout = 5000
        conn.instanceFollowRedirects = true
        conn.inputStream.use { stream ->
          val bmp = BitmapFactory.decodeStream(stream)
          artwork = bmp
          main.post { publish() }
        }
      } catch (_: Exception) {
        // Artwork is optional — session still works without it.
      }
    }
  }
}
