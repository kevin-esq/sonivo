package lat.sonivo.android.data.api

import lat.sonivo.android.BuildConfig
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.io.File
import java.io.InputStream
import java.nio.charset.StandardCharsets

data class MobileGroup(val id: String, val name: String, val role: String, val slug: String)
data class MobileEvent(val id: String, val title: String, val type: String, val startsAt: String, val status: String, val version: Int)
data class MobileSong(val id: String, val title: String)
data class MobileResourceAccessEntry(val resourceType: String, val resourceId: String, val label: String, val granted: Boolean?)
data class MobileArrangementSummary(val id: String, val songId: String, val label: String, val defaultKey: String?, val defaultBpm: Int?, val version: Int, val songTitle: String? = null)
data class MobileResource(val id: String, val kind: String, val purpose: String, val label: String, val contentType: String?)
data class MobileArrangement(val id: String, val songId: String, val label: String, val defaultKey: String?, val defaultBpm: Int?, val version: Int, val lyrics: String?, val chords: String?, val structure: String?, val notes: String?, val chordTimingJson: String?, val resources: List<MobileResource>)
data class MobileSetlistSummary(val id: String, val name: String, val version: Int, val itemCount: Int)
data class MobileSetlistItem(val id: String, val arrangementId: String, val songTitle: String?, val arrangementLabel: String?)
data class MobileSetlist(val id: String, val name: String, val version: Int, val items: List<MobileSetlistItem>)

class MobileApiException(val status: Int, val code: String?, val minimumVersion: String?, val storeUrl: String?) : Exception()

class NativeApiClient(private val baseUrl: String = BuildConfig.API_BASE_URL) {
    fun createTask(groupId: String, title: String, accessToken: String, notes: String? = null, dueAt: String? = null, assigneeUserId: String? = null) {
        val connection = openConnection(ApiEndpoints.tasks(groupId), accessToken, "POST")
        connection.doOutput = true
        connection.setRequestProperty("Content-Type", "application/json")
        try {
            connection.outputStream.use { it.write(JSONObject(mapOf("title" to title, "notes" to notes, "dueAt" to dueAt, "assigneeUserId" to assigneeUserId)).toString().toByteArray()) }
            val status = connection.responseCode
            if (status == 426) {
                val problem = JSONObject(connection.errorStream.bufferedReader().use { it.readText() })
                throw MobileApiException(status, problem.optString("code"), problem.optString("minimumVersion"), problem.optString("storeUrl"))
            }
            if (status !in 200..299) throw MobileApiException(status, null, null, null)
        } finally { connection.disconnect() }
    }

    fun createEvent(groupId: String, title: String, type: String, startsAt: String, accessToken: String) {
        val connection = openConnection(ApiEndpoints.events(groupId), accessToken, "POST")
        connection.doOutput = true
        connection.setRequestProperty("Content-Type", "application/json")
        try {
            connection.outputStream.use { it.write(JSONObject(mapOf("title" to title, "type" to type, "startsAt" to startsAt)).toString().toByteArray()) }
            val status = connection.responseCode
            if (status == 426) {
                val problem = JSONObject(connection.errorStream.bufferedReader().use { it.readText() })
                throw MobileApiException(status, problem.optString("code"), problem.optString("minimumVersion"), problem.optString("storeUrl"))
            }
            if (status !in 200..299) throw MobileApiException(status, null, null, null)
        } finally { connection.disconnect() }
    }

    fun createSetlist(groupId: String, name: String, accessToken: String) {
        postJson(ApiEndpoints.setlists(groupId), JSONObject().put("name", name), accessToken)
    }

    fun renameSetlist(groupId: String, setlistId: String, name: String, expectedVersion: Int, accessToken: String) {
        patchJson(ApiEndpoints.setlist(groupId, setlistId), JSONObject().put("name", name).put("expectedVersion", expectedVersion), accessToken)
    }

