package lat.sonivo.android.data.api

import android.os.Handler
import android.os.Looper
import com.microsoft.signalr.HubConnection
import com.microsoft.signalr.HubConnectionBuilder
import com.microsoft.signalr.TypeReference
import io.reactivex.rxjava3.core.Single
import io.reactivex.rxjava3.schedulers.Schedulers
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import java.lang.reflect.Type

internal data class ConductorPosition(
    val arrangementId: String = "",
    val positionMs: Long = 0,
    val playing: Boolean = false,
    val conductorUserId: String = "",
    val conductorDisplayName: String = "",
)

internal data class PracticeRoomParticipant(
    val connectionId: String = "",
    val userId: String = "",
    val groupId: String = "",
    val displayName: String = "",
    val role: String = "",
)

internal data class BroadcastPositionRequest(
    val eventId: String,
    val arrangementId: String,
    val positionMs: Long,
    val playing: Boolean,
)

/** Authenticated, event-scoped conductor transport. The server remains authoritative for access. */
internal class PracticeRoomConnection(
    private val baseUrl: String,
    private val versionHeaders: Map<String, String>,
    private val accessToken: suspend () -> String?,
    private val onPosition: (ConductorPosition) -> Unit,
    private val onClosed: () -> Unit,
) {
    private val mainHandler = Handler(Looper.getMainLooper())
    private var connection: HubConnection? = null

    fun connect(eventId: String) {
        check(connection == null) { "Practice room is already connected" }
        val tokenProvider = Single.defer {
            Single.fromCallable {
                runBlocking(Dispatchers.IO) {
                    accessToken() ?: error("No access token")
                }
            }.subscribeOn(Schedulers.io())
        }
        val hub = HubConnectionBuilder.create(ApiEndpoints.practiceRoomHub(baseUrl))
            .withHeaders(versionHeaders)
            .withAccessTokenProvider(tokenProvider)
            .build()
        hub.on("PositionUpdate", { position: ConductorPosition ->
            mainHandler.post { onPosition(position) }
        }, ConductorPosition::class.java)
        hub.onClosed { mainHandler.post { onClosed() } }
        connection = hub
        try {
            hub.start().blockingAwait()
            val participantsType: Type = object : TypeReference<Array<PracticeRoomParticipant>>() {}.type
            hub.invoke<Array<PracticeRoomParticipant>>(participantsType, "JoinRoom", eventId).blockingGet()
        } catch (failure: Throwable) {
            connection = null
            runCatching { hub.stop().blockingAwait() }
            throw failure
        }
    }

    fun broadcast(eventId: String, arrangementId: String, positionMs: Long, playing: Boolean) {
        val hub = connection ?: return
        hub.invoke("BroadcastPosition", BroadcastPositionRequest(eventId, arrangementId, positionMs.coerceAtLeast(0), playing))
            .blockingAwait()
    }

    fun close() {
        val hub = connection ?: return
        connection = null
        hub.stop().blockingAwait()
    }
}
