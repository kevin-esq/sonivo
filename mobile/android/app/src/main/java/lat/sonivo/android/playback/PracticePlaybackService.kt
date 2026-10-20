package lat.sonivo.android.playback

import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService

/** Owns the single application playback engine and system media session. */
class PracticePlaybackService : MediaSessionService() {
    private var player: ExoPlayer? = null
    private var mediaSession: MediaSession? = null

    override fun onCreate() {
        super.onCreate()
        val httpFactory = DefaultHttpDataSource.Factory().setDefaultRequestProperties(requestHeaders)
        dataSourceFactory = httpFactory
        val mediaSourceFactory = DefaultMediaSourceFactory(DefaultDataSource.Factory(this, httpFactory))
        val engine = ExoPlayer.Builder(this).setMediaSourceFactory(mediaSourceFactory).build()
        player = engine
        mediaSession = MediaSession.Builder(this, engine).build()
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession? = mediaSession

    override fun onDestroy() {
        mediaSession?.run {
            player.release()
            release()
        }
        mediaSession = null
        player = null
        super.onDestroy()
    }

    companion object {
        @Volatile private var requestHeaders: Map<String, String> = emptyMap()
        @Volatile private var dataSourceFactory: DefaultHttpDataSource.Factory? = null

        fun setRequestHeaders(headers: Map<String, String>) {
            requestHeaders = headers
            dataSourceFactory?.setDefaultRequestProperties(headers)
        }
    }
}