    fun createSong(groupId: String, title: String, originKind: String, accessToken: String, attribution: String = "", rightsNotes: String = "", tags: List<String> = emptyList()) {
        postJson(ApiEndpoints.songs(groupId), JSONObject().put("title", title).put("originKind", originKind).put("attribution", attribution).put("rightsNotes", rightsNotes).put("tags", JSONArray(tags)), accessToken)
    }

    fun updateSong(groupId: String, songId: String, title: String, expectedVersion: Int, accessToken: String, originKind: String = "original", attribution: String = "", rightsNotes: String = "", tags: List<String> = emptyList()) {
        patchJson(ApiEndpoints.song(groupId, songId), JSONObject().put("title", title).put("expectedVersion", expectedVersion).put("originKind", originKind).put("attribution", attribution).put("rightsNotes", rightsNotes).put("tags", JSONArray(tags)), accessToken)
    }

    fun updateBranding(groupId: String, expectedVersion: Int, displayName: String, accentHex: String, secondaryHex: String, accessToken: String, additionalFields: Map<String, String> = emptyMap()) {
        val body = JSONObject().put("expectedVersion", expectedVersion).put("displayName", displayName).put("accentHex", accentHex).put("secondaryHex", secondaryHex)
        additionalFields.forEach { (key, value) ->
            if (key == "showSonivoCredit") body.put(key, value.toBoolean())
            else body.put(key, if (value.isBlank()) JSONObject.NULL else value)
        }
        putJson(ApiEndpoints.destination("settings", groupId)!!, body, accessToken)
    }

    fun getGroupNotificationPreferences(groupId: String, accessToken: String): Pair<Boolean, Boolean> {
        val body = JSONObject(get(ApiEndpoints.groupNotificationPreferences(groupId), accessToken))
        return body.optBoolean("notifyRoleChanges", true) to body.optBoolean("notifyTaskAssignments", true)
    }

    fun updateGroupNotificationPreferences(groupId: String, notifyRoleChanges: Boolean, notifyTaskAssignments: Boolean, accessToken: String) {
        putJson(ApiEndpoints.groupNotificationPreferences(groupId), JSONObject().put("notifyRoleChanges", notifyRoleChanges).put("notifyTaskAssignments", notifyTaskAssignments), accessToken)
    }

    fun renameGroup(groupId: String, name: String, expectedVersion: Int, accessToken: String) {
        patchJson(ApiEndpoints.group(groupId), JSONObject().put("name", name).put("expectedVersion", expectedVersion), accessToken)
    }

    fun deleteGroup(groupId: String, expectedVersion: Int, accessToken: String) {
        deleteJson(ApiEndpoints.group(groupId), JSONObject().put("expectedVersion", expectedVersion), accessToken)
    }

    fun uploadBrandingAsset(groupId: String, kind: String, fileName: String, contentType: String, input: InputStream, accessToken: String) {
        require(kind in setOf("logo", "banner", "favicon"))
        val boundary = "Sonivo-${System.currentTimeMillis()}"
        val connection = openConnection(ApiEndpoints.groupBrandingAsset(groupId, kind), accessToken, "POST")
        connection.doOutput = true
        connection.setChunkedStreamingMode(64 * 1024)
        connection.setRequestProperty("Content-Type", "multipart/form-data; boundary=$boundary")
        try {
            connection.outputStream.buffered().use { output ->
                val safeName = fileName.map { if (it == '\\' || it == '"' || it == '\r' || it == '\n') '_' else it }.joinToString("")
                output.write("--$boundary\r\nContent-Disposition: form-data; name=\"file\"; filename=\"$safeName\"\r\nContent-Type: $contentType\r\n\r\n".toByteArray(StandardCharsets.UTF_8))
                input.use { it.copyTo(output) }
                output.write("\r\n--$boundary--\r\n".toByteArray(StandardCharsets.UTF_8))
            }
            val status = connection.responseCode
            val body = (if (status in 200..299) connection.inputStream else connection.errorStream)?.bufferedReader()?.use { it.readText() }.orEmpty()
            if (status == 426) {
                val problem = JSONObject(body)
                throw MobileApiException(status, problem.optString("code"), problem.optString("minimumVersion"), problem.optString("storeUrl"))
            }
            if (status !in 200..299) throw MobileApiException(status, null, null, null)
        } finally { connection.disconnect() }
    }

