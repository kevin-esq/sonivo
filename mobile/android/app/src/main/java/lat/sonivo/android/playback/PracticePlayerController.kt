package lat.sonivo.android.playback

import android.content.ComponentName
import android.content.Context
import android.net.Uri
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import com.google.common.util.concurrent.ListenableFuture
import com.google.common.util.concurrent.MoreExecutors

class PracticePlayerController(context: Context) {
    private val appContext = context.applicationContext
    private var controller: MediaController? = null
    private var controllerFuture: ListenableFuture<MediaController>? = null

    fun play(uri: String, title: String, headers: Map<String, String>) {
        PracticePlaybackService.setRequestHeaders(headers)
        val current = controller
        if (current != null) {
            current.setMediaItem(mediaItem(uri, title))
            current.prepare()
            current.play()
            return
        }

        val token = SessionToken(appContext, ComponentName(appContext, PracticePlaybackService::class.java))
        val future = MediaController.Builder(appContext, token).buildAsync()
        controllerFuture = future
        future.addListener({
            runCatching {
                future.get().also {
                    controller = it
                    it.setMediaItem(mediaItem(uri, title))
                    it.prepare()
                    it.play()
                }
            }
        }, MoreExecutors.directExecutor())
    }

    fun pause() { controller?.pause() }
    fun resume() { controller?.play() }
    fun seekTo(positionMs: Long) { controller?.seekTo(positionMs.coerceAtLeast(0L)) }
    fun currentPositionMs(): Long = controller?.currentPosition?.coerceAtLeast(0L) ?: 0L
    fun durationMs(): Long = controller?.duration?.takeIf { it > 0L } ?: 0L
    fun isPlaying(): Boolean = controller?.isPlaying == true

    fun release() {
        controller?.release()
        controller = null
        controllerFuture?.let(MediaController::releaseFuture)
        controllerFuture = null
    }

    private fun mediaItem(uri: String, title: String) = MediaItem.Builder()
        .setUri(Uri.parse(uri))
        .setMediaMetadata(MediaMetadata.Builder().setTitle(title).build())
        .build()
}
