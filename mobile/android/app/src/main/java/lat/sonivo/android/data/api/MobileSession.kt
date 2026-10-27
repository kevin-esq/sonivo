package lat.sonivo.android.data.api

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import kotlinx.coroutines.suspendCancellableCoroutine
import net.openid.appauth.AuthorizationException
import net.openid.appauth.AuthorizationRequest
import net.openid.appauth.AuthorizationResponse
import net.openid.appauth.AuthorizationService
import net.openid.appauth.AuthorizationServiceConfiguration
import net.openid.appauth.AuthState
import net.openid.appauth.AppAuthConfiguration
import net.openid.appauth.connectivity.ConnectionBuilder
import net.openid.appauth.connectivity.DefaultConnectionBuilder
import net.openid.appauth.ResponseTypeValues
import net.openid.appauth.TokenRequest
import net.openid.appauth.TokenResponse
import java.nio.ByteBuffer
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import org.json.JSONObject
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

internal class MobileSession(context: Context, private val issuer: String) {
    private val service = AuthorizationService(
        context,
        AppAuthConfiguration.Builder().setConnectionBuilder(VersionedConnectionBuilder()).build(),
    )
    private val store = EncryptedAuthStateStore(context)
    private var authState: AuthState? = store.read()?.let(AuthState::jsonDeserialize)
    private var pendingState: String? = null

    fun authorizationIntent(onReady: (Intent?, Throwable?) -> Unit) {
        val issuerUri = Uri.parse(issuer.trimEnd('/'))
        AuthorizationServiceConfiguration.fetchFromIssuer(issuerUri) { config, error ->
            if (config == null || error != null) {
                onReady(null, error ?: IllegalStateException("OIDC configuration unavailable"))
                return@fetchFromIssuer
            }
            val request = AuthorizationRequest.Builder(
                config,
                ApiEndpoints.CLIENT_ID,
                ResponseTypeValues.CODE,
                Uri.parse(ApiEndpoints.REDIRECT_URI),
            ).setScope(ApiEndpoints.SCOPES)
                .build()
            pendingState = request.state
            authState = AuthState(config)
            onReady(service.getAuthorizationRequestIntent(request), null)
        }
    }

    suspend fun completeAuthorization(resultCode: Int, data: Intent?): Boolean {
        val result = data ?: return false
        val response = AuthorizationResponse.fromIntent(result)
        val exception = AuthorizationException.fromIntent(result)
        if (response == null) {
            if (exception != null) throw exception
            return false
        }
        if (pendingState == null || response.state != pendingState) {
            pendingState = null
            throw IllegalStateException("Authorization state validation failed")
        }
        pendingState = null
        val state = authState ?: throw IllegalStateException("Authorization request is missing")
        state.update(response, exception)
        val tokens = exchange(response.createTokenExchangeRequest())
        val expectedNonce = response.request.nonce
        if (expectedNonce.isNullOrBlank() || !containsNonce(tokens.idToken, expectedNonce)) {
            throw IllegalStateException("OpenID Connect nonce validation failed")
        }
        state.update(tokens, null)
        authState = state
        store.write(state.jsonSerializeString())
        return state.isAuthorized
    }

    suspend fun accessToken(): String? {
        val state = authState ?: return null
        return suspendCancellableCoroutine { continuation ->
            state.performActionWithFreshTokens(service) { accessToken, _, exception ->
                if (exception != null) continuation.resumeWithException(exception)
                else {
                    store.write(state.jsonSerializeString())
                    continuation.resume(accessToken)
                }
            }
        }
    }

    fun signOut() {
        val refreshToken = authState?.refreshToken
        try {
            if (!refreshToken.isNullOrBlank() && issuer.isNotBlank()) {
                val connection = URL("${issuer.trimEnd('/')}/${ApiEndpoints.REVOCATION_PATH}").openConnection() as HttpURLConnection
                connection.requestMethod = "POST"
                connection.connectTimeout = 5_000
                connection.readTimeout = 5_000
                connection.doOutput = true
                connection.setRequestProperty("Content-Type", "application/x-www-form-urlencoded")
                ApiEndpoints.versionHeaders().forEach(connection::setRequestProperty)
                val body = "client_id=${ApiEndpoints.CLIENT_ID}&token_type_hint=refresh_token&token=" +
                    URLEncoder.encode(refreshToken, Charsets.UTF_8.name())
                connection.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
                connection.responseCode
                connection.disconnect()
            }
        } finally {
            authState = null
            store.clear()
        }
    }

    fun hasAuthorization(): Boolean = authState?.isAuthorized == true

    fun close() = service.dispose()

    private suspend fun exchange(request: TokenRequest): TokenResponse =
        suspendCancellableCoroutine { continuation ->
            service.performTokenRequest(request) { response, exception ->
                if (exception != null) continuation.resumeWithException(exception)
                else if (response != null) continuation.resume(response)
                else continuation.resumeWithException(IllegalStateException("Token exchange failed"))
            }
        }

    private fun containsNonce(idToken: String?, expectedNonce: String): Boolean = runCatching {
        val payload = idToken?.split(".")?.getOrNull(1) ?: return false
        val json = String(Base64.decode(payload, Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING), Charsets.UTF_8)
        JSONObject(json).optString("nonce") == expectedNonce
    }.getOrDefault(false)
}

private class VersionedConnectionBuilder : ConnectionBuilder {
    override fun openConnection(uri: Uri): java.net.HttpURLConnection =
        DefaultConnectionBuilder.INSTANCE.openConnection(uri).apply {
            instanceFollowRedirects = false
            ApiEndpoints.versionHeaders().forEach(::setRequestProperty)
        }
}

private class EncryptedAuthStateStore(context: Context) {
    private val preferences = context.getSharedPreferences("mobile_auth", Context.MODE_PRIVATE)

    fun read(): String? = runCatching {
        val encoded = preferences.getString("state", null) ?: return null
        val bytes = Base64.decode(encoded, Base64.NO_WRAP)
        val buffer = ByteBuffer.wrap(bytes)
        val iv = ByteArray(buffer.int).also(buffer::get)
        val ciphertext = ByteArray(buffer.remaining()).also(buffer::get)
        Cipher.getInstance("AES/GCM/NoPadding").run {
            init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, iv))
            String(doFinal(ciphertext), Charsets.UTF_8)
        }
    }.getOrNull()

    fun write(value: String) {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key())
        val encrypted = cipher.doFinal(value.toByteArray(Charsets.UTF_8))
        val buffer = ByteBuffer.allocate(Int.SIZE_BYTES + cipher.iv.size + encrypted.size)
            .putInt(cipher.iv.size).put(cipher.iv).put(encrypted)
        preferences.edit().putString("state", Base64.encodeToString(buffer.array(), Base64.NO_WRAP)).apply()
    }

    fun clear() = preferences.edit().remove("state").apply()

    private fun key(): SecretKey {
        val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (keyStore.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").run {
            init(KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true)
                .build())
            generateKey()
        }
    }

    private companion object { const val KEY_ALIAS = "sonivo.mobile.auth" }
}