    fun deleteSong(groupId: String, songId: String, expectedVersion: Int, accessToken: String) {
        deleteJson(ApiEndpoints.song(groupId, songId), JSONObject().put("expectedVersion", expectedVersion), accessToken)
    }

    fun createLinkResource(groupId: String, arrangementId: String, label: String, url: String, purpose: String, accessToken: String, part: String = "", note: String = "") {
        postJson(ApiEndpoints.arrangementResources(groupId, arrangementId), JSONObject().put("kind", "link").put("label", label).put("url", url).put("purpose", purpose).put("part", part.ifBlank { JSONObject.NULL }).put("note", note.ifBlank { JSONObject.NULL }), accessToken)
    }

    fun updateLinkResource(groupId: String, arrangementId: String, resourceId: String, label: String, part: String, note: String, accessToken: String) {
        patchJson(ApiEndpoints.arrangementResource(groupId, arrangementId, resourceId), JSONObject().put("label", label).put("part", part.ifBlank { JSONObject.NULL }).put("note", note.ifBlank { JSONObject.NULL }), accessToken)
    }

    fun deleteResource(groupId: String, arrangementId: String, resourceId: String, accessToken: String) {
        delete(ApiEndpoints.arrangementResource(groupId, arrangementId, resourceId), accessToken)
    }

    fun uploadFileResource(groupId: String, arrangementId: String, label: String, purpose: String, fileName: String, contentType: String, input: InputStream, accessToken: String, part: String = "", note: String = "") {
        val boundary = "Sonivo-${System.currentTimeMillis()}"
        val connection = openConnection(ApiEndpoints.arrangementResources(groupId, arrangementId), accessToken, "POST")
        connection.doOutput = true
        connection.setChunkedStreamingMode(64 * 1024)
        connection.setRequestProperty("Content-Type", "multipart/form-data; boundary=$boundary")
        try {
            connection.outputStream.buffered().use { output ->
                val safeFileName = fileName.map { if (it == '\\' || it == '"' || it == '\r' || it == '\n') '_' else it }.joinToString("")
                fun field(name: String, value: String) {
                    output.write("--$boundary\r\nContent-Disposition: form-data; name=\"$name\"\r\n\r\n$value\r\n".toByteArray(StandardCharsets.UTF_8))
                }
                field("purpose", purpose)
                field("label", label)
                if (part.isNotBlank()) field("part", part)
                if (note.isNotBlank()) field("note", note)
                output.write("--$boundary\r\nContent-Disposition: form-data; name=\"file\"; filename=\"$safeFileName\"\r\nContent-Type: $contentType\r\n\r\n".toByteArray(StandardCharsets.UTF_8))
                input.use { it.copyTo(output) }
                output.write("\r\n--$boundary--\r\n".toByteArray(StandardCharsets.UTF_8))
            }
            val status = connection.responseCode
            val body = (if (status in 200..299) connection.inputStream else connection.errorStream)?.bufferedReader()?.use { it.readText() }.orEmpty()
            if (status == 426) {
                val problem = JSONObject(body)
                throw MobileApiException(status, problem.optString("code"), problem.optString("minimumVersion"), problem.optString("storeUrl"))
            }
            if (status !in 200..299) throw MobileApiException(status, null, null, null)
        } finally { connection.disconnect() }
    }

