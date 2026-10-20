package lat.sonivo.android.data.api

/** HTTP integration must use the authenticated API client once native OIDC is implemented. */
interface ApiBoundary {
    val baseUrl: String?
}

sealed interface LoadState<out T> {
    data object Idle : LoadState<Nothing>
    data object Loading : LoadState<Nothing>
    data object Empty : LoadState<Nothing>
    data class Content<T>(val value: T) : LoadState<T>
    data object AccessDenied : LoadState<Nothing>
    data class Failure(val code: String) : LoadState<Nothing>
}