    fun listGroups(accessToken: String): List<MobileGroup> {
        val response = request(ApiEndpoints.groups(), accessToken)
        val groups = JSONArray(response)
        return buildList {
            for (index in 0 until groups.length()) {
                val group = groups.getJSONObject(index)
                add(MobileGroup(group.getString("id"), group.getString("name"), group.optString("role"), group.getString("slug")))
            }
        }
    }

    fun createGroup(name: String, accessToken: String): MobileGroup {
        val group = JSONObject(postJson(ApiEndpoints.groups(), JSONObject().put("name", name), accessToken))
        return MobileGroup(
            group.getString("id"),
            group.getString("name"),
            group.optString("role", "Owner"),
            group.optString("slug"),
        )
    }

    fun listEvents(groupId: String, accessToken: String): List<MobileEvent> {
        val events = JSONArray(request(ApiEndpoints.events(groupId), accessToken))
        return buildList {
            for (index in 0 until events.length()) {
                val event = events.getJSONObject(index)
                add(MobileEvent(event.getString("id"), event.getString("title"), event.getString("type"),
                    event.getString("startsAt"), event.getString("status"), event.getInt("version")))
            }
        }
    }

    fun listSongs(groupId: String, accessToken: String): List<MobileSong> {
        val songs = JSONArray(request(ApiEndpoints.songs(groupId), accessToken))
        return buildList { for (index in 0 until songs.length()) {
            val song = songs.getJSONObject(index)
            add(MobileSong(song.getString("id"), song.getString("title")))
        } }
    }

    fun listSetlists(groupId: String, accessToken: String): List<MobileSetlistSummary> {
        val setlists = JSONArray(request(ApiEndpoints.setlists(groupId), accessToken))
        return buildList { for (index in 0 until setlists.length()) {
            val setlist = setlists.getJSONObject(index)
            add(MobileSetlistSummary(setlist.getString("id"), setlist.getString("name"), setlist.getInt("version"), setlist.getInt("itemCount")))
        } }
    }

    fun getSetlist(groupId: String, setlistId: String, accessToken: String): MobileSetlist {
        val setlist = JSONObject(request(ApiEndpoints.setlist(groupId, setlistId), accessToken))
        val source = setlist.optJSONArray("items") ?: JSONArray()
        val items = buildList { for (index in 0 until source.length()) {
            val item = source.getJSONObject(index)
            add(MobileSetlistItem(item.getString("id"), item.getString("arrangementId"), item.optString("songTitle").ifEmpty { null }, item.optString("arrangementLabel").ifEmpty { null }))
        } }
        return MobileSetlist(setlist.getString("id"), setlist.getString("name"), setlist.optInt("version"), items)
    }

    fun replaceSetlistItems(groupId: String, setlist: MobileSetlist, arrangementIds: List<String>, accessToken: String): MobileSetlist {
        val items = JSONArray().apply { arrangementIds.forEachIndexed { index, id -> put(JSONObject().put("arrangementId", id).put("sortOrder", index)) } }
        putJson(ApiEndpoints.setlistItems(groupId, setlist.id), JSONObject().put("expectedVersion", setlist.version).put("items", items), accessToken)
        return getSetlist(groupId, setlist.id, accessToken)
    }

    fun listAllArrangements(groupId: String, accessToken: String): List<MobileArrangementSummary> =
        listSongs(groupId, accessToken).flatMap { song -> listArrangements(groupId, song.id, accessToken).map { it.copy(songTitle = song.title) } }

    fun listMemberResourceAccess(groupId: String, userId: String, accessToken: String): List<MobileResourceAccessEntry> {
        val grants = JSONObject(request(ApiEndpoints.memberResourceGrants(groupId, userId), accessToken)).optJSONArray("items") ?: JSONArray()
        val grantValues = buildMap<String, Boolean> {
            for (index in 0 until grants.length()) grants.getJSONObject(index).let { put("${it.getString("resourceType")}:${it.getString("resourceId")}", it.getBoolean("granted")) }
        }
        return buildList {
            for (song in listSongs(groupId, accessToken)) {
                add(MobileResourceAccessEntry("song", song.id, song.title, grantValues["song:${song.id}"]))
                for (arrangement in listArrangements(groupId, song.id, accessToken)) {
                    add(MobileResourceAccessEntry("arrangement", arrangement.id, "${song.title} · ${arrangement.label}", grantValues["arrangement:${arrangement.id}"]))
                    val resources = JSONArray(request(ApiEndpoints.arrangementResources(groupId, arrangement.id), accessToken))
                    for (index in 0 until resources.length()) resources.getJSONObject(index).let { resource ->
                        val id = resource.getString("id")
                        add(MobileResourceAccessEntry("resource", id, "${arrangement.label} · ${resource.getString("label")}", grantValues["resource:$id"]))
                    }
                }
            }
        }
    }

    fun setMemberResourceAccess(groupId: String, userId: String, entry: MobileResourceAccessEntry, granted: Boolean?, accessToken: String) {
        putJson(ApiEndpoints.memberResourceGrants(groupId, userId), JSONObject().put("resourceType", entry.resourceType).put("resourceId", entry.resourceId).put("granted", granted ?: JSONObject.NULL), accessToken)
    }

    fun listArrangements(groupId: String, songId: String, accessToken: String): List<MobileArrangementSummary> {
        val arrangements = JSONArray(request(ApiEndpoints.arrangements(groupId, songId), accessToken))
        return buildList { for (index in 0 until arrangements.length()) {
            val arrangement = arrangements.getJSONObject(index)
            add(MobileArrangementSummary(arrangement.getString("id"), arrangement.getString("songId"), arrangement.getString("label"), arrangement.optString("defaultKey").takeIf(String::isNotBlank), arrangement.optInt("defaultBpm").takeIf { arrangement.has("defaultBpm") && !arrangement.isNull("defaultBpm") }, arrangement.optInt("version")))
        } }
    }

    fun createArrangement(groupId: String, songId: String, label: String, defaultKey: String?, defaultBpm: Int?, lyrics: String, chords: String, structure: String, notes: String, accessToken: String) {
        postJson(ApiEndpoints.arrangements(groupId, songId), JSONObject().put("label", label).put("defaultKey", defaultKey).put("defaultBpm", defaultBpm).put("lyrics", lyrics).put("chords", chords).put("structure", structure).put("notes", notes), accessToken)
    }

    fun updateArrangement(groupId: String, arrangement: MobileArrangementSummary, label: String, defaultKey: String?, defaultBpm: Int?, accessToken: String) {
        patchJson(ApiEndpoints.arrangement(groupId, arrangement.id), JSONObject().put("label", label).put("defaultKey", defaultKey).put("defaultBpm", defaultBpm).put("expectedVersion", arrangement.version), accessToken)
    }

    fun updateArrangement(groupId: String, arrangement: MobileArrangement, label: String, defaultKey: String?, defaultBpm: Int?, lyrics: String, chords: String, structure: String, notes: String, accessToken: String) {
        patchJson(ApiEndpoints.arrangement(groupId, arrangement.id), JSONObject().put("label", label).put("defaultKey", defaultKey).put("defaultBpm", defaultBpm).put("lyrics", lyrics).put("chords", chords).put("structure", structure).put("notes", notes).put("chordTimingJson", arrangement.chordTimingJson).put("expectedVersion", arrangement.version), accessToken)
    }

    fun deleteArrangement(groupId: String, arrangement: MobileArrangementSummary, accessToken: String) {
        deleteJson(ApiEndpoints.arrangement(groupId, arrangement.id), JSONObject().put("expectedVersion", arrangement.version), accessToken)
    }

    fun getArrangement(groupId: String, arrangementId: String, accessToken: String): MobileArrangement {
        val value = JSONObject(request(ApiEndpoints.arrangement(groupId, arrangementId), accessToken))
        val source = value.optJSONArray("resources") ?: JSONArray()
        val resources = buildList { for (index in 0 until source.length()) {
            val resource = source.getJSONObject(index)
            add(MobileResource(resource.getString("id"), resource.getString("kind"), resource.getString("purpose"),
                resource.getString("label"), resource.optString("contentType").ifEmpty { null }))
        } }
        return MobileArrangement(value.getString("id"), value.getString("songId"), value.getString("label"), value.optString("defaultKey").takeIf(String::isNotBlank), value.optInt("defaultBpm").takeIf { value.has("defaultBpm") && !value.isNull("defaultBpm") }, value.optInt("version"), value.optString("lyrics").ifEmpty { null }, value.optString("chords").ifEmpty { null }, value.optString("structure").ifEmpty { null }, value.optString("notes").ifEmpty { null }, value.optString("chordTimingJson").ifEmpty { null }, resources)
    }

    fun mediaUrl(groupId: String, arrangementId: String, resourceId: String): String =
        baseUrl.trimEnd('/') + ApiEndpoints.arrangementResourceContent(groupId, arrangementId, resourceId)

    fun downloadResourceToFile(groupId: String, arrangementId: String, resourceId: String, destination: File, accessToken: String) {
        val connection = openConnection(ApiEndpoints.arrangementResourceContent(groupId, arrangementId, resourceId), accessToken, "GET")
        try {
            val status = connection.responseCode
            if (status == 426) {
                val problem = JSONObject(connection.errorStream.bufferedReader().use { it.readText() })
                throw MobileApiException(status, problem.optString("code"), problem.optString("minimumVersion"), problem.optString("storeUrl"))
            }
            if (status !in 200..299) throw MobileApiException(status, null, null, null)
            connection.inputStream.use { input -> destination.outputStream().use { output -> input.copyTo(output) } }
        } finally { connection.disconnect() }
    }

    fun versionedHeaders(accessToken: String): Map<String, String> = ApiEndpoints.requestHeaders(accessToken)

    fun submitRsvp(groupId: String, event: MobileEvent, response: String, accessToken: String) {
        val connection = openConnection(ApiEndpoints.rsvp(groupId, event.id), accessToken, "PUT")
        connection.doOutput = true
        connection.setRequestProperty("Content-Type", "application/json")
        try {
            connection.outputStream.use { it.write(JSONObject(mapOf("response" to response)).toString().toByteArray()) }
            val status = connection.responseCode
            if (status !in 200..299) {
                val body = connection.errorStream?.bufferedReader()?.use { it.readText() }.orEmpty()
                if (status == 426) {
                    val problem = JSONObject(body)
                    throw MobileApiException(status, problem.optString("code"), problem.optString("minimumVersion"), problem.optString("storeUrl"))
                }
                throw MobileApiException(status, null, null, null)
            }
        } finally { connection.disconnect() }
    }

    fun get(path: String, accessToken: String): String = request(path, accessToken)

    fun delete(path: String, accessToken: String) {
        val connection = openConnection(path, accessToken, "DELETE")
        try {
            val status = connection.responseCode
            if (status == 426) {
                val problem = JSONObject(connection.errorStream.bufferedReader().use { it.readText() })
                throw MobileApiException(status, problem.optString("code"), problem.optString("minimumVersion"), problem.optString("storeUrl"))
            }
            if (status !in 200..299) throw MobileApiException(status, null, null, null)
        } finally { connection.disconnect() }
    }

    fun putJson(path: String, body: JSONObject, accessToken: String): String = sendJson(path, "PUT", body, accessToken)

    fun postJson(path: String, body: JSONObject, accessToken: String): String = sendJson(path, "POST", body, accessToken)

    fun patchJson(path: String, body: JSONObject, accessToken: String): String = sendJson(path, "PATCH", body, accessToken)
    fun deleteJson(path: String, body: JSONObject, accessToken: String): String = sendJson(path, "DELETE", body, accessToken)

    private fun sendJson(path: String, method: String, body: JSONObject, accessToken: String): String {
        val connection = openConnection(path, accessToken, method)
        connection.doOutput = true
        connection.setRequestProperty("Content-Type", "application/json")
        try {
            connection.outputStream.use { it.write(body.toString().toByteArray()) }
            val status = connection.responseCode
            val responseBody = (if (status in 200..299) connection.inputStream else connection.errorStream)
                ?.bufferedReader()?.use { it.readText() }.orEmpty()
            if (status == 426) {
                val problem = JSONObject(responseBody)
                throw MobileApiException(status, problem.optString("code"), problem.optString("minimumVersion"), problem.optString("storeUrl"))
            }
            if (status !in 200..299) throw MobileApiException(status, null, null, null)
            return responseBody
        } finally { connection.disconnect() }
    }

    fun acceptInvitation(invitationToken: String, accessToken: String) =
        mutate(ApiEndpoints.acceptInvitation(invitationToken), "POST", JSONObject(), accessToken)

    fun updateProfile(displayName: String, accessToken: String) =
        mutate(ApiEndpoints.updateProfile(), "PATCH", JSONObject(mapOf("displayName" to displayName)), accessToken)

    fun markNotificationRead(notificationId: String, accessToken: String) =
        mutate(ApiEndpoints.notificationRead(notificationId), "POST", null, accessToken)

    fun updateTaskStatus(groupId: String, taskId: String, status: String, version: Int, accessToken: String) =
        mutate(ApiEndpoints.taskStatus(groupId, taskId), "POST", JSONObject(mapOf("status" to status, "expectedVersion" to version)), accessToken)

    fun revokeSession(sessionKey: String, accessToken: String) =
        mutate(ApiEndpoints.revokeSession(sessionKey), "POST", null, accessToken)

    private fun mutate(path: String, method: String, body: JSONObject?, accessToken: String) {
        val connection = openConnection(path, accessToken, method)
        try {
            if (body != null) {
                connection.doOutput = true
                connection.setRequestProperty("Content-Type", "application/json")
                connection.outputStream.use { it.write(body.toString().toByteArray()) }
            }
            val status = connection.responseCode
            if (status !in 200..299) {
                val response = connection.errorStream?.bufferedReader()?.use { it.readText() }.orEmpty()
                if (status == 426) {
                    val problem = JSONObject(response)
                    throw MobileApiException(status, problem.optString("code"), problem.optString("minimumVersion"), problem.optString("storeUrl"))
                }
                throw MobileApiException(status, null, null, null)
            }
        } finally {
            connection.disconnect()
        }
    }

    private fun request(path: String, accessToken: String): String {
        require(baseUrl.isNotBlank()) { "API base URL is not configured" }
        val connection = openConnection(path, accessToken, "GET")
        try {
            val status = connection.responseCode
            val body = (if (status in 200..299) connection.inputStream else connection.errorStream)
                ?.bufferedReader()?.use { it.readText() }.orEmpty()
            if (status == 426) {
                val problem = JSONObject(body)
                throw MobileApiException(status, problem.optString("code"), problem.optString("minimumVersion"), problem.optString("storeUrl"))
            }
            if (status !in 200..299) throw MobileApiException(status, null, null, null)
            return body
        } finally {
            connection.disconnect()
        }
    }

    private fun openConnection(path: String, accessToken: String, method: String): HttpURLConnection {
        val connection = URL(baseUrl.trimEnd('/') + path).openConnection() as HttpURLConnection
        connection.requestMethod = method
        connection.instanceFollowRedirects = false
        connection.connectTimeout = 15_000
        connection.readTimeout = 30_000
        ApiEndpoints.requestHeaders(accessToken).forEach(connection::setRequestProperty)
        connection.setRequestProperty("Accept", "application/json")
        return connection
    }
}
