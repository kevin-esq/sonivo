package lat.sonivo.android

import android.app.Activity
import android.content.Context
import android.content.res.Configuration
import androidx.credentials.CreatePublicKeyCredentialRequest
import androidx.credentials.CreatePublicKeyCredentialResponse
import androidx.credentials.CredentialManager
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.background
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Slider
import androidx.compose.material3.Switch
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.MutableState
import androidx.compose.runtime.State
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringArrayResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import lat.sonivo.android.data.api.MobileApiException
import lat.sonivo.android.data.api.MobileGroup
import lat.sonivo.android.data.api.MobileEvent
import lat.sonivo.android.data.api.ApiEndpoints
import lat.sonivo.android.data.api.PracticeRoomConnection
import lat.sonivo.android.data.api.ConductorPosition
import lat.sonivo.android.data.api.MobileSession
import lat.sonivo.android.data.api.NativeApiClient
import lat.sonivo.android.data.api.MobileArrangement
import lat.sonivo.android.data.api.MobileSong
import lat.sonivo.android.data.api.MobileArrangementSummary
import lat.sonivo.android.data.api.MobileSetlist
import lat.sonivo.android.data.api.MobileSetlistSummary
import lat.sonivo.android.playback.PracticePlayerController
import lat.sonivo.android.practice.PracticeChart
import lat.sonivo.android.practice.PracticeChartLine
import lat.sonivo.android.practice.KaraokePracticeScreen
import org.json.JSONArray
import org.json.JSONObject

class MainActivity : ComponentActivity() {
    private val incomingGroupSlug = mutableStateOf<String?>(null)
    private val incomingGroupLinkVersion = mutableIntStateOf(0)

    override fun attachBaseContext(newBase: Context) {
        val language = newBase.getSharedPreferences("sonivo_preferences", Context.MODE_PRIVATE)
            .getString("language", "es")
            .orEmpty()
        val configuration = Configuration(newBase.resources.configuration)
        configuration.setLocale(java.util.Locale.forLanguageTag(language.ifBlank { "es" }))
        val localized = newBase.createConfigurationContext(configuration)
        super.attachBaseContext(localized)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        incomingGroupSlug.value = ApiEndpoints.groupSlugFromLink(intent?.data)
        if (incomingGroupSlug.value != null) incomingGroupLinkVersion.intValue++
        setContent { SonivoApp(incomingGroupSlug, incomingGroupLinkVersion) }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        incomingGroupSlug.value = ApiEndpoints.groupSlugFromLink(intent.data)
        if (incomingGroupSlug.value != null) incomingGroupLinkVersion.intValue++
    }
}

@Composable
private fun SonivoPageHeader(title: String, groupName: String?) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(9.dp)) {
            Row(
                Modifier.size(32.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(2.dp),
            ) {
                listOf(12.dp, 21.dp, 16.dp, 9.dp).forEach { barHeight ->
                    Box(
                        Modifier.width(3.dp).height(barHeight)
                            .background(MaterialTheme.colorScheme.primary, RoundedCornerShape(4.dp)),
                    )
                }
            }
            Text(
                text = stringResource(R.string.app_name),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = androidx.compose.ui.text.font.FontWeight.SemiBold,
            )
        }
        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(title, style = MaterialTheme.typography.headlineSmall, fontWeight = androidx.compose.ui.text.font.FontWeight.Bold)
            if (!groupName.isNullOrBlank()) {
                Text(groupName, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

@Composable
private fun SonivoTabIcon(index: Int, tint: Color) {
    Canvas(Modifier.size(20.dp)) {
        val scaleFactor = size.width / 24f
        val line = Stroke(width = 2f, cap = StrokeCap.Round, join = StrokeJoin.Round)
        scale(scaleFactor, scaleFactor, pivot = androidx.compose.ui.geometry.Offset.Zero) {
            when (index) {
                0 -> {
                    drawPath(Path().apply {
                        moveTo(18f, 21f)
                        cubicTo(18f, 16.58f, 14.42f, 13f, 10f, 13f)
                        cubicTo(5.58f, 13f, 2f, 16.58f, 2f, 21f)
                    }, tint, style = line)
                    drawCircle(tint, radius = 5f, center = androidx.compose.ui.geometry.Offset(10f, 8f), style = line)
                    drawPath(Path().apply {
                        moveTo(22f, 20f)
                        cubicTo(22f, 16.63f, 20f, 13.5f, 18f, 12f)
                        cubicTo(18.4f, 10.3f, 17.55f, 5.2f, 13.55f, 3.7f)
                    }, tint, style = line)
                }
                1 -> {
                    drawPath(Path().apply {
                        moveTo(8f, 2f); lineTo(8f, 5f); moveTo(16f, 2f); lineTo(16f, 5f)
                        moveTo(3f, 9f); lineTo(21f, 9f)
                    }, tint, style = line)
                    drawRoundRect(
                        tint,
                        topLeft = androidx.compose.ui.geometry.Offset(3f, 3f),
                        size = androidx.compose.ui.geometry.Size(18f, 18f),
                        cornerRadius = androidx.compose.ui.geometry.CornerRadius(2f),
                        style = line,
                    )
                    listOf(8f to 13f, 12f to 13f, 16f to 13f, 8f to 17f, 12f to 17f, 16f to 17f)
                        .forEach { (x, y) -> drawLine(tint, androidx.compose.ui.geometry.Offset(x, y), androidx.compose.ui.geometry.Offset(x + 0.01f, y), strokeWidth = line.width, cap = StrokeCap.Round) }
                }
                2 -> {
                    drawPath(Path().apply {
                        moveTo(12f, 18f); lineTo(12f, 2f); lineTo(19f, 6f)
                    }, tint, style = line)
                    drawCircle(tint, radius = 4f, center = androidx.compose.ui.geometry.Offset(8f, 18f), style = line)
                }
                else -> {
                    listOf(5f, 12f, 19f).forEach { x ->
                        drawCircle(tint, radius = 1.7f, center = androidx.compose.ui.geometry.Offset(x, 12f))
                    }
                }
            }
        }
    }
}

@Composable
private fun SonivoBottomBar(tabs: Array<String>, selected: Int, onSelect: (Int) -> Unit) {
    Surface(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp).padding(bottom = 8.dp),
        shape = RoundedCornerShape(28.dp),
        color = MaterialTheme.colorScheme.surface,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.85f)),
        shadowElevation = 10.dp,
    ) {
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 8.dp),
        ) {
            tabs.forEachIndexed { index, title ->
                val active = index == selected
                val color = if (active) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant
                Column(
                    modifier = Modifier.weight(1f).clickable { onSelect(index) }
                        .semantics { contentDescription = title }
                        .padding(vertical = 1.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(2.dp),
                ) {
                    Box(
                        Modifier.size(width = 44.dp, height = 36.dp).background(
                            if (active) MaterialTheme.colorScheme.primaryContainer else Color.Transparent,
                            CircleShape,
                        ),
                        contentAlignment = Alignment.Center,
                    ) { SonivoTabIcon(index, color) }
                    Text(
                        title,
                        style = MaterialTheme.typography.labelSmall.copy(fontSize = 11.sp, lineHeight = 14.sp),
                        color = color,
                        maxLines = 1,
                        minLines = 1,
                    )
                }
            }
        }
    }
}

@Composable
private fun SonivoApp(incomingGroupSlug: State<String?>, incomingGroupLinkVersion: State<Int>) {
    val context = LocalContext.current
    val activity = context as Activity
    val preferences = remember(context) { context.getSharedPreferences("sonivo_preferences", Context.MODE_PRIVATE) }
    var themePreference by remember { mutableStateOf(preferences.getString("theme", "system") ?: "system") }
    val scope = rememberCoroutineScope()
    val session = remember { MobileSession(context.applicationContext, BuildConfig.OIDC_ISSUER) }
    val api = remember { NativeApiClient() }
    var selected by rememberSaveable { mutableIntStateOf(0) }
    var groups by remember { mutableStateOf<List<MobileGroup>>(emptyList()) }
    var events by remember { mutableStateOf<List<MobileEvent>>(emptyList()) }
    var setlists by remember { mutableStateOf<List<MobileSetlistSummary>>(emptyList()) }
    var openSetlist by remember { mutableStateOf<MobileSetlist?>(null) }
    var availableSetlistArrangements by remember { mutableStateOf<List<MobileArrangementSummary>>(emptyList()) }
    var songs by remember { mutableStateOf<List<MobileSong>>(emptyList()) }
    var arrangements by remember { mutableStateOf<List<MobileArrangementSummary>>(emptyList()) }
    var activeArrangement by remember { mutableStateOf<MobileArrangement?>(null) }
    var selectedSongId by remember { mutableStateOf<String?>(null) }
    var playing by remember { mutableStateOf(false) }
    var playbackPositionMs by remember { mutableIntStateOf(0) }
    var playbackDurationMs by remember { mutableIntStateOf(0) }
    var practiceRoom by remember { mutableStateOf<PracticeRoomConnection?>(null) }
    var joinedEventId by remember { mutableStateOf<String?>(null) }
    var roomConnected by remember { mutableStateOf(false) }
    var conductorPosition by remember { mutableStateOf<ConductorPosition?>(null) }
    var sharingPlayhead by remember { mutableStateOf(false) }
    var karaokeOpen by rememberSaveable { mutableStateOf(false) }
    var showChords by rememberSaveable { mutableStateOf(true) }
    var selectedGroup by remember { mutableStateOf<MobileGroup?>(null) }
    var pendingGroupSlug by rememberSaveable { mutableStateOf(incomingGroupSlug.value ?: preferences.getString("pending_group_slug", null)) }
    var groupLinkRejected by rememberSaveable { mutableStateOf(false) }
    var loading by remember { mutableStateOf(false) }
    var signedIn by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var requiredVersion by remember { mutableStateOf<String?>(null) }
    var storeUrl by remember { mutableStateOf<String?>(null) }
    var morePage by rememberSaveable { mutableStateOf<String?>(null) }
    var morePageData by remember { mutableStateOf<List<NativeDataItem>>(emptyList()) }
    var groupUsageRows by remember { mutableStateOf<List<NativeDataItem>>(emptyList()) }
    var planUsageRows by remember { mutableStateOf<Map<String, List<NativeDataItem>>>(emptyMap()) }
    var planOptions by remember { mutableStateOf<List<String>>(emptyList()) }
    var selectedPlans by remember { mutableStateOf<Map<String, String>>(emptyMap()) }
    var paymentProviderKind by remember { mutableStateOf("manual") }
    var paymentProviderConfigured by remember { mutableStateOf(false) }
    var calendarGroupFilters by remember { mutableStateOf<Set<String>>(emptySet()) }
    var calendarOtherOnly by rememberSaveable { mutableStateOf(false) }
    var calendarOnlyMine by rememberSaveable { mutableStateOf(false) }
    var newGlobalEventTitle by rememberSaveable { mutableStateOf("") }
    var newGlobalEventType by rememberSaveable { mutableStateOf("rehearsal") }
    var newGlobalEventStartsAt by rememberSaveable { mutableStateOf(System.currentTimeMillis()) }
    var newGlobalEventGroupId by rememberSaveable { mutableStateOf("") }
    var morePageLoading by remember { mutableStateOf(false) }
    var inviteToken by rememberSaveable { mutableStateOf("") }
    var profileDisplayName by rememberSaveable { mutableStateOf("") }
    var newTaskTitle by rememberSaveable { mutableStateOf("") }
    var newTaskNotes by rememberSaveable { mutableStateOf("") }
    var newTaskDueAt by rememberSaveable { mutableStateOf(0L) }
    var newTaskAssigneeId by rememberSaveable { mutableStateOf("") }
    var taskAssignees by remember { mutableStateOf<List<NativeDataItem>>(emptyList()) }
    var newTaskAssigneeMenu by remember { mutableStateOf(false) }
    var newSetlistName by rememberSaveable { mutableStateOf("") }
    var newSongTitle by rememberSaveable { mutableStateOf("") }
    var newSongOriginKind by rememberSaveable { mutableStateOf("original") }
    var newSongAttribution by rememberSaveable { mutableStateOf("") }
    var newSongRightsNotes by rememberSaveable { mutableStateOf("") }
    var newSongTags by rememberSaveable { mutableStateOf("") }
    var arrangementSongId by remember { mutableStateOf<String?>(null) }
    var songArrangements by remember { mutableStateOf<List<MobileArrangementSummary>>(emptyList()) }
    var newArrangementLabel by rememberSaveable { mutableStateOf("") }
    var newArrangementKey by rememberSaveable { mutableStateOf("") }
    var newArrangementBpm by rememberSaveable { mutableStateOf("") }
    var newArrangementLyrics by rememberSaveable { mutableStateOf("") }
    var newArrangementChords by rememberSaveable { mutableStateOf("") }
    var newArrangementStructure by rememberSaveable { mutableStateOf("") }
    var newArrangementNotes by rememberSaveable { mutableStateOf("") }
    var calendarCursor by rememberSaveable { mutableStateOf(System.currentTimeMillis()) }
    var calendarPeriod by rememberSaveable { mutableStateOf("month") }
    var brandingDisplayName by rememberSaveable { mutableStateOf("") }
    var brandingGroupName by rememberSaveable { mutableStateOf("") }
    var selectedGroupVersion by remember { mutableStateOf<Int?>(null) }
    var confirmDeleteGroup by remember { mutableStateOf(false) }
    var brandingAccentHex by rememberSaveable { mutableStateOf("#6558C7") }
    var brandingSecondaryHex by rememberSaveable { mutableStateOf("#24304A") }
    var brandingAdditionalFields by remember { mutableStateOf<Map<String, String>>(emptyMap()) }
    var brandingShowSonivoCredit by rememberSaveable { mutableStateOf(true) }
    var brandingStyleMenu by remember { mutableStateOf<String?>(null) }
    var notifyRoleChanges by rememberSaveable { mutableStateOf(true) }
    var notifyTaskAssignments by rememberSaveable { mutableStateOf(true) }
    var newResourceLabel by rememberSaveable { mutableStateOf("") }
    var newResourceUrl by rememberSaveable { mutableStateOf("") }
    var newResourcePart by rememberSaveable { mutableStateOf("") }
    var newResourceNote by rememberSaveable { mutableStateOf("") }
    var brandingAssetKind by remember { mutableStateOf<String?>(null) }
    var newResourcePurpose by rememberSaveable { mutableStateOf("reference") }
    var newResourceArrangementId by rememberSaveable { mutableStateOf("") }
    var resourceArrangementMenu by remember { mutableStateOf(false) }
    var newEventTitle by rememberSaveable { mutableStateOf("") }
    var newEventType by rememberSaveable { mutableStateOf("rehearsal") }
    var newEventStartsAt by rememberSaveable { mutableStateOf(java.util.Calendar.getInstance().apply { set(java.util.Calendar.HOUR_OF_DAY, 19); set(java.util.Calendar.MINUTE, 0); set(java.util.Calendar.SECOND, 0) }.timeInMillis) }
    var eventSetlistChoices by remember { mutableStateOf<List<MobileSetlistSummary>?>(null) }
    var eventRsvpFor by remember { mutableStateOf<String?>(null) }
    var eventRsvpRows by remember { mutableStateOf<List<NativeDataItem>>(emptyList()) }
    var applyingSetlistTo by remember { mutableStateOf<NativeDataItem?>(null) }
    var selectedSetlistForEvent by remember { mutableStateOf<MobileSetlistSummary?>(null) }
    var twoFactorEnabled by remember { mutableStateOf<Boolean?>(null) }
    var twoFactorHasPassword by remember { mutableStateOf(false) }
    var authenticatorManualKey by rememberSaveable { mutableStateOf<String?>(null) }
    var authenticatorCode by rememberSaveable { mutableStateOf("") }
    var disablePassword by rememberSaveable { mutableStateOf("") }
    var currentPassword by rememberSaveable { mutableStateOf("") }
    var newPassword by rememberSaveable { mutableStateOf("") }
    var recoveryCodes by remember { mutableStateOf<List<String>>(emptyList()) }
    var passkeyItems by remember { mutableStateOf<List<NativeDataItem>>(emptyList()) }
    var passkeyDeviceName by rememberSaveable { mutableStateOf("") }
    var invitationEmail by rememberSaveable { mutableStateOf("") }
    var createdInvitationToken by rememberSaveable { mutableStateOf<String?>(null) }
    var invitationItems by remember { mutableStateOf<List<NativeDataItem>>(emptyList()) }
    var groupRoleItems by remember { mutableStateOf<List<NativeDataItem>>(emptyList()) }
    var newGroupRoleName by rememberSaveable { mutableStateOf("") }
    var newGroupRolePermissions by rememberSaveable { mutableStateOf("") }
    var editingGroupRoleId by rememberSaveable { mutableStateOf<String?>(null) }
    var moreReloadKey by rememberSaveable { mutableIntStateOf(0) }
    val tabs = stringArrayResource(R.array.navigation_tabs)
    val player = remember { PracticePlayerController(context.applicationContext) }
    val credentialManager = remember(context) { CredentialManager.create(context) }

    suspend fun refreshSecurity(accessToken: String) {
        val status = JSONObject(withContext(Dispatchers.IO) { api.get(ApiEndpoints.twoFactorStatus(), accessToken) })
        twoFactorEnabled = status.optBoolean("enabled")
        twoFactorHasPassword = status.optBoolean("hasPassword")
        passkeyItems = nativeDisplayRows(withContext(Dispatchers.IO) { api.get(ApiEndpoints.passkeys(), accessToken) }, "passkeys")
    }

    fun selectGroup(group: MobileGroup) {
        pendingGroupSlug = null
        preferences.edit().remove("pending_group_slug").apply()
        groupLinkRejected = false
        selectedGroup = group
        selectedGroupVersion = null
        selected = 1
        loading = true
        events = emptyList()
        setlists = emptyList()
        openSetlist = null
        songs = emptyList()
        selectedSongId = null
        arrangements = emptyList()
        activeArrangement = null
        scope.launch {
            val token = session.accessToken()
            runCatching {
                if (token == null) error("No access token")
                withContext(Dispatchers.IO) { api.listEvents(group.id, token) }
            }.onSuccess { events = it }
                .onFailure {
                    if (it is MobileApiException && it.status == 426) {
                        requiredVersion = it.minimumVersion
                        storeUrl = it.storeUrl
                        error = "update"
                    } else error = "request"
                }
            loading = false
        }
        scope.launch {
            runCatching {
                val token = session.accessToken() ?: error("No access token")
                withContext(Dispatchers.IO) { api.listSongs(group.id, token) }
            }.onSuccess { songs = it }
                .onFailure { if (it is MobileApiException && it.status == 426) { requiredVersion = it.minimumVersion; storeUrl = it.storeUrl; error = "update" } else error = "request" }
        }
        scope.launch {
            runCatching {
                val token = session.accessToken() ?: error("No access token")
                withContext(Dispatchers.IO) { api.listSetlists(group.id, token) }
            }.onSuccess { setlists = it }
                .onFailure { if (it is MobileApiException && it.status == 426) { requiredVersion = it.minimumVersion; storeUrl = it.storeUrl; error = "update" } else error = "request" }
        }
    }

    LaunchedEffect(incomingGroupLinkVersion.value) {
        incomingGroupSlug.value?.let { slug ->
            pendingGroupSlug = slug
            groupLinkRejected = false
            preferences.edit().putString("pending_group_slug", slug).apply()
            selected = 0
            selectedGroup = null
            events = emptyList()
            setlists = emptyList()
            songs = emptyList()
            arrangements = emptyList()
            activeArrangement = null
        }
    }

    LaunchedEffect(signedIn, pendingGroupSlug, groups) {
        val slug = pendingGroupSlug
        if (signedIn && slug != null) {
            val target = groups.firstOrNull { it.slug.equals(slug, ignoreCase = true) }
            pendingGroupSlug = null
            preferences.edit().remove("pending_group_slug").apply()
            if (target != null) selectGroup(target) else {
                selected = 0
                selectedGroup = null
                events = emptyList()
                setlists = emptyList()
                songs = emptyList()
                arrangements = emptyList()
                activeArrangement = null
                groupLinkRejected = true
            }
        }
    }
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        scope.launch {
            runCatching {
                session.completeAuthorization(result.resultCode, result.data)
                val token = session.accessToken() ?: error("No access token")
                withContext(Dispatchers.IO) { api.listGroups(token) }
            }.onSuccess {
                groups = it
                signedIn = true
                error = null
            }.onFailure { failure ->
                signedIn = false
                error = if (failure is MobileApiException && failure.status == 426) {
                    requiredVersion = failure.minimumVersion
                    storeUrl = failure.storeUrl
                    "update"
                } else "request"
            }
        }
    }
    val resourceFileLauncher = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null && selectedGroup != null && (brandingAssetKind != null || newResourceArrangementId.isNotBlank())) scope.launch {
            morePageLoading = true
            runCatching {
                val token = session.accessToken() ?: error("No access token")
                val resolver = context.contentResolver
                val fileName = resolver.query(uri, arrayOf(android.provider.OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
                    if (cursor.moveToFirst()) cursor.getString(0) else null
                } ?: "resource-upload"
                val contentType = resolver.getType(uri) ?: "application/octet-stream"
                withContext(Dispatchers.IO) {
                    val stream = resolver.openInputStream(uri) ?: error("File cannot be opened")
                    val assetKind = brandingAssetKind
                    if (assetKind != null) {
                        api.uploadBrandingAsset(selectedGroup!!.id, assetKind, fileName, contentType, stream, token)
                        nativeDisplayRows(api.get(ApiEndpoints.destination("settings", selectedGroup!!.id)!!, token), "settings")
                    } else {
                        api.uploadFileResource(selectedGroup!!.id, newResourceArrangementId, newResourceLabel.trim().ifBlank { fileName }, newResourcePurpose, fileName, contentType, stream, token, newResourcePart.trim(), newResourceNote.trim())
                        nativeDisplayRows(api.get(ApiEndpoints.destination("resources", selectedGroup!!.id)!!, token), "resources")
                    }
                }
            }.onSuccess { rows -> morePageData = rows; newResourceLabel = ""; brandingAssetKind = null }.onFailure { failure ->
                if (failure is MobileApiException && failure.status == 426) { requiredVersion = failure.minimumVersion; storeUrl = failure.storeUrl; error = "update" } else error = "request"
            }
            morePageLoading = false
        }
        else if (uri == null) brandingAssetKind = null
    }

    DisposableEffect(session) { onDispose { session.close() } }
    DisposableEffect(player) { onDispose { player.release() } }
    DisposableEffect(practiceRoom) {
        onDispose { practiceRoom?.let { room -> Thread { runCatching { room.close() } }.start() } }
    }
    LaunchedEffect(practiceRoom, joinedEventId, activeArrangement?.id) {
        while (true) {
            val connection = practiceRoom
            val eventId = joinedEventId
            val arrangementId = activeArrangement?.id
            if (sharingPlayhead && connection != null && eventId != null && arrangementId != null) {
                runCatching {
                    withContext(Dispatchers.IO) {
                        connection.broadcast(eventId, arrangementId, playbackPositionMs.toLong(), playing)
                    }
                }.onFailure {
                    sharingPlayhead = false
                    error = "request"
                }
            }
            delay(1_000)
        }
    }
    LaunchedEffect(player) {
        while (true) {
            playbackPositionMs = player.currentPositionMs().coerceAtMost(Int.MAX_VALUE.toLong()).toInt()
            playbackDurationMs = player.durationMs().coerceAtMost(Int.MAX_VALUE.toLong()).toInt()
            playing = player.isPlaying()
            delay(250)
        }
    }
    LaunchedEffect(session) {
        if (session.hasAuthorization() && BuildConfig.API_BASE_URL.isNotBlank()) {
            loading = true
            runCatching {
                val token = session.accessToken() ?: error("No access token")
                withContext(Dispatchers.IO) { api.listGroups(token) }
            }.onSuccess {
                groups = it
                signedIn = true
            }.onFailure { failure ->
                if (failure is MobileApiException && failure.status == 426) {
                    requiredVersion = failure.minimumVersion
                    storeUrl = failure.storeUrl
                    error = "update"
                } else error = "request"
            }
            loading = false
        }
    }
    val dark = when (themePreference) {
        "dark" -> true
        "light" -> false
        else -> isSystemInDarkTheme()
    }
    val colors = if (dark) {
        darkColorScheme(
            primary = Color(0xFFB9A7FF), onPrimary = Color(0xFF21144D),
            primaryContainer = Color(0xFF34265F), onPrimaryContainer = Color(0xFFEDE9FE),
            background = Color(0xFF0B1220), surface = Color(0xFF111A2E),
            onSurface = Color(0xFFE2E8F0), outline = Color(0xFF334155),
        )
    } else {
        lightColorScheme(
            primary = Color(0xFF6D4EE0), onPrimary = Color.White,
            primaryContainer = Color(0xFFEDE9FE), onPrimaryContainer = Color(0xFF372078),
            secondary = Color(0xFF9D8BDA), background = Color(0xFFF1F5F9),
            surface = Color.White, onSurface = Color(0xFF0F172A),
            onSurfaceVariant = Color(0xFF64748B), outline = Color(0xFFE2E8F0),
        )
    }
    MaterialTheme(colorScheme = colors) {
        Scaffold(bottomBar = {
            if (!karaokeOpen) Box(Modifier.fillMaxWidth().navigationBarsPadding().padding(bottom = 4.dp)) {
                SonivoBottomBar(tabs, selected) { selected = it }
            }
        }) { padding ->
            Surface(Modifier.fillMaxSize().padding(padding), color = MaterialTheme.colorScheme.background) {
                if (karaokeOpen && selectedGroup != null && activeArrangement != null) {
                    val arrangement = activeArrangement!!
                    val body = arrangement.chords?.takeIf(String::isNotBlank) ?: arrangement.lyrics.orEmpty()
                    val lines = timedPracticeLines(body, arrangement.chordTimingJson)
                    KaraokePracticeScreen(
                        groupName = selectedGroup!!.name,
                        title = arrangement.label,
                        lines = lines,
                        positionMs = conductorPosition?.takeIf { it.arrangementId == arrangement.id }?.positionMs ?: playbackPositionMs.toLong(),
                        durationMs = playbackDurationMs.toLong(),
                        playing = playing,
                        showChords = showChords,
                        onToggleChords = { showChords = !showChords },
                        onTogglePlayback = { if (playing) player.pause() else player.resume() },
                        onSeek = { player.seekTo(it) },
                        onClose = { karaokeOpen = false },
                    )
                } else Column(
                    Modifier.fillMaxSize()
                        .background(
                            Brush.verticalGradient(
                                listOf(
                                    MaterialTheme.colorScheme.primary.copy(alpha = if (dark) 0.10f else 0.06f),
                                    MaterialTheme.colorScheme.background,
                                ),
                            ),
                        )
                        .padding(horizontal = 20.dp, vertical = 16.dp),
                    verticalArrangement = Arrangement.spacedBy(16.dp),
                ) {
                    SonivoPageHeader(title = tabs[selected], groupName = selectedGroup?.name)
                    if (pendingGroupSlug != null && !signedIn) Text(stringResource(R.string.group_link_sign_in))
                    if (groupLinkRejected) Text(stringResource(R.string.group_link_not_member), color = MaterialTheme.colorScheme.error)
                    when {
                        BuildConfig.API_BASE_URL.isBlank() || BuildConfig.OIDC_ISSUER.isBlank() ->
                            Card(
                                Modifier.fillMaxWidth(),
                                shape = RoundedCornerShape(16.dp),
                                border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
                                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                            ) {
                                Row(
                                    Modifier.fillMaxWidth().padding(16.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                                ) {
                                    LucideIcon("info", MaterialTheme.colorScheme.primary)
                                    Text(stringResource(R.string.api_not_configured), style = MaterialTheme.typography.bodyLarge)
                                }
                            }
                        !signedIn -> Button(onClick = {
                            error = null
                            session.authorizationIntent { intent, failure ->
                                if (intent != null) launcher.launch(intent)
                                else error = "request"
                            }
                        }) { Text(stringResource(R.string.sign_in)) }
                        else -> {
                            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                Text(selectedGroup?.name ?: stringResource(R.string.groups_title), style = MaterialTheme.typography.titleMedium)
                                OutlinedButton(onClick = {
                                    scope.launch {
                                        withContext(Dispatchers.IO) { session.signOut() }
                                        groups = emptyList()
                                        events = emptyList()
                                        practiceRoom?.let { room -> scope.launch(Dispatchers.IO) { runCatching { room.close() } } }
                                        practiceRoom = null
                                        joinedEventId = null
                                        roomConnected = false
                                        conductorPosition = null
                                        sharingPlayhead = false
                                        setlists = emptyList()
                                        openSetlist = null
                                        songs = emptyList()
                                        arrangements = emptyList()
                                        activeArrangement = null
                                        selectedGroup = null
                                        selectedGroupVersion = null
                                        signedIn = false
                                    }
                                }) { Text(stringResource(R.string.sign_out)) }
                            }
                            if (selected == 0) when {
                                loading -> Text(stringResource(R.string.loading))
                                groups.isEmpty() -> Text(stringResource(R.string.groups_empty))
                                else -> LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                    items(groups, key = { it.id }) { group ->
                                        Card(onClick = { selectGroup(group) }, shape = RoundedCornerShape(16.dp), border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outline), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
                                            Column(Modifier.fillMaxWidth().padding(16.dp)) {
                                                Text(group.name, style = MaterialTheme.typography.titleMedium)
                                                Text(group.role, style = MaterialTheme.typography.bodyMedium)
                                            }
                                        }
                                    }
                                }
                            }
                            if (selected == 1) {
                                if (selectedGroup == null) Text(stringResource(R.string.events_choose_group))
                                else when {
                                    loading -> Text(stringResource(R.string.loading))
                                    events.isEmpty() && setlists.isEmpty() -> Text(stringResource(R.string.events_empty))
                                    else -> LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                        items(events, key = { it.id }) { event ->
                                            Card(shape = RoundedCornerShape(16.dp), border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outline), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
                                                Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                                    Text(event.title, style = MaterialTheme.typography.titleMedium)
                                                    Text(event.startsAt, style = MaterialTheme.typography.bodyMedium)
                                                    OutlinedButton(onClick = {
                                                        if (joinedEventId == event.id && roomConnected) {
                                                            val connection = practiceRoom
                                                            practiceRoom = null
                                                            joinedEventId = null
                                                            roomConnected = false
                                                            conductorPosition = null
                                                            sharingPlayhead = false
                                                            scope.launch(Dispatchers.IO) { runCatching { connection?.close() } }
                                                        } else {
                                                            scope.launch {
                                                                loading = true
                                                                runCatching {
                                                                    practiceRoom?.let { previous -> withContext(Dispatchers.IO) { previous.close() } }
                                                                    val connection = PracticeRoomConnection(
                                                                        baseUrl = BuildConfig.API_BASE_URL,
                                                                        versionHeaders = ApiEndpoints.versionHeaders(),
                                                                        accessToken = { session.accessToken() },
                                                                        onPosition = { position -> conductorPosition = position },
                                                                        onClosed = { roomConnected = false; sharingPlayhead = false },
                                                                    )
                                                                    withContext(Dispatchers.IO) { connection.connect(event.id) }
                                                                    connection
                                                                }.onSuccess { connection ->
                                                                    practiceRoom = connection
                                                                    joinedEventId = event.id
                                                                    roomConnected = true
                                                                    conductorPosition = null
                                                                    error = null
                                                                }.onFailure { error = "request" }
                                                                loading = false
                                                            }
                                                        }
                                                    }) {
                                                        Text(stringResource(if (joinedEventId == event.id && roomConnected) R.string.events_leave_room else R.string.events_join_room))
                                                    }
                                                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                                        listOf("yes" to R.string.rsvp_yes, "maybe" to R.string.rsvp_maybe, "no" to R.string.rsvp_no).forEach { (choice, label) ->
                                                            OutlinedButton(onClick = {
                                                                scope.launch {
                                                                    runCatching {
                                                                        val token = session.accessToken() ?: error("No access token")
                                                                        withContext(Dispatchers.IO) { api.submitRsvp(selectedGroup!!.id, event, choice, token) }
                                                                    }.onFailure {
                                                                        if (it is MobileApiException && it.status == 426) {
                                                                            requiredVersion = it.minimumVersion
                                                                            storeUrl = it.storeUrl
                                                                            error = "update"
                                                                        } else error = "request"
                                                                    }
                                                                }
                                                            }) { Text(stringResource(label)) }
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                        item { Text(stringResource(R.string.setlists_title), style = MaterialTheme.typography.titleMedium) }
                                        if (setlists.isEmpty()) item { Text(stringResource(R.string.setlists_empty)) }
                                        items(setlists, key = { "setlist-${it.id}" }) { setlist ->
                                            Card(onClick = {
                                                scope.launch {
                                                    runCatching {
                                                        val token = session.accessToken() ?: error("No access token")
                                                        withContext(Dispatchers.IO) { api.getSetlist(selectedGroup!!.id, setlist.id, token) }
                                                    }.onSuccess { openSetlist = it; availableSetlistArrangements = runCatching { val token = session.accessToken() ?: error("No access token"); withContext(Dispatchers.IO) { api.listAllArrangements(selectedGroup!!.id, token) } }.getOrDefault(emptyList()) }
                                                        .onFailure { if (it is MobileApiException && it.status == 426) { requiredVersion = it.minimumVersion; storeUrl = it.storeUrl; error = "update" } else error = "request" }
                                                }
                                            }, shape = RoundedCornerShape(16.dp), border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outline), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
                                                Column(Modifier.fillMaxWidth().padding(14.dp)) {
                                                    Text(setlist.name, style = MaterialTheme.typography.titleMedium)
                                                    Text(stringResource(R.string.setlists_item_count, setlist.itemCount))
                                                }
                                            }
                                        }
                                        openSetlist?.let { setlist ->
                                            item { Text(setlist.name, style = MaterialTheme.typography.titleMedium) }
                                            itemsIndexed(setlist.items, key = { _, item -> "${setlist.id}-${item.id}" }) { index, item ->
                                                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                                    OutlinedButton(onClick = {
                                                        scope.launch {
                                                            runCatching {
                                                                val token = session.accessToken() ?: error("No access token")
                                                                withContext(Dispatchers.IO) { api.getArrangement(selectedGroup!!.id, item.arrangementId, token) }
                                                            }.onSuccess { activeArrangement = it; selected = 2 }
                                                                .onFailure { if (it is MobileApiException && it.status == 426) { requiredVersion = it.minimumVersion; storeUrl = it.storeUrl; error = "update" } else error = "request" }
                                                        }
                                                    }) { Text("${item.songTitle.orEmpty()} · ${item.arrangementLabel.orEmpty()}") }
                                                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                                        if (index > 0) OutlinedButton(onClick = {
                                                            scope.launch {
                                                                runCatching {
                                                                    val token = session.accessToken() ?: error("No access token")
                                                                    val ids = setlist.items.map { it.arrangementId }.toMutableList().apply { add(index - 1, removeAt(index)) }
                                                                    withContext(Dispatchers.IO) { api.replaceSetlistItems(selectedGroup!!.id, setlist, ids, token) }
                                                                }.onSuccess { openSetlist = it }.onFailure { error = "request" }
                                                            }
                                                        }) { Text(stringResource(R.string.setlist_move_up)) }
                                                        if (index < setlist.items.lastIndex) OutlinedButton(onClick = {
                                                            scope.launch {
                                                                runCatching {
                                                                    val token = session.accessToken() ?: error("No access token")
                                                                    val ids = setlist.items.map { it.arrangementId }.toMutableList().apply { add(index + 1, removeAt(index)) }
                                                                    withContext(Dispatchers.IO) { api.replaceSetlistItems(selectedGroup!!.id, setlist, ids, token) }
                                                                }.onSuccess { openSetlist = it }.onFailure { error = "request" }
                                                            }
                                                        }) { Text(stringResource(R.string.setlist_move_down)) }
                                                        OutlinedButton(onClick = {
                                                            scope.launch {
                                                                runCatching {
                                                                    val token = session.accessToken() ?: error("No access token")
                                                                    val ids = setlist.items.map { it.arrangementId }.toMutableList().apply { removeAt(index) }
                                                                    withContext(Dispatchers.IO) { api.replaceSetlistItems(selectedGroup!!.id, setlist, ids, token) }
                                                                }.onSuccess { openSetlist = it }.onFailure { error = "request" }
                                                            }
                                                        }) { Text(stringResource(R.string.setlist_remove_item)) }
                                                    }
                                                }
                                            }
                                            item { Text(stringResource(R.string.setlist_add_arrangement), style = MaterialTheme.typography.titleSmall) }
                                            items(availableSetlistArrangements.filterNot { arrangement -> setlist.items.any { it.arrangementId == arrangement.id } }, key = { "available-${it.id}" }) { arrangement ->
                                                OutlinedButton(onClick = {
                                                    scope.launch {
                                                        runCatching {
                                                            val token = session.accessToken() ?: error("No access token")
                                                            val ids = setlist.items.map { it.arrangementId } + arrangement.id
                                                            withContext(Dispatchers.IO) { api.replaceSetlistItems(selectedGroup!!.id, setlist, ids, token) }
                                                        }.onSuccess { openSetlist = it }.onFailure { error = "request" }
                                                    }
                                                }) { Text("${arrangement.songTitle.orEmpty()} · ${arrangement.label}") }
                                            }
                                        }
                                    }
                                }
                            }
                            if (selected == 2) {
                                val group = selectedGroup
                                when {
                                    group == null -> Text(stringResource(R.string.practice_choose_group))
                                    activeArrangement != null -> {
                                        val sharedPosition = conductorPosition?.takeIf { it.arrangementId == activeArrangement!!.id }
                                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                            OutlinedButton(onClick = { karaokeOpen = true }) { Text(stringResource(R.string.practice_karaoke)) }
                                            OutlinedButton(onClick = { player.pause(); playing = false }) { Text(stringResource(R.string.practice_pause)) }
                                            OutlinedButton(onClick = { player.resume(); playing = true }) { Text(stringResource(R.string.practice_play)) }
                                            OutlinedButton(onClick = { karaokeOpen = false; activeArrangement = null }) { Text(stringResource(R.string.practice_back)) }
                                        }
                                        if (joinedEventId != null && roomConnected) {
                                            OutlinedButton(onClick = { sharingPlayhead = !sharingPlayhead }) {
                                                Text(stringResource(if (sharingPlayhead) R.string.practice_stop_sharing else R.string.practice_share_playhead))
                                            }
                                            sharedPosition?.let { Text(stringResource(R.string.practice_conductor_position, it.conductorDisplayName)) }
                                        }
                                        Text(activeArrangement!!.label, style = MaterialTheme.typography.titleMedium)
                                        if (playbackDurationMs > 0) {
                                            Slider(
                                                value = playbackPositionMs.toFloat().coerceIn(0f, playbackDurationMs.toFloat()),
                                                onValueChange = { player.seekTo(it.toLong()) },
                                                valueRange = 0f..playbackDurationMs.toFloat(),
                                            )
                                        }
                                        PracticeChart(
                                            lines = timedPracticeLines(activeArrangement!!.chords?.takeIf(String::isNotBlank) ?: activeArrangement!!.lyrics.orEmpty(), activeArrangement!!.chordTimingJson),
                                            positionMs = sharedPosition?.positionMs ?: playbackPositionMs.toLong(),
                                        )
                                        activeArrangement!!.resources.filter { it.kind.equals("file", true) && (it.contentType?.startsWith("audio/") == true || it.purpose.contains("audio", true)) }.forEach { resource ->
                                            OutlinedButton(onClick = {
                                                scope.launch {
                                                    runCatching {
                                                        val token = session.accessToken() ?: error("No access token")
                                                        val headers = api.versionedHeaders(token)
                                                        val url = api.mediaUrl(group.id, activeArrangement!!.id, resource.id)
                                                        player.play(url, resource.label, headers)
                                                        playing = true
                                                    }.onFailure { error = "request" }
                                                }
                                            }) { Text(resource.label) }
                                        }
                                        if (activeArrangement!!.resources.none { it.kind.equals("file", true) && (it.contentType?.startsWith("audio/") == true || it.purpose.contains("audio", true)) }) {
                                            Text(stringResource(R.string.practice_no_audio))
                                        }
                                    }
                                    else -> {
                                        Text(stringResource(R.string.practice_choose_arrangement))
                                        LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                            items(songs, key = { it.id }) { song ->
                                                Card(onClick = {
                                                    selectedSongId = song.id
                                                    loading = true
                                                    scope.launch {
                                                        runCatching {
                                                            val token = session.accessToken() ?: error("No access token")
                                                            withContext(Dispatchers.IO) { api.listArrangements(group.id, song.id, token) }
                                                        }.onSuccess { arrangements = it }
                                                            .onFailure { if (it is MobileApiException && it.status == 426) { requiredVersion = it.minimumVersion; storeUrl = it.storeUrl; error = "update" } else error = "request" }
                                                        loading = false
                                                    }
                                                }, shape = RoundedCornerShape(16.dp), border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outline), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
                                                    Column(Modifier.fillMaxWidth().padding(14.dp)) {
                                                        Text(song.title, style = MaterialTheme.typography.titleMedium)
                                                        if (selectedSongId == song.id) arrangements.forEach { arrangement ->
                                                            OutlinedButton(onClick = {
                                                                scope.launch {
                                                                    runCatching {
                                                                        val token = session.accessToken() ?: error("No access token")
                                                                        withContext(Dispatchers.IO) { api.getArrangement(group.id, arrangement.id, token) }
                                                                    }.onSuccess { activeArrangement = it }
                                                                        .onFailure { if (it is MobileApiException && it.status == 426) { requiredVersion = it.minimumVersion; storeUrl = it.storeUrl; error = "update" } else error = "request" }
                                                                }
                                                            }) { Text(arrangement.label) }
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                            if (selected == 3) {
                                val page = morePage
                                if (page == null) {
                                    LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                                        item { Text(stringResource(R.string.more_account), style = MaterialTheme.typography.titleMedium) }
                                        items(nativeDestinations.filter { it.section == "account" }, key = { it.id }) { destination ->
                                            DestinationCard(destination = destination) {
                                                morePage = destination.id
                                                morePageData = emptyList()
                                            }
                                        }
                                        if (selectedGroup != null) {
                                            item { HorizontalDivider(Modifier.padding(vertical = 4.dp)) }
                                            item { Text(stringResource(R.string.more_group, selectedGroup!!.name), style = MaterialTheme.typography.titleMedium) }
                                            items(nativeDestinations.filter { it.section == "group" }, key = { it.id }) { destination ->
                                                DestinationCard(destination = destination) {
                                                    morePage = destination.id
                                                    morePageData = emptyList()
                                                }
                                            }
                                        } else {
                                            item {
                                                Text(stringResource(R.string.more_choose_group), color = MaterialTheme.colorScheme.onSurfaceVariant)
                                            }
                                        }
                                    }
                                } else {
                                    val destination = nativeDestinations.first { it.id == page }
                                    LaunchedEffect(page, selectedGroup?.id, signedIn, moreReloadKey, if (page == "calendar") calendarCursor else 0L, if (page == "calendar") calendarPeriod else "") {
                                        val path = ApiEndpoints.destination(page, selectedGroup?.id)
                                        if (path != null && page != "groupHelp" && signedIn && (destination.section != "group" || selectedGroup != null)) {
                                            morePageLoading = true
                                            runCatching {
                                                val token = session.accessToken() ?: error("No access token")
                                                if (page == "plans") {
                                                    if (groups.isEmpty()) groups = withContext(Dispatchers.IO) { api.listGroups(token) }
                                                    val catalog = JSONObject(withContext(Dispatchers.IO) { api.get(ApiEndpoints.PLAN_CATALOG, token) })
                                                    planOptions = (0 until (catalog.optJSONArray("plans")?.length() ?: 0)).mapNotNull { catalog.getJSONArray("plans").optJSONObject(it)?.optString("id")?.takeIf(String::isNotBlank) }
                                                    val provider = JSONObject(withContext(Dispatchers.IO) { api.get(ApiEndpoints.PAYMENT_PROVIDER, token) })
                                                    paymentProviderKind = provider.optString("provider", "manual")
                                                    paymentProviderConfigured = provider.optBoolean("configured")
                                                    planUsageRows = groups.associate { group ->
                                                        val rawUsage = withContext(Dispatchers.IO) { api.get(ApiEndpoints.groupUsage(group.id), token) }
                                                        group.id to nativePlanUsageRows(context, rawUsage)
                                                    }
                                                    emptyList()
                                                } else if (page == "calendar") {
                                                    val periodCalendar = java.util.Calendar.getInstance().apply {
                                                        timeInMillis = calendarCursor
                                                        set(java.util.Calendar.HOUR_OF_DAY, 0); set(java.util.Calendar.MINUTE, 0); set(java.util.Calendar.SECOND, 0); set(java.util.Calendar.MILLISECOND, 0)
                                                        when (calendarPeriod) {
                                                            "month" -> set(java.util.Calendar.DAY_OF_MONTH, 1)
                                                            "week" -> { set(java.util.Calendar.DAY_OF_WEEK, java.util.Calendar.MONDAY); if (firstDayOfWeek == java.util.Calendar.SUNDAY) add(java.util.Calendar.DAY_OF_MONTH, -1) }
                                                        }
                                                    }
                                                    val rangeStart = java.time.Instant.ofEpochMilli(periodCalendar.timeInMillis).toString()
                                                    val periodEnd = (periodCalendar.clone() as java.util.Calendar).apply { add(when (calendarPeriod) { "month" -> java.util.Calendar.MONTH; "week" -> java.util.Calendar.WEEK_OF_YEAR; else -> java.util.Calendar.DAY_OF_MONTH }, 1) }
                                                    val rangeFinish = java.time.Instant.ofEpochMilli(periodEnd.timeInMillis).toString()
                                                    nativeCalendarRows(context, withContext(Dispatchers.IO) { api.get(ApiEndpoints.calendarActivity(rangeStart, rangeFinish), token) })
                                                } else if (page == "reports") {
                                                    val groupId = selectedGroup!!.id
                                                    val now = java.time.Instant.now()
                                                    val future = now.plus(180, java.time.temporal.ChronoUnit.DAYS)
                                                    val past = now.minus(180, java.time.temporal.ChronoUnit.DAYS)
                                                    val reports = withContext(Dispatchers.IO) {
                                                        listOf(
                                                            "repertoire" to api.get(path, token),
                                                            "responses" to api.get(ApiEndpoints.eventResponseReport(groupId, now.toString(), future.toString()), token),
                                                            "tasks" to api.get(ApiEndpoints.taskReport(groupId, past.toString(), now.toString()), token),
                                                            "setlists" to api.get(ApiEndpoints.setlistUsageReport(groupId), token),
                                                        )
                                                    }
                                                    nativeReportRows(context, reports)
                                                } else {
                                                    val raw = withContext(Dispatchers.IO) { api.get(path, token) }
                                                    nativeDisplayRows(raw, page)
                                                }
                                            }.onSuccess { rows ->
                                                morePageData = rows
                                                if (page == "profile") profileDisplayName = rows.firstOrNull()?.title.orEmpty()
                                                if (page == "settings") {
                                                    brandingGroupName = selectedGroup?.name.orEmpty()
                                                    brandingDisplayName = rows.firstOrNull { it.id == "displayName" }?.detail?.takeIf(String::isNotBlank) ?: selectedGroup?.name.orEmpty()
                                                    rows.firstOrNull { it.id == "accentHex" }?.detail?.let { brandingAccentHex = it }
                                                    rows.firstOrNull { it.id == "secondaryHex" }?.detail?.let { brandingSecondaryHex = it }
                                                    brandingAdditionalFields = (brandingTextFieldKeys + brandingAppearanceFieldKeys).associateWith { key -> rows.firstOrNull { it.id == key }?.detail.orEmpty() }
                                                    brandingShowSonivoCredit = rows.firstOrNull { it.id == "showSonivoCredit" }?.detail?.toBooleanStrictOrNull() ?: true
                                                    runCatching {
                                                        val token = session.accessToken() ?: error("No access token")
                                                        groupUsageRows = nativeDisplayRows(withContext(Dispatchers.IO) { api.get(ApiEndpoints.groupUsage(selectedGroup!!.id), token) }, "membership")
                                                        selectedGroupVersion = withContext(Dispatchers.IO) {
                                                            JSONObject(api.get(ApiEndpoints.group(selectedGroup!!.id), token)).optInt("version", -1).takeIf { it >= 0 }
                                                        }
                                                        val preferences = withContext(Dispatchers.IO) { api.getGroupNotificationPreferences(selectedGroup!!.id, token) }
                                                        notifyRoleChanges = preferences.first
                                                        notifyTaskAssignments = preferences.second
                                                    }.onFailure { error = "request" }
                                                }
                                                if (page == "security") runCatching {
                                                    val token = session.accessToken() ?: error("No access token")
                                                    refreshSecurity(token)
                                                }.onFailure { error = "request" }
                                                if (page == "people") runCatching {
                                                    val token = session.accessToken() ?: error("No access token")
                                                    invitationItems = nativeDisplayRows(withContext(Dispatchers.IO) { api.get(ApiEndpoints.invitations(selectedGroup!!.id), token) }, "invitations")
                                                    groupRoleItems = nativeDisplayRows(withContext(Dispatchers.IO) { api.get(ApiEndpoints.destination("roles", selectedGroup!!.id)!!, token) }, "roles")
                                                }.onFailure { error = "request" }
                                                if (page == "tasks") runCatching {
                                                    val token = session.accessToken() ?: error("No access token")
                                                    taskAssignees = nativeDisplayRows(withContext(Dispatchers.IO) { api.get(ApiEndpoints.destination("people", selectedGroup!!.id)!!, token) }, "people")
                                                }.onFailure { error = "request" }
                                                if (page == "resources") runCatching {
                                                    val token = session.accessToken() ?: error("No access token")
                                                    availableSetlistArrangements = withContext(Dispatchers.IO) { api.listAllArrangements(selectedGroup!!.id, token) }
                                                }.onFailure { error = "request" }
                                            }
                                                .onFailure { morePageData = emptyList(); error = "request" }
                                            morePageLoading = false
                                        }
                                    }
                                    Column(Modifier.fillMaxSize()) {
                                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                            OutlinedButton(onClick = { morePage = null }) { Text(stringResource(R.string.more_back)) }
                                            Text(stringResource(destination.title), style = MaterialTheme.typography.titleLarge)
                                        }
                                        when {
                                            destination.id == "groupHome" -> Column(verticalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.padding(top = 16.dp)) {
                                                Card(Modifier.fillMaxWidth(), shape = RoundedCornerShape(18.dp)) {
                                                    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                                        Text(selectedGroup?.name.orEmpty(), style = MaterialTheme.typography.titleLarge)
                                                        Text(stringResource(R.string.group_home_overview), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                                        Text(stringResource(R.string.group_home_stats, songs.size, setlists.size, events.size), style = MaterialTheme.typography.bodyMedium)
                                                    }
                                                }
                                                Text(stringResource(R.string.group_home_upcoming), style = MaterialTheme.typography.titleMedium)
                                                val upcomingGroupEvents = events.filter { it.status == "scheduled" && runCatching { java.time.Instant.parse(it.startsAt).toEpochMilli() >= System.currentTimeMillis() - 12 * 60 * 60 * 1000 }.getOrDefault(false) }.sortedBy { it.startsAt }.take(4)
                                                if (upcomingGroupEvents.isEmpty()) Text(stringResource(R.string.group_home_no_upcoming), style = MaterialTheme.typography.bodySmall)
                                                upcomingGroupEvents.forEach { event ->
                                                    Card(Modifier.fillMaxWidth().clickable { selected = 1 }, shape = RoundedCornerShape(14.dp)) {
                                                        Column(Modifier.padding(12.dp)) {
                                                            Text(event.title, style = MaterialTheme.typography.titleSmall)
                                                            Text(runCatching { java.time.Instant.parse(event.startsAt).atZone(java.time.ZoneId.systemDefault()).format(java.time.format.DateTimeFormatter.ofLocalizedDateTime(java.time.format.FormatStyle.MEDIUM)) }.getOrDefault(event.startsAt), style = MaterialTheme.typography.bodySmall)
                                                        }
                                                    }
                                                }
                                                Text(stringResource(R.string.group_home_recent_songs), style = MaterialTheme.typography.titleMedium)
                                                if (songs.isEmpty()) Text(stringResource(R.string.group_home_no_songs), style = MaterialTheme.typography.bodySmall)
                                                songs.take(4).forEach { song -> Text(song.title, style = MaterialTheme.typography.bodyMedium) }
                                                Text(stringResource(R.string.group_home_quick_actions), style = MaterialTheme.typography.titleMedium)
                                                listOf("songs" to R.string.group_home_add_song, "setlists" to R.string.group_home_create_setlist, "events" to R.string.group_home_create_event, "tasks" to R.string.group_home_create_task, "resources" to R.string.group_home_add_resource).forEach { (target, label) ->
                                                    OutlinedButton(onClick = { morePage = target; morePageData = emptyList() }, modifier = Modifier.fillMaxWidth()) { Text(stringResource(label)) }
                                                }
                                            }
                                            destination.id == "plans" -> Column(verticalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.padding(top = 16.dp)) {
                                                Text(stringResource(if (paymentProviderKind == "sandbox" && paymentProviderConfigured) R.string.plans_provider_sandbox else R.string.plans_provider_manual), style = MaterialTheme.typography.bodyMedium)
                                                if (paymentProviderKind == "sandbox" && !paymentProviderConfigured) Text(stringResource(R.string.plans_provider_unavailable), style = MaterialTheme.typography.bodySmall)
                                                if (groups.isEmpty()) Text(stringResource(R.string.plans_no_groups))
                                                groups.forEach { group ->
                                                    val usage = planUsageRows[group.id].orEmpty()
                                                    Card(Modifier.fillMaxWidth(), shape = RoundedCornerShape(18.dp)) {
                                                        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(7.dp)) {
                                                            Text(group.name, style = MaterialTheme.typography.titleMedium)
                                                            usage.forEach { row -> Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) { Text(row.title, style = MaterialTheme.typography.bodySmall); Text(row.detail, style = MaterialTheme.typography.bodySmall) } }
                                                            if (group.role.equals("Owner", ignoreCase = true)) {
                                                                var planMenuExpanded by remember(group.id) { mutableStateOf(false) }
                                                                Box {
                                                                    OutlinedButton(onClick = { planMenuExpanded = true }) { Text(stringResource(planNameResource(selectedPlans[group.id] ?: usage.firstOrNull { it.id == "planId" }?.detail ?: "starter"))) }
                                                                    androidx.compose.material3.DropdownMenu(expanded = planMenuExpanded, onDismissRequest = { planMenuExpanded = false }) {
                                                                        planOptions.forEach { plan -> androidx.compose.material3.DropdownMenuItem(text = { Text(stringResource(planNameResource(plan))) }, onClick = { selectedPlans = selectedPlans + (group.id to plan); planMenuExpanded = false }) }
                                                                    }
                                                                }
                                                                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                                                    OutlinedButton(enabled = !morePageLoading && selectedPlans[group.id] != null && selectedPlans[group.id] != usage.firstOrNull { it.id == "planId" }?.detail, onClick = {
                                                                        scope.launch {
                                                                            morePageLoading = true
                                                                            runCatching {
                                                                                val currentToken = session.accessToken() ?: error("No access token")
                                                                                withContext(Dispatchers.IO) { api.putJson(ApiEndpoints.groupPlan(group.id), JSONObject().put("action", "assign").put("planId", selectedPlans[group.id]), currentToken) }
                                                                                planUsageRows = planUsageRows + (group.id to nativePlanUsageRows(context, withContext(Dispatchers.IO) { api.get(ApiEndpoints.groupUsage(group.id), currentToken) }))
                                                                            }.onFailure { error = "request" }
                                                                            morePageLoading = false
                                                                        }
                                                                    }) { Text(stringResource(R.string.plans_assign)) }
                                                                    if (paymentProviderKind == "sandbox" && paymentProviderConfigured) OutlinedButton(enabled = !morePageLoading && BuildConfig.WEB_BASE_URL.isNotBlank(), onClick = {
                                                                        scope.launch {
                                                                            runCatching {
                                                                                val currentToken = session.accessToken() ?: error("No access token")
                                                                                val base = BuildConfig.WEB_BASE_URL.trimEnd('/')
                                                                                if (!base.startsWith("https://")) error("Missing web URL")
                                                                                val body = JSONObject().put("planId", selectedPlans[group.id] ?: usage.firstOrNull { it.id == "planId" }?.detail).put("successUrl", "$base/app/plans?checkout=success").put("cancelUrl", "$base/app/plans?checkout=cancelled")
                                                                                val result = JSONObject(withContext(Dispatchers.IO) { api.postJson(ApiEndpoints.groupCheckout(group.id), body, currentToken) })
                                                                                val checkout = Uri.parse(result.optString("url"))
                                                                                if (checkout.scheme != "https") error("Invalid checkout URL")
                                                                                context.startActivity(Intent(Intent.ACTION_VIEW, checkout))
                                                                            }.onFailure { error = "request" }
                                                                        }
                                                                    }) { Text(stringResource(R.string.plans_checkout)) }
                                                                }
                                                            } else Text(stringResource(R.string.plans_read_only), style = MaterialTheme.typography.bodySmall)
                                                        }
                                                    }
                                                }
                                                if (BuildConfig.WEB_BASE_URL.isBlank() && paymentProviderKind == "sandbox" && paymentProviderConfigured) Text(stringResource(R.string.plans_web_configuration_required), color = MaterialTheme.colorScheme.error)
                                                Text(stringResource(R.string.plans_provisional_note), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                            }
                                            destination.id == "groupCalendar" -> Column(verticalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.padding(top = 16.dp)) {
                                                val periodCalendar = java.util.Calendar.getInstance().apply {
                                                    timeInMillis = calendarCursor
                                                    set(java.util.Calendar.HOUR_OF_DAY, 0); set(java.util.Calendar.MINUTE, 0); set(java.util.Calendar.SECOND, 0); set(java.util.Calendar.MILLISECOND, 0)
                                                    when (calendarPeriod) { "month" -> set(java.util.Calendar.DAY_OF_MONTH, 1); "week" -> { set(java.util.Calendar.DAY_OF_WEEK, java.util.Calendar.MONDAY); if (firstDayOfWeek == java.util.Calendar.SUNDAY) add(java.util.Calendar.DAY_OF_MONTH, -1) } }
                                                }
                                                val periodEnd = (periodCalendar.clone() as java.util.Calendar).apply { add(when (calendarPeriod) { "month" -> java.util.Calendar.MONTH; "week" -> java.util.Calendar.WEEK_OF_YEAR; else -> java.util.Calendar.DAY_OF_MONTH }, 1) }.timeInMillis
                                                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                                    OutlinedButton(onClick = { val c = java.util.Calendar.getInstance().apply { timeInMillis = calendarCursor; add(when (calendarPeriod) { "month" -> java.util.Calendar.MONTH; "week" -> java.util.Calendar.WEEK_OF_YEAR; else -> java.util.Calendar.DAY_OF_MONTH }, -1) }; calendarCursor = c.timeInMillis }) { Text(stringResource(R.string.calendar_prev)) }
                                                    Text(java.text.DateFormat.getDateInstance(java.text.DateFormat.MEDIUM).format(java.util.Date(calendarCursor)), Modifier.weight(1f))
                                                    OutlinedButton(onClick = { val c = java.util.Calendar.getInstance().apply { timeInMillis = calendarCursor; add(when (calendarPeriod) { "month" -> java.util.Calendar.MONTH; "week" -> java.util.Calendar.WEEK_OF_YEAR; else -> java.util.Calendar.DAY_OF_MONTH }, 1) }; calendarCursor = c.timeInMillis }) { Text(stringResource(R.string.calendar_next)) }
                                                    OutlinedButton(onClick = { calendarCursor = System.currentTimeMillis() }) { Text(stringResource(R.string.calendar_today)) }
                                                }
                                                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) { listOf("month" to R.string.calendar_month, "week" to R.string.calendar_week, "day" to R.string.calendar_day).forEach { (period, label) -> if (calendarPeriod == period) Button(onClick = {}) { Text(stringResource(label)) } else OutlinedButton(onClick = { calendarPeriod = period }) { Text(stringResource(label)) } } }
                                                var groupFilterExpanded by remember { mutableStateOf(false) }
                                                Box { OutlinedButton(onClick = { groupFilterExpanded = true }) { Text(stringResource(if (calendarGroupFilters.isEmpty()) R.string.calendar_all_groups else R.string.calendar_filter_group)) }; androidx.compose.material3.DropdownMenu(expanded = groupFilterExpanded, onDismissRequest = { groupFilterExpanded = false }) { androidx.compose.material3.DropdownMenuItem(text = { Text(stringResource(R.string.calendar_all_groups)) }, onClick = { calendarGroupFilters = emptySet() }); groups.forEach { group -> androidx.compose.material3.DropdownMenuItem(text = { Row(verticalAlignment = Alignment.CenterVertically) { Checkbox(group.id in calendarGroupFilters, null); Text(group.name) } }, onClick = { calendarGroupFilters = if (group.id in calendarGroupFilters) calendarGroupFilters - group.id else calendarGroupFilters + group.id }) } } }
                                                Row(verticalAlignment = Alignment.CenterVertically) { Checkbox(calendarOtherOnly, { calendarOtherOnly = it }); Text(stringResource(R.string.calendar_other_only)); Spacer(Modifier.width(12.dp)); Checkbox(calendarOnlyMine, { calendarOnlyMine = it }); Text(stringResource(R.string.calendar_only_mine)) }
                                                Text(stringResource(R.string.calendar_new_event), style = MaterialTheme.typography.titleSmall)
                                                var eventGroupMenu by remember { mutableStateOf(false) }
                                                Box { OutlinedButton(onClick = { eventGroupMenu = true }) { Text(groups.firstOrNull { it.id == newGlobalEventGroupId }?.name ?: stringResource(R.string.calendar_group)) }; androidx.compose.material3.DropdownMenu(expanded = eventGroupMenu, onDismissRequest = { eventGroupMenu = false }) { groups.forEach { group -> androidx.compose.material3.DropdownMenuItem(text = { Text(group.name) }, onClick = { newGlobalEventGroupId = group.id; eventGroupMenu = false }) } } }
                                                OutlinedTextField(newGlobalEventTitle, { newGlobalEventTitle = it.take(200) }, label = { Text(stringResource(R.string.calendar_title_field)) }, modifier = Modifier.fillMaxWidth())
                                                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) { listOf("rehearsal" to R.string.calendar_type_rehearsal, "performance" to R.string.calendar_type_performance, "other" to R.string.calendar_type_other).forEach { (type, label) -> if (newGlobalEventType == type) Button(onClick = {}) { Text(stringResource(label)) } else OutlinedButton(onClick = { newGlobalEventType = type }) { Text(stringResource(label)) } } }
                                                OutlinedButton(onClick = { val now = java.util.Calendar.getInstance().apply { timeInMillis = newGlobalEventStartsAt }; android.app.DatePickerDialog(context, { _, year, month, day -> val chosen = java.util.Calendar.getInstance().apply { timeInMillis = newGlobalEventStartsAt; set(year, month, day) }; android.app.TimePickerDialog(context, { _, hour, minute -> chosen.set(java.util.Calendar.HOUR_OF_DAY, hour); chosen.set(java.util.Calendar.MINUTE, minute); newGlobalEventStartsAt = chosen.timeInMillis }, now.get(java.util.Calendar.HOUR_OF_DAY), now.get(java.util.Calendar.MINUTE), false).show() }, now.get(java.util.Calendar.YEAR), now.get(java.util.Calendar.MONTH), now.get(java.util.Calendar.DAY_OF_MONTH)).show() }) { Text(java.text.DateFormat.getDateTimeInstance().format(java.util.Date(newGlobalEventStartsAt))) }
                                                Button(enabled = newGlobalEventTitle.isNotBlank() && newGlobalEventGroupId.isNotBlank() && !morePageLoading, onClick = {
                                                    scope.launch {
                                                        morePageLoading = true
                                                        runCatching {
                                                            val token = session.accessToken() ?: error("No access token")
                                                            val groupId = newGlobalEventGroupId
                                                            withContext(Dispatchers.IO) { api.postJson(ApiEndpoints.events(groupId), JSONObject().put("title", newGlobalEventTitle.trim()).put("type", newGlobalEventType).put("startsAt", java.time.Instant.ofEpochMilli(newGlobalEventStartsAt).toString()), token) }
                                                            newGlobalEventTitle = ""
                                                            moreReloadKey++
                                                        }.onFailure { error = "request" }
                                                        morePageLoading = false
                                                    }
                                                }) { Text(stringResource(R.string.calendar_create_event)) }
                                                val visibleCalendarRows = morePageData.filter { row ->
                                                    val inRange = row.startsAt?.let { runCatching { val instant = java.time.Instant.parse(it).toEpochMilli(); instant >= periodCalendar.timeInMillis && instant < periodEnd }.getOrDefault(false) } ?: false
                                                    inRange && (calendarGroupFilters.isEmpty() || row.groupId in calendarGroupFilters) && (!calendarOtherOnly || row.type == "other") && (!calendarOnlyMine || row.status != null)
                                                }
                                                if (visibleCalendarRows.isEmpty() && !morePageLoading) Text(stringResource(R.string.events_empty), Modifier.padding(vertical = 12.dp))
                                                LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) { itemsIndexed(visibleCalendarRows, key = { index, row -> "global-calendar-$index-${row.id}" }) { _, row -> Card(Modifier.fillMaxWidth().clickable {
                                                    selectedGroup = groups.firstOrNull { it.id == row.groupId }
                                                    selected = 1
                                                    morePage = null
                                                }, shape = RoundedCornerShape(16.dp)) { Column(Modifier.padding(12.dp)) { Text(row.title, style = MaterialTheme.typography.titleSmall); Text(row.groupName.orEmpty(), style = MaterialTheme.typography.bodySmall); Text(row.detail, style = MaterialTheme.typography.bodySmall) } } } }
                                            }
                                            destination.id == "help" || destination.id == "groupHelp" -> Text(stringResource(R.string.more_help_body), Modifier.padding(top = 16.dp))
                                            destination.id == "preferences" -> Column(verticalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.padding(top = 16.dp)) {
                                                Text(stringResource(R.string.preferences_language))
                                                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                                    listOf("es" to R.string.language_spanish, "en" to R.string.language_english, "pt" to R.string.language_portuguese).forEach { (code, label) ->
                                                        if ((preferences.getString("language", "es") ?: "es") == code) Button(onClick = {}) { Text(stringResource(label)) }
                                                        else OutlinedButton(onClick = {
                                                            preferences.edit().putString("language", code).apply()
                                                            (context as? Activity)?.recreate()
                                                        }) { Text(stringResource(label)) }
                                                    }
                                                }
                                                Text(stringResource(R.string.preferences_appearance))
                                                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                                    listOf("system" to R.string.theme_system, "light" to R.string.theme_light, "dark" to R.string.theme_dark).forEach { (choice, label) ->
                                                        if (themePreference == choice) Button(onClick = {}) { Text(stringResource(label)) }
                                                        else OutlinedButton(onClick = {
                                                            themePreference = choice
                                                            preferences.edit().putString("theme", choice).apply()
                                                        }) { Text(stringResource(label)) }
                                                    }
                                                }
                                            }
                                            destination.id == "join" -> Column(verticalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.padding(top = 16.dp)) {
                                                Text(stringResource(R.string.more_join_body))
                                                OutlinedTextField(value = inviteToken, onValueChange = { inviteToken = it }, label = { Text(stringResource(R.string.more_invite_token)) }, modifier = Modifier.fillMaxWidth())
                                                Button(enabled = inviteToken.isNotBlank() && !morePageLoading, onClick = {
                                                    scope.launch {
                                                        morePageLoading = true
                                                        runCatching {
                                                            val token = session.accessToken() ?: error("No access token")
                                                            withContext(Dispatchers.IO) { api.acceptInvitation(inviteToken.trim(), token) }
                                                            withContext(Dispatchers.IO) { api.listGroups(token) }
                                                        }.onSuccess { groups = it; inviteToken = ""; moreReloadKey++ }
                                                            .onFailure { error = "request" }
                                                        morePageLoading = false
                                                    }
                                                }) { Text(stringResource(R.string.more_join_action)) }
                                            }
                                            destination.id == "profile" -> Column(verticalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.padding(top = 16.dp)) {
                                                OutlinedTextField(value = profileDisplayName, onValueChange = { profileDisplayName = it }, label = { Text(stringResource(R.string.more_profile_name)) }, modifier = Modifier.fillMaxWidth())
                                                Button(enabled = profileDisplayName.isNotBlank() && !morePageLoading, onClick = {
                                                    scope.launch {
                                                        morePageLoading = true
                                                        runCatching {
                                                            val token = session.accessToken() ?: error("No access token")
                                                            withContext(Dispatchers.IO) { api.updateProfile(profileDisplayName.trim(), token) }
                                                        }.onSuccess { moreReloadKey++ }.onFailure { error = "request" }
                                                        morePageLoading = false
                                                    }
                                                }) { Text(stringResource(R.string.more_save)) }
                                            }
                                            destination.id == "people" -> Column(verticalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.padding(top = 16.dp)) {
                                                Text(stringResource(R.string.people_invite), style = MaterialTheme.typography.titleSmall)
                                                OutlinedTextField(value = invitationEmail, onValueChange = { invitationEmail = it }, label = { Text(stringResource(R.string.people_email_optional)) }, modifier = Modifier.fillMaxWidth(), singleLine = true)
                                                Button(enabled = !morePageLoading, onClick = {
                                                    scope.launch {
                                                        morePageLoading = true
                                                        runCatching {
                                                            val token = session.accessToken() ?: error("No access token")
                                                            val result = JSONObject(withContext(Dispatchers.IO) { api.postJson(ApiEndpoints.invitations(selectedGroup!!.id), JSONObject().put("email", invitationEmail.trim().ifBlank { JSONObject.NULL }), token) })
                                                            createdInvitationToken = result.optString("token").takeIf(String::isNotBlank)
                                                            invitationEmail = ""
                                                            morePageData = nativeDisplayRows(withContext(Dispatchers.IO) { api.get(ApiEndpoints.destination("people", selectedGroup!!.id)!!, token) }, "people")
                                                            invitationItems = nativeDisplayRows(withContext(Dispatchers.IO) { api.get(ApiEndpoints.invitations(selectedGroup!!.id), token) }, "invitations")
                                                        }.onFailure { error = "request" }
                                                        morePageLoading = false
                                                    }
                                                }) { Text(stringResource(R.string.people_create_invitation)) }
                                                createdInvitationToken?.let { token ->
                                                    Text(stringResource(R.string.people_invitation_created), style = MaterialTheme.typography.bodySmall)
                                                    Text(token, fontFamily = androidx.compose.ui.text.font.FontFamily.Monospace, color = MaterialTheme.colorScheme.primary, modifier = Modifier.clickable { context.getSystemService(android.content.ClipboardManager::class.java).setPrimaryClip(android.content.ClipData.newPlainText("Sonivo invitation", token)) })
                                                }
                                                Text(stringResource(R.string.people_members), style = MaterialTheme.typography.titleSmall)
                                                LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                                    itemsIndexed(morePageData, key = { index, row -> "member-$index-${row.id}" }) { _, row ->
                                                        var roleMenuExpanded by remember(row.id) { mutableStateOf(false) }
                                                        var confirmRemoveMember by remember(row.id) { mutableStateOf(false) }
                                                        var showResourceAccess by remember(row.id) { mutableStateOf(false) }
                                                        var resourceAccessRows by remember(row.id) { mutableStateOf(emptyList<lat.sonivo.android.data.api.MobileResourceAccessEntry>()) }
                                                        Card(Modifier.fillMaxWidth(), shape = RoundedCornerShape(16.dp)) {
                                                            Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                                                Text(row.title, style = MaterialTheme.typography.titleSmall)
                                                                if (row.detail.isNotBlank()) Text(row.detail, style = MaterialTheme.typography.bodySmall)
                                                                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                                                    Box {
                                                                        OutlinedButton(onClick = { roleMenuExpanded = true }) { Text(stringResource(R.string.people_role, stringResource(nativeRoleResource(row.status.orEmpty())))) }
                                                                        androidx.compose.material3.DropdownMenu(expanded = roleMenuExpanded, onDismissRequest = { roleMenuExpanded = false }) {
                                                                            listOf("Owner" to R.string.people_role_owner, "Manager" to R.string.people_role_manager, "Member" to R.string.people_role_member, "Viewer" to R.string.people_role_viewer).forEach { (role, roleLabel) ->
                                                                                androidx.compose.material3.DropdownMenuItem(text = { Text(stringResource(roleLabel)) }, onClick = {
                                                                                    roleMenuExpanded = false
                                                                                    scope.launch {
                                                                                        runCatching {
                                                                                            val token = session.accessToken() ?: error("No access token")
                                                                                            withContext(Dispatchers.IO) { api.postJson(ApiEndpoints.memberRole(selectedGroup!!.id, row.id), JSONObject().put("role", role), token) }
                                                                                            morePageData = nativeDisplayRows(withContext(Dispatchers.IO) { api.get(ApiEndpoints.destination("people", selectedGroup!!.id)!!, token) }, "people")
                                                                                        }.onFailure { error = "request" }
                                                                                    }
                                                                                })
                                                                            }
                                                                            groupRoleItems.filter { it.isSystem != true }.forEach { customRole ->
                                                                                androidx.compose.material3.DropdownMenuItem(text = { Text(customRole.title) }, onClick = {
                                                                                    roleMenuExpanded = false
                                                                                    scope.launch {
                                                                                        runCatching {
                                                                                            val token = session.accessToken() ?: error("No access token")
                                                                                            withContext(Dispatchers.IO) { api.putJson(ApiEndpoints.memberGroupRole(selectedGroup!!.id, row.id), JSONObject().put("groupRoleId", customRole.id), token) }
                                                                                            morePageData = nativeDisplayRows(withContext(Dispatchers.IO) { api.get(ApiEndpoints.destination("people", selectedGroup!!.id)!!, token) }, "people")
                                                                                        }.onFailure { error = "request" }
                                                                                    }
                                                                                })
                                                                            }
                                                                        }
                                                                    }
                                                                    if (row.enabled != null) OutlinedButton(onClick = {
                                                                        scope.launch {
                                                                            runCatching {
                                                                                val token = session.accessToken() ?: error("No access token")
                                                                                withContext(Dispatchers.IO) { api.putJson(ApiEndpoints.memberAccess(selectedGroup!!.id, row.id), JSONObject().put("enabled", !row.enabled), token) }
                                                                                morePageData = nativeDisplayRows(withContext(Dispatchers.IO) { api.get(ApiEndpoints.destination("people", selectedGroup!!.id)!!, token) }, "people")
                                                                            }.onFailure { error = "request" }
                                                                        }
                                                                    }) { Text(stringResource(if (row.enabled) R.string.people_disable_access else R.string.people_enable_access)) }
                                                                }
                                                                OutlinedButton(onClick = { confirmRemoveMember = true }) { Text(stringResource(R.string.people_remove_member)) }
                                                                if (selectedGroup?.role == "Owner") OutlinedButton(onClick = {
                                                                    scope.launch {
                                                                        runCatching {
                                                                            val token = session.accessToken() ?: error("No access token")
                                                                            resourceAccessRows = withContext(Dispatchers.IO) { api.listMemberResourceAccess(selectedGroup!!.id, row.id, token) }
                                                                            showResourceAccess = true
                                                                        }.onFailure { error = "request" }
                                                                    }
                                                                }) { Text(stringResource(R.string.resource_access_manage)) }
                                                                if (showResourceAccess) AlertDialog(
                                                                    onDismissRequest = { showResourceAccess = false },
                                                                    title = { Text(stringResource(R.string.resource_access_title)) },
                                                                    text = {
                                                                        LazyColumn(Modifier.height(420.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                                                            itemsIndexed(resourceAccessRows, key = { _, entry -> "${entry.resourceType}:${entry.resourceId}" }) { _, entry ->
                                                                                Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
                                                                                    Text(entry.label, style = MaterialTheme.typography.bodySmall)
                                                                                    Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                                                                                        listOf(null, true, false).forEach { value ->
                                                                                            OutlinedButton(onClick = {
                                                                                                scope.launch {
                                                                                                    runCatching {
                                                                                                        val token = session.accessToken() ?: error("No access token")
                                                                                                        withContext(Dispatchers.IO) { api.setMemberResourceAccess(selectedGroup!!.id, row.id, entry, value, token) }
                                                                                                        resourceAccessRows = resourceAccessRows.map { if (it == entry) entry.copy(granted = value) else it }
                                                                                                    }.onFailure { error = "request" }
                                                                                                }
                                                                                            }, enabled = entry.granted != value) {
                                                                                                Text(stringResource(when (value) { null -> R.string.resource_access_inherit; true -> R.string.resource_access_allow; false -> R.string.resource_access_deny }))
                                                                                            }
                                                                                        }
                                                                                    }
                                                                                }
                                                                            }
                                                                        }
                                                                    },
                                                                    confirmButton = { OutlinedButton(onClick = { showResourceAccess = false }) { Text(stringResource(R.string.resource_access_close)) } },
                                                                )
                                                                if (confirmRemoveMember) AlertDialog(
                                                                    onDismissRequest = { confirmRemoveMember = false },
                                                                    title = { Text(stringResource(R.string.people_confirm_remove_title)) },
                                                                    confirmButton = {
                                                                        Button(onClick = {
                                                                            confirmRemoveMember = false
                                                                            scope.launch {
                                                                                runCatching {
                                                                                    val token = session.accessToken() ?: error("No access token")
                                                                                    withContext(Dispatchers.IO) { api.delete(ApiEndpoints.member(selectedGroup!!.id, row.id), token) }
                                                                                    morePageData = nativeDisplayRows(withContext(Dispatchers.IO) { api.get(ApiEndpoints.destination("people", selectedGroup!!.id)!!, token) }, "people")
                                                                                }.onFailure { error = "request" }
                                                                            }
                                                                        }) { Text(stringResource(R.string.people_remove_member)) }
                                                                    },
                                                                    dismissButton = { OutlinedButton(onClick = { confirmRemoveMember = false }) { Text(stringResource(R.string.people_cancel)) } },
                                                                )
                                                            }
                                                        }
                                                    }
                                                }
                                                Text(stringResource(R.string.people_invitations), style = MaterialTheme.typography.titleSmall)
                                                invitationItems.forEach { invitation ->
                                                    Card(Modifier.fillMaxWidth(), shape = RoundedCornerShape(16.dp)) {
                                                        Row(Modifier.fillMaxWidth().padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                                                            Text(invitation.detail.ifBlank { invitation.title }, Modifier.weight(1f), style = MaterialTheme.typography.bodySmall)
                                                            OutlinedButton(onClick = {
                                                                scope.launch {
                                                                    runCatching {
                                                                        val token = session.accessToken() ?: error("No access token")
                                                                        withContext(Dispatchers.IO) { api.delete(ApiEndpoints.invitation(selectedGroup!!.id, invitation.id), token) }
                                                                        invitationItems = nativeDisplayRows(withContext(Dispatchers.IO) { api.get(ApiEndpoints.invitations(selectedGroup!!.id), token) }, "invitations")
                                                                    }.onFailure { error = "request" }
                                                                }
                                                            }) { Text(stringResource(R.string.people_revoke_invitation)) }
                                                        }
                                                    }
                                                }
                                            }
                                            destination.id == "roles" -> Column(verticalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.padding(top = 16.dp)) {
                                                if (selectedGroup?.role == "Owner") {
                                                OutlinedTextField(newGroupRoleName, { newGroupRoleName = it }, label = { Text(stringResource(R.string.group_role_name)) }, modifier = Modifier.fillMaxWidth())
                                                OutlinedTextField(newGroupRolePermissions, { newGroupRolePermissions = it }, label = { Text(stringResource(R.string.group_role_permissions)) }, supportingText = { Text(stringResource(R.string.group_role_permissions_hint)) }, modifier = Modifier.fillMaxWidth(), minLines = 2)
                                                Button(enabled = newGroupRoleName.trim().length >= 2 && !morePageLoading, onClick = {
                                                    scope.launch {
                                                        morePageLoading = true
                                                        runCatching {
                                                            val token = session.accessToken() ?: error("No access token")
                                                            val permissions = newGroupRolePermissions.split(',', '\n').map(String::trim).filter(String::isNotEmpty).distinct()
                                                            val body = JSONObject().put("name", newGroupRoleName.trim()).put("permissions", JSONArray(permissions))
                                                            withContext(Dispatchers.IO) {
                                                                val roleId = editingGroupRoleId
                                                                if (roleId == null) api.postJson(ApiEndpoints.destination("roles", selectedGroup!!.id)!!, body.put("description", JSONObject.NULL).put("extendsBaseRole", false), token)
                                                                else api.patchJson(ApiEndpoints.groupRole(selectedGroup!!.id, roleId), body, token)
                                                            }
                                                            nativeDisplayRows(withContext(Dispatchers.IO) { api.get(ApiEndpoints.destination("roles", selectedGroup!!.id)!!, token) }, "roles")
                                                        }.onSuccess { morePageData = it; newGroupRoleName = ""; newGroupRolePermissions = ""; editingGroupRoleId = null }.onFailure { error = "request" }
                                                        morePageLoading = false
                                                    }
                                                }) { Text(stringResource(if (editingGroupRoleId == null) R.string.group_role_create else R.string.group_role_save)) }
                                                }
                                                LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                                    itemsIndexed(morePageData, key = { index, row -> "role-$index-${row.id}" }) { _, row ->
                                                        Card(Modifier.fillMaxWidth(), shape = RoundedCornerShape(16.dp)) {
                                                            Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                                                Text(row.title, style = MaterialTheme.typography.titleSmall)
                                                                if (row.detail.isNotBlank()) Text(row.detail, style = MaterialTheme.typography.bodySmall)
                                                                if (row.isSystem == true) Text(stringResource(R.string.group_role_system), style = MaterialTheme.typography.labelSmall)
                                                                else if (selectedGroup?.role == "Owner") Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                                                    OutlinedButton(onClick = { editingGroupRoleId = row.id; newGroupRoleName = row.title; newGroupRolePermissions = row.detail.substringAfter(" · ", "") }) { Text(stringResource(R.string.group_role_edit)) }
                                                                    OutlinedButton(onClick = {
                                                                        scope.launch {
                                                                            runCatching {
                                                                                val token = session.accessToken() ?: error("No access token")
                                                                                withContext(Dispatchers.IO) { api.delete(ApiEndpoints.groupRole(selectedGroup!!.id, row.id), token) }
                                                                                nativeDisplayRows(withContext(Dispatchers.IO) { api.get(ApiEndpoints.destination("roles", selectedGroup!!.id)!!, token) }, "roles")
                                                                            }.onSuccess { morePageData = it }.onFailure { error = "request" }
                                                                        }
                                                                    }) { Text(stringResource(R.string.group_role_delete)) }
                                                                }
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                            destination.id == "security" -> Column(verticalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.padding(top = 16.dp)) {
                                                if (twoFactorHasPassword) Card(shape = RoundedCornerShape(16.dp), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
                                                    Column(Modifier.fillMaxWidth().padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                                        Text(stringResource(R.string.security_change_password), style = MaterialTheme.typography.titleSmall)
                                                        OutlinedTextField(currentPassword, { currentPassword = it }, label = { Text(stringResource(R.string.security_current_password)) }, modifier = Modifier.fillMaxWidth(), singleLine = true, visualTransformation = androidx.compose.ui.text.input.PasswordVisualTransformation())
                                                        OutlinedTextField(newPassword, { newPassword = it }, label = { Text(stringResource(R.string.security_new_password)) }, modifier = Modifier.fillMaxWidth(), singleLine = true, visualTransformation = androidx.compose.ui.text.input.PasswordVisualTransformation())
                                                        Button(enabled = currentPassword.isNotEmpty() && newPassword.isNotEmpty() && !morePageLoading, onClick = {
                                                            scope.launch {
                                                                morePageLoading = true
                                                                runCatching {
                                                                    val token = session.accessToken() ?: error("No access token")
                                                                    withContext(Dispatchers.IO) { api.postJson(ApiEndpoints.changePassword(), JSONObject(mapOf("currentPassword" to currentPassword, "newPassword" to newPassword)), token) }
                                                                    currentPassword = ""; newPassword = ""
                                                                }.onFailure { error = "request" }
                                                                morePageLoading = false
                                                            }
                                                        }) { Text(stringResource(R.string.security_save_password)) }
                                                    }
                                                }
                                                Card(shape = RoundedCornerShape(16.dp), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
                                                    Column(Modifier.fillMaxWidth().padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                                        Text(stringResource(R.string.security_two_factor), style = MaterialTheme.typography.titleSmall)
                                                        when {
                                                            twoFactorEnabled == true -> {
                                                                Text(stringResource(R.string.security_two_factor_enabled))
                                                                if (twoFactorHasPassword) OutlinedTextField(value = disablePassword, onValueChange = { disablePassword = it }, label = { Text(stringResource(R.string.security_password)) }, modifier = Modifier.fillMaxWidth(), singleLine = true)
                                                                OutlinedButton(enabled = !morePageLoading && (!twoFactorHasPassword || disablePassword.isNotEmpty()), onClick = {
                                                                    scope.launch {
                                                                        morePageLoading = true
                                                                        runCatching {
                                                                            val token = session.accessToken() ?: error("No access token")
                                                                            withContext(Dispatchers.IO) { api.postJson(ApiEndpoints.twoFactorDisable(), JSONObject(mapOf("password" to disablePassword)), token) }
                                                                            refreshSecurity(token); morePageData = nativeDisplayRows(withContext(Dispatchers.IO) { api.get(ApiEndpoints.destination("security", selectedGroup?.id)!!, token) }, "security")
                                                                        }.onFailure { error = "request" }
                                                                        disablePassword = ""; morePageLoading = false
                                                                    }
                                                                }) { Text(stringResource(R.string.security_disable_two_factor)) }
                                                            }
                                                            authenticatorManualKey != null -> {
                                                                Text(stringResource(R.string.security_manual_key_hint), style = MaterialTheme.typography.bodySmall)
                                                                Text(authenticatorManualKey.orEmpty(), style = MaterialTheme.typography.bodyMedium, fontFamily = androidx.compose.ui.text.font.FontFamily.Monospace, color = MaterialTheme.colorScheme.primary)
                                                                OutlinedTextField(value = authenticatorCode, onValueChange = { authenticatorCode = it.filter(Char::isDigit).take(8) }, label = { Text(stringResource(R.string.security_authenticator_code)) }, modifier = Modifier.fillMaxWidth(), singleLine = true)
                                                                Button(enabled = authenticatorCode.length >= 6 && !morePageLoading, onClick = {
                                                                    scope.launch {
                                                                        morePageLoading = true
                                                                        runCatching {
                                                                            val token = session.accessToken() ?: error("No access token")
                                                                            val response = JSONObject(withContext(Dispatchers.IO) { api.postJson(ApiEndpoints.twoFactorEnrollVerify(), JSONObject(mapOf("code" to authenticatorCode)), token) })
                                                                            val codes = response.optJSONArray("recoveryCodes") ?: JSONArray()
                                                                            recoveryCodes = (0 until codes.length()).map { codes.getString(it) }
                                                                            authenticatorManualKey = null; authenticatorCode = ""
                                                                            refreshSecurity(token)
                                                                        }.onFailure { error = "request" }
                                                                        morePageLoading = false
                                                                    }
                                                                }) { Text(stringResource(R.string.security_confirm_two_factor)) }
                                                            }
                                                            else -> {
                                                                Text(stringResource(R.string.security_two_factor_disabled))
                                                                Button(enabled = !morePageLoading, onClick = {
                                                                    scope.launch {
                                                                        morePageLoading = true
                                                                        runCatching {
                                                                            val token = session.accessToken() ?: error("No access token")
                                                                            val response = JSONObject(withContext(Dispatchers.IO) { api.postJson(ApiEndpoints.twoFactorEnrollStart(), JSONObject(), token) })
                                                                            authenticatorManualKey = response.optString("manualKey").takeIf(String::isNotBlank)
                                                                        }.onFailure { error = "request" }
                                                                        morePageLoading = false
                                                                    }
                                                                }) { Text(stringResource(R.string.security_enable_two_factor)) }
                                                            }
                                                        }
                                                    }
                                                }
                                                if (recoveryCodes.isNotEmpty()) {
                                                    Card(shape = RoundedCornerShape(16.dp), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
                                                        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                                            Text(stringResource(R.string.security_recovery_codes), style = MaterialTheme.typography.titleSmall)
                                                            Text(stringResource(R.string.security_recovery_codes_hint), style = MaterialTheme.typography.bodySmall)
                                                            recoveryCodes.forEach { Text(it, fontFamily = androidx.compose.ui.text.font.FontFamily.Monospace) }
                                                        }
                                                    }
                                                }
                                                Text(stringResource(R.string.security_passkeys), style = MaterialTheme.typography.titleSmall)
                                                OutlinedTextField(value = passkeyDeviceName, onValueChange = { passkeyDeviceName = it }, label = { Text(stringResource(R.string.security_device_name)) }, modifier = Modifier.fillMaxWidth(), singleLine = true)
                                                OutlinedButton(enabled = !morePageLoading, onClick = {
                                                    scope.launch {
                                                        morePageLoading = true
                                                        runCatching {
                                                            val token = session.accessToken() ?: error("No access token")
                                                            val options = JSONObject(withContext(Dispatchers.IO) { api.postJson(ApiEndpoints.passkeyRegistrationStart(), JSONObject(), token) })
                                                            val user = options.getJSONObject("user")
                                                            val requestJson = JSONObject()
                                                                .put("challenge", options.getString("challenge"))
                                                                .put("rp", JSONObject().put("id", options.getString("rpId")).put("name", options.getString("rpName")))
                                                                .put("user", JSONObject().put("id", user.getString("id")).put("name", user.getString("name")).put("displayName", user.getString("displayName")))
                                                                .put("pubKeyCredParams", JSONArray().put(JSONObject().put("type", "public-key").put("alg", -7)).put(JSONObject().put("type", "public-key").put("alg", -257)))
                                                                .put("timeout", 60000)
                                                                .put("attestation", "none")
                                                                .put("authenticatorSelection", JSONObject().put("userVerification", "preferred").put("residentKey", "preferred"))
                                                            val request = CreatePublicKeyCredentialRequest(requestJson = requestJson.toString(), preferImmediatelyAvailableCredentials = false)
                                                            val credential = credentialManager.createCredential(activity, request) as? CreatePublicKeyCredentialResponse ?: error("No passkey response")
                                                            val response = JSONObject(credential.registrationResponseJson).getJSONObject("response")
                                                            val body = JSONObject().put("attestationObject", response.getString("attestationObject")).put("clientData", response.getString("clientDataJSON")).put("deviceName", passkeyDeviceName.trim().ifBlank { "Android" })
                                                            withContext(Dispatchers.IO) { api.postJson(ApiEndpoints.passkeyRegistrationFinish(), body, token) }
                                                            refreshSecurity(token)
                                                        }.onFailure { error = "request" }
                                                        morePageLoading = false
                                                    }
                                                }) { Text(stringResource(R.string.security_add_passkey)) }
                                                if (passkeyItems.isEmpty()) Text(stringResource(R.string.security_no_passkeys), color = MaterialTheme.colorScheme.onSurfaceVariant)
                                                passkeyItems.forEach { item ->
                                                    Card(Modifier.fillMaxWidth(), shape = RoundedCornerShape(16.dp)) {
                                                        Row(Modifier.fillMaxWidth().padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                                                            Column(Modifier.weight(1f)) { Text(item.title, style = MaterialTheme.typography.titleSmall); if (item.detail.isNotBlank()) Text(item.detail, style = MaterialTheme.typography.bodySmall) }
                                                            OutlinedButton(onClick = {
                                                                scope.launch {
                                                                    runCatching { val token = session.accessToken() ?: error("No access token"); withContext(Dispatchers.IO) { api.delete(ApiEndpoints.passkey(item.id), token) }; refreshSecurity(token) }
                                                                        .onFailure { error = "request" }
                                                                }
                                                            }) { Text(stringResource(R.string.security_remove_passkey)) }
                                                        }
                                                    }
                                                }
                                                Text(stringResource(R.string.security_sessions), style = MaterialTheme.typography.titleSmall)
                                                LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                                    itemsIndexed(morePageData, key = { index, row -> "session-$index-${row.id}" }) { _, row ->
                                                        Card(Modifier.fillMaxWidth(), shape = RoundedCornerShape(16.dp)) {
                                                            Column(Modifier.fillMaxWidth().padding(12.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                                                                Text(row.title, style = MaterialTheme.typography.titleSmall)
                                                                if (row.detail.isNotBlank()) Text(row.detail, style = MaterialTheme.typography.bodySmall)
                                                                if (row.status != "current") OutlinedButton(onClick = {
                                                                    scope.launch {
                                                                        runCatching { val token = session.accessToken() ?: error("No access token"); withContext(Dispatchers.IO) { api.revokeSession(row.id, token) }; morePageData = nativeDisplayRows(withContext(Dispatchers.IO) { api.get(ApiEndpoints.destination("security", selectedGroup?.id)!!, token) }, "security") }
                                                                            .onFailure { error = "request" }
                                                                    }
                                                                }) { Text(stringResource(R.string.more_revoke_session)) }
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                            destination.id == "settings" -> Column(verticalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.padding(top = 16.dp)) {
                                                if (selectedGroup?.role == "Owner") {
                                                    Text(stringResource(R.string.branding_group_general), style = MaterialTheme.typography.titleSmall)
                                                    OutlinedTextField(brandingGroupName, { brandingGroupName = it }, label = { Text(stringResource(R.string.branding_group_name)) }, modifier = Modifier.fillMaxWidth(), singleLine = true)
                                                    Button(enabled = brandingGroupName.isNotBlank() && selectedGroupVersion != null && !morePageLoading, onClick = {
                                                        scope.launch {
                                                            morePageLoading = true
                                                            runCatching {
                                                                val token = session.accessToken() ?: error("No access token")
                                                                val group = selectedGroup ?: error("No selected group")
                                                                val version = selectedGroupVersion ?: error("Missing group version")
                                                                withContext(Dispatchers.IO) { api.renameGroup(group.id, brandingGroupName.trim(), version, token) }
                                                                val refreshedGroups = withContext(Dispatchers.IO) { api.listGroups(token) }
                                                                groups = refreshedGroups
                                                                selectedGroup = refreshedGroups.firstOrNull { it.id == group.id }
                                                                selectedGroupVersion = JSONObject(withContext(Dispatchers.IO) { api.get(ApiEndpoints.group(group.id), token) }).optInt("version", -1).takeIf { it >= 0 }
                                                                nativeDisplayRows(withContext(Dispatchers.IO) { api.get(ApiEndpoints.destination("settings", group.id)!!, token) }, "settings")
                                                            }.onSuccess { rows -> morePageData = rows }.onFailure { error = "request" }
                                                            morePageLoading = false
                                                        }
                                                    }) { Text(stringResource(R.string.branding_rename_group)) }
                                                    OutlinedButton(enabled = selectedGroupVersion != null && !morePageLoading, onClick = { confirmDeleteGroup = true }) { Text(stringResource(R.string.branding_delete_group)) }
                                                    if (confirmDeleteGroup) {
                                                        AlertDialog(
                                                            onDismissRequest = { confirmDeleteGroup = false },
                                                            title = { Text(stringResource(R.string.branding_delete_group_confirm)) },
                                                            text = { Text(stringResource(R.string.branding_delete_group_message)) },
                                                            confirmButton = {
                                                                Button(onClick = {
                                                                    confirmDeleteGroup = false
                                                                    scope.launch {
                                                                        morePageLoading = true
                                                                        runCatching {
                                                                            val token = session.accessToken() ?: error("No access token")
                                                                            val group = selectedGroup ?: error("No selected group")
                                                                            val version = selectedGroupVersion ?: error("Missing group version")
                                                                            withContext(Dispatchers.IO) { api.deleteGroup(group.id, version, token) }
                                                                            groups = withContext(Dispatchers.IO) { api.listGroups(token) }
                                                                            selectedGroup = null
                                                                            selectedGroupVersion = null
                                                                            morePageData = emptyList()
                                                                        }.onFailure { error = "request" }
                                                                        morePageLoading = false
                                                                    }
                                                                }) { Text(stringResource(R.string.branding_delete_group)) }
                                                            },
                                                            dismissButton = { OutlinedButton(onClick = { confirmDeleteGroup = false }) { Text(stringResource(R.string.people_cancel)) } },
                                                        )
                                                    }
                                                }
                                                if (selectedGroup?.role == "Owner") {
                                                    OutlinedTextField(brandingDisplayName, { brandingDisplayName = it }, label = { Text(stringResource(R.string.branding_display_name)) }, modifier = Modifier.fillMaxWidth())
                                                    OutlinedTextField(brandingAccentHex, { brandingAccentHex = it }, label = { Text(stringResource(R.string.branding_accent)) }, modifier = Modifier.fillMaxWidth(), singleLine = true)
                                                    OutlinedTextField(brandingSecondaryHex, { brandingSecondaryHex = it }, label = { Text(stringResource(R.string.branding_secondary)) }, modifier = Modifier.fillMaxWidth(), singleLine = true)
                                                    brandingTextFieldKeys.forEach { key ->
                                                        OutlinedTextField(
                                                            value = brandingAdditionalFields[key].orEmpty(),
                                                            onValueChange = { value -> brandingAdditionalFields = brandingAdditionalFields + (key to value) },
                                                            label = { Text(stringResource(brandingTextFieldLabel(key))) },
                                                            modifier = Modifier.fillMaxWidth(),
                                                            minLines = if (key in setOf("welcomeText", "tagline", "verse")) 2 else 1,
                                                        )
                                                    }
                                                    brandingSelectorOptions.forEach { selector ->
                                                        val selectedValue = if (selector.key == "cover") {
                                                            val kind = brandingAdditionalFields["coverKind"].orEmpty()
                                                            val value = brandingAdditionalFields["coverValue"].orEmpty()
                                                            if (kind.isBlank()) "" else "$kind:$value"
                                                        } else brandingAdditionalFields[selector.key].orEmpty().ifBlank { brandingDefaultChoice(selector.key) }
                                                        Box {
                                                            OutlinedButton(onClick = { brandingStyleMenu = selector.key }, modifier = Modifier.fillMaxWidth()) {
                                                                Text("${stringResource(selector.label)}: ${stringResource(selector.options.firstOrNull { it.first == selectedValue }?.second ?: selector.options.first().second)}")
                                                            }
                                                            androidx.compose.material3.DropdownMenu(expanded = brandingStyleMenu == selector.key, onDismissRequest = { brandingStyleMenu = null }) {
                                                                selector.options.forEach { (value, label) ->
                                                                    androidx.compose.material3.DropdownMenuItem(text = { Text(stringResource(label)) }, onClick = {
                                                                        if (selector.key == "cover") {
                                                                            val parts = value.split(":", limit = 2)
                                                                            brandingAdditionalFields = brandingAdditionalFields + mapOf("coverKind" to parts.getOrElse(0) { "" }, "coverValue" to parts.getOrElse(1) { "" })
                                                                        } else {
                                                                            brandingAdditionalFields = brandingAdditionalFields + (selector.key to value)
                                                                            brandingThemeColors[value]?.let { colors -> brandingAccentHex = colors.first; brandingSecondaryHex = colors.second }
                                                                        }
                                                                        brandingStyleMenu = null
                                                                    })
                                                                }
                                                            }
                                                        }
                                                    }
                                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                                        Text(stringResource(R.string.branding_show_sonivo_credit), modifier = Modifier.weight(1f))
                                                        Switch(checked = brandingShowSonivoCredit, onCheckedChange = { brandingShowSonivoCredit = it })
                                                    }
                                                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                                        OutlinedButton(enabled = !morePageLoading, onClick = { brandingAssetKind = "logo"; resourceFileLauncher.launch(arrayOf("image/*")) }, modifier = Modifier.fillMaxWidth()) { Text(stringResource(R.string.branding_upload_logo)) }
                                                        OutlinedButton(enabled = !morePageLoading, onClick = { brandingAssetKind = "banner"; resourceFileLauncher.launch(arrayOf("image/*")) }, modifier = Modifier.fillMaxWidth()) { Text(stringResource(R.string.branding_upload_banner)) }
                                                        OutlinedButton(enabled = !morePageLoading, onClick = { brandingAssetKind = "favicon"; resourceFileLauncher.launch(arrayOf("image/*")) }, modifier = Modifier.fillMaxWidth()) { Text(stringResource(R.string.branding_upload_favicon)) }
                                                    }
                                                    Button(enabled = brandingDisplayName.isNotBlank() && !morePageLoading, onClick = {
                                                        scope.launch {
                                                            morePageLoading = true
                                                            runCatching {
                                                                val token = session.accessToken() ?: error("No access token")
                                                                val version = morePageData.firstOrNull { it.id == "version" }?.detail?.toIntOrNull() ?: error("Missing branding version")
                                                                withContext(Dispatchers.IO) { api.updateBranding(selectedGroup!!.id, version, brandingDisplayName.trim(), brandingAccentHex, brandingSecondaryHex, token, brandingAdditionalFields + ("showSonivoCredit" to brandingShowSonivoCredit.toString())) }
                                                                nativeDisplayRows(withContext(Dispatchers.IO) { api.get(ApiEndpoints.destination("settings", selectedGroup!!.id)!!, token) }, "settings")
                                                            }.onSuccess { rows -> morePageData = rows }.onFailure { error = "request" }
                                                            morePageLoading = false
                                                        }
                                                    }) { Text(stringResource(R.string.branding_save)) }
                                                }
                                                LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                                    itemsIndexed(morePageData.filter { it.id !in setOf("displayName", "accentHex", "secondaryHex", "version") }, key = { index, row -> "branding-$index-${row.id}" }) { _, row ->
                                                        Card(Modifier.fillMaxWidth(), shape = RoundedCornerShape(16.dp)) { Column(Modifier.padding(12.dp)) { Text(row.title, style = MaterialTheme.typography.titleSmall); if (row.detail.isNotBlank()) Text(row.detail, style = MaterialTheme.typography.bodySmall) } }
                                                    }
                                                }
                                                Text(stringResource(R.string.branding_group_notifications), style = MaterialTheme.typography.titleSmall)
                                                Row(verticalAlignment = Alignment.CenterVertically) {
                                                    Text(stringResource(R.string.branding_notify_role_changes), modifier = Modifier.weight(1f))
                                                    Switch(checked = notifyRoleChanges, onCheckedChange = { notifyRoleChanges = it })
                                                }
                                                Row(verticalAlignment = Alignment.CenterVertically) {
                                                    Text(stringResource(R.string.branding_notify_task_assignments), modifier = Modifier.weight(1f))
                                                    Switch(checked = notifyTaskAssignments, onCheckedChange = { notifyTaskAssignments = it })
                                                }
                                                Button(enabled = !morePageLoading, onClick = {
                                                    scope.launch {
                                                        morePageLoading = true
                                                        runCatching {
                                                            val token = session.accessToken() ?: error("No access token")
                                                            withContext(Dispatchers.IO) { api.updateGroupNotificationPreferences(selectedGroup!!.id, notifyRoleChanges, notifyTaskAssignments, token) }
                                                        }.onFailure { error = "request" }
                                                        morePageLoading = false
                                                    }
                                                }) { Text(stringResource(R.string.branding_save_notifications)) }
                                                Text(stringResource(R.string.settings_tab_plan), style = MaterialTheme.typography.titleSmall)
                                                groupUsageRows.forEach { row ->
                                                    Card(Modifier.fillMaxWidth(), shape = RoundedCornerShape(14.dp)) {
                                                        Column(Modifier.padding(12.dp)) {
                                                            Text(row.title, style = MaterialTheme.typography.titleSmall)
                                                            if (row.detail.isNotBlank()) Text(row.detail, style = MaterialTheme.typography.bodySmall)
                                                        }
                                                    }
                                                }
                                                Text(stringResource(R.string.settings_tab_integrations), style = MaterialTheme.typography.titleSmall)
                                                Text(stringResource(R.string.settings_calendar_integration_help), style = MaterialTheme.typography.bodySmall)
                                                OutlinedButton(enabled = !morePageLoading, onClick = {
                                                    scope.launch {
                                                        runCatching {
                                                            val token = session.accessToken() ?: error("No access token")
                                                            val feed = withContext(Dispatchers.IO) { api.get(ApiEndpoints.calendarFeed(selectedGroup!!.id), token) }
                                                            val share = Intent(Intent.ACTION_SEND).apply { type = "text/calendar"; putExtra(Intent.EXTRA_TEXT, feed) }
                                                            context.startActivity(Intent.createChooser(share, context.getString(R.string.calendar_share_feed)))
                                                        }.onFailure { error = "request" }
                                                    }
                                                }) { Text(stringResource(R.string.calendar_share_feed)) }
                                            }
                                            destination.id == "resources" -> Column(verticalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.padding(top = 16.dp)) {
                                                OutlinedTextField(newResourceLabel, { newResourceLabel = it }, label = { Text(stringResource(R.string.resource_label)) }, modifier = Modifier.fillMaxWidth())
                                                OutlinedTextField(newResourceUrl, { newResourceUrl = it }, label = { Text(stringResource(R.string.resource_url)) }, modifier = Modifier.fillMaxWidth(), singleLine = true)
                                                OutlinedTextField(newResourcePart, { newResourcePart = it }, label = { Text(stringResource(R.string.resource_part)) }, modifier = Modifier.fillMaxWidth(), singleLine = true)
                                                OutlinedTextField(newResourceNote, { newResourceNote = it }, label = { Text(stringResource(R.string.resource_note)) }, modifier = Modifier.fillMaxWidth(), minLines = 2)
                                                var purposeMenuExpanded by remember { mutableStateOf(false) }
                                                Box {
                                                    OutlinedButton(onClick = { purposeMenuExpanded = true }) { Text(stringResource(resourcePurposeLabel(newResourcePurpose))) }
                                                    androidx.compose.material3.DropdownMenu(expanded = purposeMenuExpanded, onDismissRequest = { purposeMenuExpanded = false }) {
                                                        listOf("chart", "lyrics", "audio", "click", "reference", "practice", "other").forEach { purpose ->
                                                            androidx.compose.material3.DropdownMenuItem(text = { Text(stringResource(resourcePurposeLabel(purpose))) }, onClick = { newResourcePurpose = purpose; purposeMenuExpanded = false })
                                                        }
                                                    }
                                                }
                                                Box {
                                                    OutlinedButton(onClick = { resourceArrangementMenu = true }) { Text(availableSetlistArrangements.firstOrNull { it.id == newResourceArrangementId }?.let { "${it.songTitle.orEmpty()} · ${it.label}" } ?: stringResource(R.string.resource_choose_arrangement)) }
                                                    androidx.compose.material3.DropdownMenu(expanded = resourceArrangementMenu, onDismissRequest = { resourceArrangementMenu = false }) {
                                                        availableSetlistArrangements.forEach { arrangement -> androidx.compose.material3.DropdownMenuItem(text = { Text("${arrangement.songTitle.orEmpty()} · ${arrangement.label}") }, onClick = { newResourceArrangementId = arrangement.id; resourceArrangementMenu = false }) }
                                                    }
                                                }
                                                Button(enabled = newResourceLabel.isNotBlank() && newResourceUrl.isNotBlank() && newResourceArrangementId.isNotBlank() && !morePageLoading, onClick = {
                                                    scope.launch {
                                                        morePageLoading = true
                                                        runCatching {
                                                            val token = session.accessToken() ?: error("No access token")
                                                            withContext(Dispatchers.IO) { api.createLinkResource(selectedGroup!!.id, newResourceArrangementId, newResourceLabel.trim(), newResourceUrl.trim(), newResourcePurpose, token, newResourcePart.trim(), newResourceNote.trim()) }
                                                            nativeDisplayRows(withContext(Dispatchers.IO) { api.get(ApiEndpoints.destination("resources", selectedGroup!!.id)!!, token) }, "resources")
                                                        }.onSuccess { morePageData = it; newResourceLabel = ""; newResourceUrl = ""; newResourcePart = ""; newResourceNote = "" }.onFailure { error = "request" }
                                                        morePageLoading = false
                                                    }
                                                }) { Text(stringResource(R.string.resource_create_link)) }
                                                if (selectedGroup?.role == "Owner") OutlinedButton(enabled = newResourceArrangementId.isNotBlank() && !morePageLoading, onClick = { resourceFileLauncher.launch(arrayOf("*/*")) }) {
                                                    Text(stringResource(R.string.resource_upload_file))
                                                }
                                                LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                                    itemsIndexed(morePageData, key = { index, row -> "resource-$index-${row.id}" }) { _, row ->
                                                        var editingResource by remember(row.id) { mutableStateOf(false) }
                                                        var resourceLabel by remember(row.id) { mutableStateOf(row.title) }
                                                        var resourcePart by remember(row.id) { mutableStateOf(row.part.orEmpty()) }
                                                        var resourceNote by remember(row.id) { mutableStateOf(row.notes.orEmpty()) }
                                                        Card(Modifier.fillMaxWidth(), shape = RoundedCornerShape(16.dp)) {
                                                            Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                                                                if (editingResource && row.arrangementId != null && row.kind == "link") {
                                                                    OutlinedTextField(resourceLabel, { resourceLabel = it }, label = { Text(stringResource(R.string.resource_label)) }, modifier = Modifier.fillMaxWidth(), singleLine = true)
                                                                    OutlinedTextField(resourcePart, { resourcePart = it }, label = { Text(stringResource(R.string.resource_part)) }, modifier = Modifier.fillMaxWidth(), singleLine = true)
                                                                    OutlinedTextField(resourceNote, { resourceNote = it }, label = { Text(stringResource(R.string.resource_note)) }, modifier = Modifier.fillMaxWidth(), minLines = 2)
                                                                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                                                        OutlinedButton(onClick = { editingResource = false }) { Text(stringResource(R.string.people_cancel)) }
                                                                        Button(enabled = resourceLabel.isNotBlank() && !morePageLoading, onClick = {
                                                                            scope.launch {
                                                                                morePageLoading = true
                                                                                runCatching {
                                                                                    val token = session.accessToken() ?: error("No access token")
                                                                                    withContext(Dispatchers.IO) { api.updateLinkResource(selectedGroup!!.id, row.arrangementId, row.id, resourceLabel.trim(), resourcePart.trim(), resourceNote.trim(), token) }
                                                                                    nativeDisplayRows(withContext(Dispatchers.IO) { api.get(ApiEndpoints.destination("resources", selectedGroup!!.id)!!, token) }, "resources")
                                                                                }.onSuccess { morePageData = it; editingResource = false }.onFailure { error = "request" }
                                                                                morePageLoading = false
                                                                            }
                                                                        }) { Text(stringResource(R.string.more_save)) }
                                                                    }
                                                                } else {
                                                                    Text(row.title, style = MaterialTheme.typography.titleSmall)
                                                                    if (row.part != null) Text(row.part, style = MaterialTheme.typography.bodySmall)
                                                                    if (row.notes != null) Text(row.notes, style = MaterialTheme.typography.bodySmall)
                                                                }
                                                                if (row.detail.isNotBlank()) Text(row.detail, style = MaterialTheme.typography.bodySmall)
                                                                if (!editingResource && row.arrangementId != null && row.kind == "link") OutlinedButton(onClick = { editingResource = true }) { Text(stringResource(R.string.resource_edit)) }
                                                                row.url?.let { rawUrl ->
                                                                    val resourceUrl = runCatching { Uri.parse(rawUrl) }.getOrNull()
                                                                    if (resourceUrl != null && resourceUrl.scheme in setOf("https", "http")) OutlinedButton(onClick = { context.startActivity(Intent(Intent.ACTION_VIEW, resourceUrl)) }) { Text(stringResource(R.string.resource_open_link)) }
                                                                }
                                                                if (row.arrangementId != null && row.url != null) OutlinedButton(onClick = {
                                                                    scope.launch { runCatching {
                                                                        val token = session.accessToken() ?: error("No access token")
                                                                        withContext(Dispatchers.IO) { api.deleteResource(selectedGroup!!.id, row.arrangementId, row.id, token) }
                                                                        nativeDisplayRows(withContext(Dispatchers.IO) { api.get(ApiEndpoints.destination("resources", selectedGroup!!.id)!!, token) }, "resources")
                                                                    }.onSuccess { morePageData = it }.onFailure { error = "request" } }
                                                                }) { Text(stringResource(R.string.resource_delete)) }
                                                                if (row.arrangementId != null && row.kind == "file") OutlinedButton(onClick = {
                                                                    scope.launch {
                                                                        runCatching {
                                                                            val token = session.accessToken() ?: error("No access token")
                                                                            val targetName = (row.originalFileName ?: row.title).replace(Regex("[^A-Za-z0-9._-]"), "_").ifBlank { "${row.id}.download" }
                                                                            val file = java.io.File(context.cacheDir, "resource_exports/$targetName")
                                                                            file.parentFile?.mkdirs()
                                                                            withContext(Dispatchers.IO) { api.downloadResourceToFile(selectedGroup!!.id, row.arrangementId, row.id, file, token) }
                                                                            val contentUri = androidx.core.content.FileProvider.getUriForFile(context, "${context.packageName}.files", file)
                                                                            val viewIntent = Intent(Intent.ACTION_VIEW).setDataAndType(contentUri, context.contentResolver.getType(contentUri) ?: "application/octet-stream").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                                                                            context.startActivity(Intent.createChooser(viewIntent, row.title))
                                                                        }.onFailure { error = "request" }
                                                                    }
                                                                }) { Text(stringResource(R.string.resource_download)) }
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                            destination.id == "songs" -> Column(verticalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.padding(top = 16.dp)) {
                                                OutlinedTextField(newSongTitle, { newSongTitle = it }, label = { Text(stringResource(R.string.song_title)) }, modifier = Modifier.fillMaxWidth())
                                                OutlinedTextField(newSongAttribution, { newSongAttribution = it }, label = { Text(stringResource(R.string.song_attribution)) }, modifier = Modifier.fillMaxWidth())
                                                OutlinedTextField(newSongRightsNotes, { newSongRightsNotes = it }, label = { Text(stringResource(R.string.song_rights_notes)) }, modifier = Modifier.fillMaxWidth())
                                                OutlinedTextField(newSongTags, { newSongTags = it }, label = { Text(stringResource(R.string.song_tags)) }, modifier = Modifier.fillMaxWidth(), supportingText = { Text(stringResource(R.string.song_tags_hint)) })
                                                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                                    listOf("original" to R.string.song_original, "cover" to R.string.song_cover, "other" to R.string.song_other).forEach { (kind, label) ->
                                                        if (newSongOriginKind == kind) Button(onClick = {}) { Text(stringResource(label)) } else OutlinedButton(onClick = { newSongOriginKind = kind }) { Text(stringResource(label)) }
                                                    }
                                                }
                                                Button(enabled = newSongTitle.isNotBlank() && !morePageLoading, onClick = {
                                                    scope.launch {
                                                        runCatching {
                                                            val token = session.accessToken() ?: error("No access token")
                                                            withContext(Dispatchers.IO) { api.createSong(selectedGroup!!.id, newSongTitle.trim(), newSongOriginKind, token, newSongAttribution.trim(), newSongRightsNotes.trim(), newSongTags.split(',').map(String::trim).filter(String::isNotEmpty)) }
                                                            nativeDisplayRows(withContext(Dispatchers.IO) { api.get(ApiEndpoints.songs(selectedGroup!!.id), token) }, "songs")
                                                        }.onSuccess { morePageData = it; newSongTitle = ""; newSongAttribution = ""; newSongRightsNotes = ""; newSongTags = "" }.onFailure { error = "request" }
                                                    }
                                                }) { Text(stringResource(R.string.song_create)) }
                                                LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                                    itemsIndexed(morePageData, key = { index, row -> "song-$index-${row.id}" }) { _, row ->
                                                        var editing by remember(row.id) { mutableStateOf(false) }
                                                        var title by remember(row.id) { mutableStateOf(row.title) }
                                                        var attribution by remember(row.id) { mutableStateOf(row.attribution.orEmpty()) }
                                                        var rightsNotes by remember(row.id) { mutableStateOf(row.rightsNotes.orEmpty()) }
                                                        var tags by remember(row.id) { mutableStateOf(row.tags.joinToString(", ")) }
                                                        var originKind by remember(row.id) { mutableStateOf(row.type ?: "original") }
                                                        var confirmDelete by remember(row.id) { mutableStateOf(false) }
                                                        Card(Modifier.fillMaxWidth(), shape = RoundedCornerShape(16.dp)) {
                                                            Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                                                if (editing) {
                                                                    OutlinedTextField(title, { title = it }, label = { Text(stringResource(R.string.song_title)) }, modifier = Modifier.fillMaxWidth())
                                                                    OutlinedTextField(attribution, { attribution = it }, label = { Text(stringResource(R.string.song_attribution)) }, modifier = Modifier.fillMaxWidth())
                                                                    OutlinedTextField(rightsNotes, { rightsNotes = it }, label = { Text(stringResource(R.string.song_rights_notes)) }, modifier = Modifier.fillMaxWidth())
                                                                    OutlinedTextField(tags, { tags = it }, label = { Text(stringResource(R.string.song_tags)) }, modifier = Modifier.fillMaxWidth())
                                                                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                                                        listOf("original" to R.string.song_original, "cover" to R.string.song_cover, "other" to R.string.song_other).forEach { (kind, label) ->
                                                                            if (originKind == kind) Button(onClick = {}) { Text(stringResource(label)) } else OutlinedButton(onClick = { originKind = kind }) { Text(stringResource(label)) }
                                                                        }
                                                                    }
                                                                } else Text(row.title, style = MaterialTheme.typography.titleSmall)
                                                                if (row.detail.isNotBlank()) Text(row.detail, style = MaterialTheme.typography.bodySmall)
                                                                OutlinedButton(onClick = {
                                                                    scope.launch {
                                                                        runCatching {
                                                                            val token = session.accessToken() ?: error("No access token")
                                                                            withContext(Dispatchers.IO) { api.listArrangements(selectedGroup!!.id, row.id, token) }
                                                                        }.onSuccess { songArrangements = it; arrangementSongId = if (arrangementSongId == row.id) null else row.id }.onFailure { error = "request" }
                                                                    }
                                                                }) { Text(stringResource(if (arrangementSongId == row.id) R.string.arrangement_hide else R.string.arrangement_manage)) }
                                                                if (arrangementSongId == row.id) {
                                                                    OutlinedTextField(newArrangementLabel, { newArrangementLabel = it }, label = { Text(stringResource(R.string.arrangement_label)) }, modifier = Modifier.fillMaxWidth())
                                                                    OutlinedTextField(newArrangementKey, { newArrangementKey = it }, label = { Text(stringResource(R.string.arrangement_key)) }, modifier = Modifier.fillMaxWidth())
                                                                    OutlinedTextField(newArrangementBpm, { newArrangementBpm = it.filter(Char::isDigit).take(3) }, label = { Text(stringResource(R.string.arrangement_bpm)) }, modifier = Modifier.fillMaxWidth(), singleLine = true)
                                                                    OutlinedTextField(newArrangementLyrics, { newArrangementLyrics = it }, label = { Text(stringResource(R.string.arrangement_lyrics)) }, modifier = Modifier.fillMaxWidth(), minLines = 3)
                                                                    OutlinedTextField(newArrangementChords, { newArrangementChords = it }, label = { Text(stringResource(R.string.arrangement_chords)) }, modifier = Modifier.fillMaxWidth(), minLines = 3)
                                                                    OutlinedTextField(newArrangementStructure, { newArrangementStructure = it }, label = { Text(stringResource(R.string.arrangement_structure)) }, modifier = Modifier.fillMaxWidth())
                                                                    OutlinedTextField(newArrangementNotes, { newArrangementNotes = it }, label = { Text(stringResource(R.string.arrangement_notes)) }, modifier = Modifier.fillMaxWidth())
                                                                    Button(enabled = newArrangementLabel.isNotBlank() && (newArrangementBpm.isBlank() || newArrangementBpm.toIntOrNull() in 1..400), onClick = {
                                                                        scope.launch {
                                                                            runCatching {
                                                                                val token = session.accessToken() ?: error("No access token")
                                                                                withContext(Dispatchers.IO) { api.createArrangement(selectedGroup!!.id, row.id, newArrangementLabel.trim(), newArrangementKey.trim().ifEmpty { null }, newArrangementBpm.toIntOrNull(), newArrangementLyrics, newArrangementChords, newArrangementStructure, newArrangementNotes, token) }
                                                                                withContext(Dispatchers.IO) { api.listArrangements(selectedGroup!!.id, row.id, token) }
                                                                            }.onSuccess { songArrangements = it; newArrangementLabel = ""; newArrangementKey = ""; newArrangementBpm = ""; newArrangementLyrics = ""; newArrangementChords = ""; newArrangementStructure = ""; newArrangementNotes = "" }.onFailure { error = "request" }
                                                                        }
                                                                    }) { Text(stringResource(R.string.arrangement_create)) }
                                                                    songArrangements.forEach { arrangement ->
                                                                        var editLabel by remember(arrangement.id) { mutableStateOf(arrangement.label) }
                                                                        var editKey by remember(arrangement.id) { mutableStateOf(arrangement.defaultKey.orEmpty()) }
                                                                        var editBpm by remember(arrangement.id) { mutableStateOf(arrangement.defaultBpm?.toString().orEmpty()) }
                                                                        var editLyrics by remember(arrangement.id) { mutableStateOf("") }
                                                                        var editChords by remember(arrangement.id) { mutableStateOf("") }
                                                                        var editStructure by remember(arrangement.id) { mutableStateOf("") }
                                                                        var editNotes by remember(arrangement.id) { mutableStateOf("") }
                                                                        var arrangementDetail by remember(arrangement.id) { mutableStateOf<MobileArrangement?>(null) }
                                                                        var editingArrangement by remember(arrangement.id) { mutableStateOf(false) }
                                                                        Text(arrangement.label, style = MaterialTheme.typography.titleSmall)
                                                                        if (editingArrangement) {
                                                                            OutlinedTextField(editLabel, { editLabel = it }, label = { Text(stringResource(R.string.arrangement_label)) }, modifier = Modifier.fillMaxWidth())
                                                                            OutlinedTextField(editKey, { editKey = it }, label = { Text(stringResource(R.string.arrangement_key)) }, modifier = Modifier.fillMaxWidth())
                                                                            OutlinedTextField(editBpm, { editBpm = it.filter(Char::isDigit).take(3) }, label = { Text(stringResource(R.string.arrangement_bpm)) }, modifier = Modifier.fillMaxWidth())
                                                                            OutlinedTextField(editLyrics, { editLyrics = it }, label = { Text(stringResource(R.string.arrangement_lyrics)) }, modifier = Modifier.fillMaxWidth(), minLines = 3)
                                                                            OutlinedTextField(editChords, { editChords = it }, label = { Text(stringResource(R.string.arrangement_chords)) }, modifier = Modifier.fillMaxWidth(), minLines = 3)
                                                                            OutlinedTextField(editStructure, { editStructure = it }, label = { Text(stringResource(R.string.arrangement_structure)) }, modifier = Modifier.fillMaxWidth())
                                                                            OutlinedTextField(editNotes, { editNotes = it }, label = { Text(stringResource(R.string.arrangement_notes)) }, modifier = Modifier.fillMaxWidth())
                                                                        }
                                                                        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                                                            OutlinedButton(onClick = {
                                                                                if (!editingArrangement) scope.launch {
                                                                                    runCatching {
                                                                                        val token = session.accessToken() ?: error("No access token")
                                                                                        withContext(Dispatchers.IO) { api.getArrangement(selectedGroup!!.id, arrangement.id, token) }
                                                                                    }.onSuccess { detail -> arrangementDetail = detail; editLabel = detail.label; editKey = detail.defaultKey.orEmpty(); editBpm = detail.defaultBpm?.toString().orEmpty(); editLyrics = detail.lyrics.orEmpty(); editChords = detail.chords.orEmpty(); editStructure = detail.structure.orEmpty(); editNotes = detail.notes.orEmpty(); editingArrangement = true }.onFailure { error = "request" }
                                                                                } else scope.launch {
                                                                                    runCatching {
                                                                                        val token = session.accessToken() ?: error("No access token")
                                                                                        val detail = arrangementDetail ?: error("Arrangement details are missing")
                                                                                        withContext(Dispatchers.IO) { api.updateArrangement(selectedGroup!!.id, detail, editLabel.trim(), editKey.trim().ifEmpty { null }, editBpm.toIntOrNull(), editLyrics, editChords, editStructure, editNotes, token) }
                                                                                        withContext(Dispatchers.IO) { api.listArrangements(selectedGroup!!.id, row.id, token) }
                                                                                    }.onSuccess { songArrangements = it; editingArrangement = false }.onFailure { error = "request" }
                                                                                }
                                                                            }) { Text(stringResource(if (editingArrangement) R.string.more_save else R.string.arrangement_edit)) }
                                                                            OutlinedButton(onClick = { scope.launch {
                                                                                runCatching {
                                                                                    val token = session.accessToken() ?: error("No access token")
                                                                                    withContext(Dispatchers.IO) { api.deleteArrangement(selectedGroup!!.id, arrangement, token) }
                                                                                    withContext(Dispatchers.IO) { api.listArrangements(selectedGroup!!.id, row.id, token) }
                                                                                }.onSuccess { songArrangements = it }.onFailure { error = "request" }
                                                                            } }) { Text(stringResource(R.string.arrangement_delete)) }
                                                                        }
                                                                    }
                                                                }
                                                                if (row.version != null) Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                                                    OutlinedButton(onClick = {
                                                                        if (!editing) scope.launch {
                                                                            runCatching {
                                                                                val token = session.accessToken() ?: error("No access token")
                                                                                val detail = withContext(Dispatchers.IO) { nativeDisplayRows(api.get(ApiEndpoints.song(selectedGroup!!.id, row.id), token), "songs").firstOrNull() } ?: row
                                                                                title = detail.title; attribution = detail.attribution.orEmpty(); rightsNotes = detail.rightsNotes.orEmpty(); tags = detail.tags.joinToString(", "); originKind = detail.type ?: "original"
                                                                            }.onSuccess { editing = true }.onFailure { error = "request" }
                                                                        }
                                                                        else scope.launch {
                                                                            runCatching {
                                                                                val token = session.accessToken() ?: error("No access token")
                                                                                withContext(Dispatchers.IO) { api.updateSong(selectedGroup!!.id, row.id, title.trim(), row.version, token, originKind, attribution.trim(), rightsNotes.trim(), tags.split(',').map(String::trim).filter(String::isNotEmpty)) }
                                                                                nativeDisplayRows(withContext(Dispatchers.IO) { api.get(ApiEndpoints.songs(selectedGroup!!.id), token) }, "songs")
                                                                            }.onSuccess { morePageData = it; editing = false }.onFailure { error = "request" }
                                                                        }
                                                                    }) { Text(stringResource(if (editing) R.string.more_save else R.string.song_edit)) }
                                                                    OutlinedButton(onClick = { confirmDelete = true }) { Text(stringResource(R.string.song_delete)) }
                                                                }
                                                                if (confirmDelete) AlertDialog(
                                                                    onDismissRequest = { confirmDelete = false }, title = { Text(stringResource(R.string.song_confirm_delete)) },
                                                                    confirmButton = { Button(onClick = {
                                                                        confirmDelete = false
                                                                        scope.launch { runCatching {
                                                                            val token = session.accessToken() ?: error("No access token")
                                                                            withContext(Dispatchers.IO) { api.deleteSong(selectedGroup!!.id, row.id, row.version!!, token) }
                                                                            nativeDisplayRows(withContext(Dispatchers.IO) { api.get(ApiEndpoints.songs(selectedGroup!!.id), token) }, "songs")
                                                                        }.onSuccess { morePageData = it }.onFailure { error = "request" } }
                                                                    }) { Text(stringResource(R.string.song_delete)) } },
                                                                    dismissButton = { OutlinedButton(onClick = { confirmDelete = false }) { Text(stringResource(R.string.people_cancel)) } },
                                                                )
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                            destination.id == "setlists" -> Column(verticalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.padding(top = 16.dp)) {
                                                OutlinedTextField(newSetlistName, { newSetlistName = it }, label = { Text(stringResource(R.string.setlist_name)) }, modifier = Modifier.fillMaxWidth())
                                                Button(enabled = newSetlistName.isNotBlank() && !morePageLoading, onClick = {
                                                    scope.launch {
                                                        morePageLoading = true
                                                        runCatching {
                                                            val token = session.accessToken() ?: error("No access token")
                                                            withContext(Dispatchers.IO) { api.createSetlist(selectedGroup!!.id, newSetlistName.trim(), token) }
                                                            nativeDisplayRows(withContext(Dispatchers.IO) { api.get(ApiEndpoints.setlists(selectedGroup!!.id), token) }, "setlists")
                                                        }.onSuccess { morePageData = it; newSetlistName = "" }.onFailure { error = "request" }
                                                        morePageLoading = false
                                                    }
                                                }) { Text(stringResource(R.string.setlist_create)) }
                                                LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                                    itemsIndexed(morePageData, key = { index, row -> "setlist-$index-${row.id}" }) { _, row ->
                                                        var editing by remember(row.id) { mutableStateOf(false) }
                                                        var name by remember(row.id) { mutableStateOf(row.title) }
                                                        Card(Modifier.fillMaxWidth(), shape = RoundedCornerShape(16.dp)) {
                                                            Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                                                if (editing) OutlinedTextField(name, { name = it }, label = { Text(stringResource(R.string.setlist_name)) }, modifier = Modifier.fillMaxWidth())
                                                                else Text(row.title, style = MaterialTheme.typography.titleSmall)
                                                                if (row.detail.isNotBlank()) Text(row.detail, style = MaterialTheme.typography.bodySmall)
                                                                if (row.version != null) {
                                                                    if (editing) Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                                                        Button(enabled = name.isNotBlank(), onClick = {
                                                                            scope.launch {
                                                                                runCatching {
                                                                                    val token = session.accessToken() ?: error("No access token")
                                                                                    withContext(Dispatchers.IO) { api.renameSetlist(selectedGroup!!.id, row.id, name.trim(), row.version, token) }
                                                                                    nativeDisplayRows(withContext(Dispatchers.IO) { api.get(ApiEndpoints.setlists(selectedGroup!!.id), token) }, "setlists")
                                                                                }.onSuccess { morePageData = it; editing = false }.onFailure { error = "request" }
                                                                            }
                                                                        }) { Text(stringResource(R.string.more_save)) }
                                                                        OutlinedButton(onClick = { editing = false; name = row.title }) { Text(stringResource(R.string.people_cancel)) }
                                                                    } else OutlinedButton(onClick = { editing = true }) { Text(stringResource(R.string.setlist_rename)) }
                                                                }
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                            destination.id == "calendar" -> Column(verticalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.padding(top = 16.dp)) {
                                                val periodCalendar = java.util.Calendar.getInstance().apply {
                                                    timeInMillis = calendarCursor
                                                    set(java.util.Calendar.HOUR_OF_DAY, 0); set(java.util.Calendar.MINUTE, 0); set(java.util.Calendar.SECOND, 0); set(java.util.Calendar.MILLISECOND, 0)
                                                    when (calendarPeriod) {
                                                        "month" -> set(java.util.Calendar.DAY_OF_MONTH, 1)
                                                        "week" -> set(java.util.Calendar.DAY_OF_WEEK, firstDayOfWeek)
                                                    }
                                                }
                                                val rangeStart = periodCalendar.timeInMillis
                                                val periodEnd = (periodCalendar.clone() as java.util.Calendar).apply { add(when (calendarPeriod) { "month" -> java.util.Calendar.MONTH; "week" -> java.util.Calendar.WEEK_OF_YEAR; else -> java.util.Calendar.DAY_OF_MONTH }, 1) }.timeInMillis
                                                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                                    OutlinedButton(onClick = { val c = java.util.Calendar.getInstance().apply { timeInMillis = calendarCursor; add(when (calendarPeriod) { "month" -> java.util.Calendar.MONTH; "week" -> java.util.Calendar.WEEK_OF_YEAR; else -> java.util.Calendar.DAY_OF_MONTH }, -1) }; calendarCursor = c.timeInMillis }) { Text(stringResource(R.string.calendar_prev)) }
                                                    Text(java.text.DateFormat.getDateInstance(java.text.DateFormat.MEDIUM).format(java.util.Date(calendarCursor)), Modifier.weight(1f))
                                                    OutlinedButton(onClick = { val c = java.util.Calendar.getInstance().apply { timeInMillis = calendarCursor; add(when (calendarPeriod) { "month" -> java.util.Calendar.MONTH; "week" -> java.util.Calendar.WEEK_OF_YEAR; else -> java.util.Calendar.DAY_OF_MONTH }, 1) }; calendarCursor = c.timeInMillis }) { Text(stringResource(R.string.calendar_next)) }
                                                    OutlinedButton(onClick = { calendarCursor = System.currentTimeMillis() }) { Text(stringResource(R.string.calendar_today)) }
                                                }
                                                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                                    listOf("month" to R.string.calendar_month, "week" to R.string.calendar_week, "day" to R.string.calendar_day).forEach { (period, label) ->
                                                        if (calendarPeriod == period) Button(onClick = {}) { Text(stringResource(label)) } else OutlinedButton(onClick = { calendarPeriod = period }) { Text(stringResource(label)) }
                                                    }
                                                }
                                                OutlinedButton(onClick = {
                                                    scope.launch {
                                                        runCatching {
                                                            val token = session.accessToken() ?: error("No access token")
                                                            val feed = withContext(Dispatchers.IO) { api.get(ApiEndpoints.calendarFeed(selectedGroup!!.id), token) }
                                                            val share = Intent(Intent.ACTION_SEND).apply { type = "text/calendar"; putExtra(Intent.EXTRA_TEXT, feed) }
                                                            context.startActivity(Intent.createChooser(share, context.getString(R.string.calendar_share_feed)))
                                                        }.onFailure { error = "request" }
                                                    }
                                                }) { Text(stringResource(R.string.calendar_share_feed)) }
                                                LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                                    itemsIndexed(morePageData.filter { row -> row.startsAt?.let { startsAt -> runCatching { val at = java.time.Instant.parse(startsAt).toEpochMilli(); at >= rangeStart && at < periodEnd }.getOrDefault(false) } == true }, key = { index, row -> "calendar-$index-${row.id}" }) { _, row ->
                                                        Card(Modifier.fillMaxWidth(), shape = RoundedCornerShape(16.dp)) {
                                                            Column(Modifier.padding(12.dp)) {
                                                                Text(row.title, style = MaterialTheme.typography.titleSmall)
                                                                if (row.detail.isNotBlank()) Text(row.detail, style = MaterialTheme.typography.bodySmall)
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                            destination.id == "events" -> Column(verticalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.padding(top = 16.dp)) {
                                                OutlinedTextField(value = newEventTitle, onValueChange = { newEventTitle = it }, label = { Text(stringResource(R.string.event_title)) }, modifier = Modifier.fillMaxWidth())
                                                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                                    listOf("rehearsal" to R.string.event_rehearsal, "performance" to R.string.event_performance, "other" to R.string.event_other).forEach { (value, label) ->
                                                        if (newEventType == value) Button(onClick = {}) { Text(stringResource(label)) }
                                                        else OutlinedButton(onClick = { newEventType = value }) { Text(stringResource(label)) }
                                                    }
                                                }
                                                OutlinedButton(onClick = {
                                                    val calendar = java.util.Calendar.getInstance().apply { timeInMillis = newEventStartsAt }
                                                    android.app.DatePickerDialog(context, { _, year, month, day ->
                                                        val chosen = java.util.Calendar.getInstance().apply {
                                                            timeInMillis = newEventStartsAt
                                                            set(java.util.Calendar.YEAR, year); set(java.util.Calendar.MONTH, month); set(java.util.Calendar.DAY_OF_MONTH, day)
                                                        }
                                                        android.app.TimePickerDialog(context, { _, hour, minute ->
                                                            chosen.set(java.util.Calendar.HOUR_OF_DAY, hour); chosen.set(java.util.Calendar.MINUTE, minute)
                                                            newEventStartsAt = chosen.timeInMillis
                                                        }, chosen.get(java.util.Calendar.HOUR_OF_DAY), chosen.get(java.util.Calendar.MINUTE), false).show()
                                                    }, calendar.get(java.util.Calendar.YEAR), calendar.get(java.util.Calendar.MONTH), calendar.get(java.util.Calendar.DAY_OF_MONTH)).show()
                                                }) { Text(java.text.DateFormat.getDateTimeInstance().format(java.util.Date(newEventStartsAt))) }
                                                Button(enabled = newEventTitle.isNotBlank() && !morePageLoading, onClick = {
                                                    scope.launch {
                                                        morePageLoading = true
                                                        runCatching {
                                                            val token = session.accessToken() ?: error("No access token")
                                                            withContext(Dispatchers.IO) { api.createEvent(selectedGroup!!.id, newEventTitle.trim(), newEventType, java.time.Instant.ofEpochMilli(newEventStartsAt).toString(), token) }
                                                            val path = ApiEndpoints.destination("events", selectedGroup!!.id) ?: error("No event route")
                                                            nativeDisplayRows(withContext(Dispatchers.IO) { api.get(path, token) }, "events")
                                                        }.onSuccess { morePageData = it; newEventTitle = "" }
                                                            .onFailure { error = "request" }
                                                        morePageLoading = false
                                                    }
                                                }) { Text(stringResource(R.string.event_create)) }
                                                if (morePageLoading) Text(stringResource(R.string.loading))
                                                LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                                    itemsIndexed(morePageData, key = { index, row -> "event-$index-${row.id}" }) { _, row ->
                                                        var editingEvent by remember(row.id) { mutableStateOf(false) }
                                                        var editEventTitle by remember(row.id) { mutableStateOf(row.title) }
                                                        var editEventType by remember(row.id) { mutableStateOf(row.type ?: "rehearsal") }
                                                        var editEventStartsAt by remember(row.id) { mutableStateOf(runCatching { java.time.Instant.parse(row.startsAt).toEpochMilli() }.getOrDefault(System.currentTimeMillis())) }
                                                        var confirmCancelEvent by remember(row.id) { mutableStateOf(false) }
                                                        Card(Modifier.fillMaxWidth(), shape = RoundedCornerShape(16.dp)) {
                                                            Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                                                if (editingEvent) {
                                                                    OutlinedTextField(editEventTitle, { editEventTitle = it }, label = { Text(stringResource(R.string.event_title)) }, modifier = Modifier.fillMaxWidth())
                                                                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                                                        listOf("rehearsal" to R.string.event_rehearsal, "performance" to R.string.event_performance, "other" to R.string.event_other).forEach { (value, label) ->
                                                                            if (editEventType == value) Button(onClick = {}) { Text(stringResource(label)) } else OutlinedButton(onClick = { editEventType = value }) { Text(stringResource(label)) }
                                                                        }
                                                                    }
                                                                    OutlinedButton(onClick = {
                                                                        val calendar = java.util.Calendar.getInstance().apply { timeInMillis = editEventStartsAt }
                                                                        android.app.DatePickerDialog(context, { _, year, month, day ->
                                                                            val chosen = java.util.Calendar.getInstance().apply { timeInMillis = editEventStartsAt; set(java.util.Calendar.YEAR, year); set(java.util.Calendar.MONTH, month); set(java.util.Calendar.DAY_OF_MONTH, day) }
                                                                            android.app.TimePickerDialog(context, { _, hour, minute -> chosen.set(java.util.Calendar.HOUR_OF_DAY, hour); chosen.set(java.util.Calendar.MINUTE, minute); editEventStartsAt = chosen.timeInMillis }, chosen.get(java.util.Calendar.HOUR_OF_DAY), chosen.get(java.util.Calendar.MINUTE), false).show()
                                                                        }, calendar.get(java.util.Calendar.YEAR), calendar.get(java.util.Calendar.MONTH), calendar.get(java.util.Calendar.DAY_OF_MONTH)).show()
                                                                    }) { Text(java.text.DateFormat.getDateTimeInstance().format(java.util.Date(editEventStartsAt))) }
                                                                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                                                        Button(enabled = editEventTitle.isNotBlank() && row.version != null, onClick = {
                                                                            scope.launch {
                                                                                runCatching {
                                                                                    val token = session.accessToken() ?: error("No access token")
                                                                                    withContext(Dispatchers.IO) { api.patchJson(ApiEndpoints.event(selectedGroup!!.id, row.id), JSONObject().put("title", editEventTitle.trim()).put("type", editEventType).put("startsAt", java.time.Instant.ofEpochMilli(editEventStartsAt).toString()).put("expectedVersion", row.version), token) }
                                                                                    nativeDisplayRows(withContext(Dispatchers.IO) { api.get(ApiEndpoints.events(selectedGroup!!.id), token) }, "events")
                                                                                }.onSuccess { morePageData = it; editingEvent = false }
                                                                                    .onFailure { error = "request" }
                                                                            }
                                                                        }) { Text(stringResource(R.string.more_save)) }
                                                                        OutlinedButton(onClick = { editingEvent = false }) { Text(stringResource(R.string.people_cancel)) }
                                                                    }
                                                                } else {
                                                                    Text(row.title, style = MaterialTheme.typography.titleSmall)
                                                                    if (row.detail.isNotBlank()) Text(row.detail, style = MaterialTheme.typography.bodyMedium)
                                                                    OutlinedButton(onClick = {
                                                                        scope.launch {
                                                                            runCatching {
                                                                                val token = session.accessToken() ?: error("No access token")
                                                                                val rows = nativeDisplayRows(withContext(Dispatchers.IO) { api.get(ApiEndpoints.eventRsvps(selectedGroup!!.id, row.id), token) }, "rsvps")
                                                                                eventRsvpRows = rows
                                                                                eventRsvpFor = if (eventRsvpFor == row.id) null else row.id
                                                                            }.onFailure { error = "request" }
                                                                        }
                                                                    }) { Text(stringResource(if (eventRsvpFor == row.id) R.string.event_hide_responses else R.string.event_view_responses)) }
                                                                    if (eventRsvpFor == row.id) eventRsvpRows.forEach { rsvp ->
                                                                        Text("${rsvp.title} · ${rsvp.detail}", style = MaterialTheme.typography.bodySmall)
                                                                    }
                                                                    row.assigneeUserId?.let { assignee -> taskAssignees.firstOrNull { it.id == assignee }?.let { Text(stringResource(R.string.task_assigned_to, it.title), style = MaterialTheme.typography.bodySmall) } }
                                                                    if (row.version != null && row.status != "cancelled") Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                                                        OutlinedButton(onClick = { editingEvent = true }) { Text(stringResource(R.string.event_edit)) }
                                                                        OutlinedButton(onClick = { confirmCancelEvent = true }) { Text(stringResource(R.string.event_cancel_action)) }
                                                                        OutlinedButton(onClick = {
                                                                            scope.launch {
                                                                                runCatching {
                                                                                    val token = session.accessToken() ?: error("No access token")
                                                                                    val raw = JSONArray(withContext(Dispatchers.IO) { api.get(ApiEndpoints.setlists(selectedGroup!!.id), token) })
                                                                                    eventSetlistChoices = (0 until raw.length()).map { index -> raw.getJSONObject(index).let { MobileSetlistSummary(it.getString("id"), it.getString("name"), it.optInt("version"), it.optInt("itemCount")) } }
                                                                                    applyingSetlistTo = row
                                                                                }.onFailure { error = "request" }
                                                                            }
                                                                        }) { Text(stringResource(R.string.event_apply_setlist)) }
                                                                        OutlinedButton(onClick = {
                                                                            scope.launch {
                                                                                runCatching {
                                                                                    val token = session.accessToken() ?: error("No access token")
                                                                                    withContext(Dispatchers.IO) { api.postJson(ApiEndpoints.eventDuplicate(selectedGroup!!.id, row.id), JSONObject().put("expectedVersion", row.version), token) }
                                                                                    nativeDisplayRows(withContext(Dispatchers.IO) { api.get(ApiEndpoints.events(selectedGroup!!.id), token) }, "events")
                                                                                }.onSuccess { morePageData = it }.onFailure { error = "request" }
                                                                            }
                                                                        }) { Text(stringResource(R.string.event_duplicate)) }
                                                                    }
                                                                }
                                                                if (confirmCancelEvent) AlertDialog(
                                                                    onDismissRequest = { confirmCancelEvent = false },
                                                                    title = { Text(stringResource(R.string.event_confirm_cancel)) },
                                                                    confirmButton = {
                                                                        Button(onClick = {
                                                                            confirmCancelEvent = false
                                                                            scope.launch {
                                                                                runCatching {
                                                                                    val token = session.accessToken() ?: error("No access token")
                                                                                    withContext(Dispatchers.IO) { api.postJson(ApiEndpoints.eventCancel(selectedGroup!!.id, row.id), JSONObject().put("expectedVersion", row.version), token) }
                                                                                    nativeDisplayRows(withContext(Dispatchers.IO) { api.get(ApiEndpoints.events(selectedGroup!!.id), token) }, "events")
                                                                                }.onSuccess { morePageData = it }.onFailure { error = "request" }
                                                                            }
                                                                        }) { Text(stringResource(R.string.event_cancel_action)) }
                                                                    },
                                                                    dismissButton = { OutlinedButton(onClick = { confirmCancelEvent = false }) { Text(stringResource(R.string.people_cancel)) } },
                                                                )
                                                            }
                                                        }
                                                    }
                                                }
                                                eventSetlistChoices?.let { choices ->
                                                    AlertDialog(
                                                        onDismissRequest = { eventSetlistChoices = null; applyingSetlistTo = null },
                                                        title = { Text(stringResource(R.string.event_apply_setlist)) },
                                                        text = {
                                                            if (choices.isEmpty()) Text(stringResource(R.string.event_no_setlists))
                                                            else Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                                                    choices.forEach { setlist ->
                                                                    OutlinedButton(onClick = { selectedSetlistForEvent = setlist; eventSetlistChoices = null }) {
                                                                        Text("${setlist.name} (${setlist.itemCount})")
                                                                    }
                                                                }
                                                            }
                                                        },
                                                        confirmButton = { OutlinedButton(onClick = { eventSetlistChoices = null }) { Text(stringResource(R.string.people_cancel)) } },
                                                    )
                                                }
                                                selectedSetlistForEvent?.let { setlist ->
                                                    AlertDialog(
                                                        onDismissRequest = { selectedSetlistForEvent = null; applyingSetlistTo = null },
                                                        title = { Text(stringResource(R.string.event_confirm_apply_setlist)) },
                                                        text = { Text(setlist.name) },
                                                        confirmButton = {
                                                            Button(onClick = {
                                                                val target = applyingSetlistTo
                                                                selectedSetlistForEvent = null
                                                                applyingSetlistTo = null
                                                                if (target != null && target.version != null) scope.launch {
                                                                    runCatching {
                                                                        val token = session.accessToken() ?: error("No access token")
                                                                        withContext(Dispatchers.IO) { api.postJson(ApiEndpoints.eventApplySetlist(selectedGroup!!.id, target.id), JSONObject().put("setlistId", setlist.id).put("expectedVersion", target.version).put("confirmReplace", true), token) }
                                                                        nativeDisplayRows(withContext(Dispatchers.IO) { api.get(ApiEndpoints.events(selectedGroup!!.id), token) }, "events")
                                                                    }.onSuccess { morePageData = it }.onFailure { error = "request" }
                                                                }
                                                            }) { Text(stringResource(R.string.event_apply_setlist)) }
                                                        },
                                                        dismissButton = { OutlinedButton(onClick = { selectedSetlistForEvent = null; applyingSetlistTo = null }) { Text(stringResource(R.string.people_cancel)) } },
                                                    )
                                                }
                                            }
                                            destination.id == "tasks" -> Column(verticalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.padding(top = 16.dp)) {
                                                OutlinedTextField(value = newTaskTitle, onValueChange = { newTaskTitle = it }, label = { Text(stringResource(R.string.task_new_title)) }, modifier = Modifier.fillMaxWidth())
                                                OutlinedTextField(value = newTaskNotes, onValueChange = { newTaskNotes = it }, label = { Text(stringResource(R.string.task_notes)) }, modifier = Modifier.fillMaxWidth(), minLines = 2)
                                                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                                    OutlinedButton(onClick = {
                                                        val calendar = java.util.Calendar.getInstance().apply { timeInMillis = if (newTaskDueAt == 0L) System.currentTimeMillis() else newTaskDueAt }
                                                        android.app.DatePickerDialog(context, { _, year, month, day ->
                                                            val chosen = java.util.Calendar.getInstance().apply { timeInMillis = if (newTaskDueAt == 0L) System.currentTimeMillis() else newTaskDueAt; set(java.util.Calendar.YEAR, year); set(java.util.Calendar.MONTH, month); set(java.util.Calendar.DAY_OF_MONTH, day) }
                                                            android.app.TimePickerDialog(context, { _, hour, minute -> chosen.set(java.util.Calendar.HOUR_OF_DAY, hour); chosen.set(java.util.Calendar.MINUTE, minute); newTaskDueAt = chosen.timeInMillis }, chosen.get(java.util.Calendar.HOUR_OF_DAY), chosen.get(java.util.Calendar.MINUTE), false).show()
                                                        }, calendar.get(java.util.Calendar.YEAR), calendar.get(java.util.Calendar.MONTH), calendar.get(java.util.Calendar.DAY_OF_MONTH)).show()
                                                    }) { Text(if (newTaskDueAt == 0L) stringResource(R.string.task_due_date) else java.text.DateFormat.getDateTimeInstance().format(java.util.Date(newTaskDueAt))) }
                                                    if (newTaskDueAt != 0L) OutlinedButton(onClick = { newTaskDueAt = 0L }) { Text(stringResource(R.string.task_clear_due_date)) }
                                                }
                                                Box {
                                                    OutlinedButton(onClick = { newTaskAssigneeMenu = true }) { Text(taskAssignees.firstOrNull { it.id == newTaskAssigneeId }?.title ?: stringResource(R.string.task_assignee)) }
                                                    androidx.compose.material3.DropdownMenu(expanded = newTaskAssigneeMenu, onDismissRequest = { newTaskAssigneeMenu = false }) {
                                                        androidx.compose.material3.DropdownMenuItem(text = { Text(stringResource(R.string.task_unassigned)) }, onClick = { newTaskAssigneeId = ""; newTaskAssigneeMenu = false })
                                                        taskAssignees.forEach { member -> androidx.compose.material3.DropdownMenuItem(text = { Text(member.title) }, onClick = { newTaskAssigneeId = member.id; newTaskAssigneeMenu = false }) }
                                                    }
                                                }
                                                Button(enabled = newTaskTitle.isNotBlank() && !morePageLoading, onClick = {
                                                    scope.launch {
                                                        morePageLoading = true
                                                        runCatching {
                                                            val token = session.accessToken() ?: error("No access token")
                                                            val dueAt = newTaskDueAt.takeIf { it > 0L }?.let { java.time.Instant.ofEpochMilli(it).toString() }
                                                            withContext(Dispatchers.IO) { api.createTask(selectedGroup!!.id, newTaskTitle.trim(), token, newTaskNotes.trim().ifBlank { null }, dueAt, newTaskAssigneeId.ifBlank { null }) }
                                                            val path = ApiEndpoints.destination("tasks", selectedGroup!!.id) ?: error("No task route")
                                                            val raw = withContext(Dispatchers.IO) { api.get(path, token) }
                                                            nativeDisplayRows(raw, "tasks")
                                                        }.onSuccess { morePageData = it; newTaskTitle = ""; newTaskNotes = ""; newTaskDueAt = 0L; newTaskAssigneeId = "" }
                                                            .onFailure { error = "request" }
                                                        morePageLoading = false
                                                    }
                                                }) { Text(stringResource(R.string.task_create)) }
                                                if (morePageLoading) Text(stringResource(R.string.loading))
                                                LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                                    itemsIndexed(morePageData, key = { index, row -> "task-$index-${row.id}" }) { _, row ->
                                                        var editingTask by remember(row.id) { mutableStateOf(false) }
                                                        var editTaskTitle by remember(row.id) { mutableStateOf(row.title) }
                                                        var editTaskNotes by remember(row.id) { mutableStateOf(row.notes.orEmpty()) }
                                                        var editTaskDueAt by remember(row.id) { mutableStateOf(runCatching { java.time.Instant.parse(row.dueAt).toEpochMilli() }.getOrDefault(0L)) }
                                                        var editTaskAssigneeId by remember(row.id) { mutableStateOf(row.assigneeUserId.orEmpty()) }
                                                        var editTaskAssigneeMenu by remember(row.id) { mutableStateOf(false) }
                                                        var confirmDeleteTask by remember(row.id) { mutableStateOf(false) }
                                                        Card(Modifier.fillMaxWidth(), shape = RoundedCornerShape(16.dp)) {
                                                            Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                                                if (editingTask) {
                                                                    OutlinedTextField(editTaskTitle, { editTaskTitle = it }, label = { Text(stringResource(R.string.task_new_title)) }, modifier = Modifier.fillMaxWidth())
                                                                    OutlinedTextField(editTaskNotes, { editTaskNotes = it }, label = { Text(stringResource(R.string.task_notes)) }, modifier = Modifier.fillMaxWidth(), minLines = 2)
                                                                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                                                        OutlinedButton(onClick = {
                                                                            val calendar = java.util.Calendar.getInstance().apply { timeInMillis = if (editTaskDueAt == 0L) System.currentTimeMillis() else editTaskDueAt }
                                                                            android.app.DatePickerDialog(context, { _, year, month, day ->
                                                                                val chosen = java.util.Calendar.getInstance().apply { timeInMillis = if (editTaskDueAt == 0L) System.currentTimeMillis() else editTaskDueAt; set(java.util.Calendar.YEAR, year); set(java.util.Calendar.MONTH, month); set(java.util.Calendar.DAY_OF_MONTH, day) }
                                                                                android.app.TimePickerDialog(context, { _, hour, minute -> chosen.set(java.util.Calendar.HOUR_OF_DAY, hour); chosen.set(java.util.Calendar.MINUTE, minute); editTaskDueAt = chosen.timeInMillis }, chosen.get(java.util.Calendar.HOUR_OF_DAY), chosen.get(java.util.Calendar.MINUTE), false).show()
                                                                            }, calendar.get(java.util.Calendar.YEAR), calendar.get(java.util.Calendar.MONTH), calendar.get(java.util.Calendar.DAY_OF_MONTH)).show()
                                                                        }) { Text(if (editTaskDueAt == 0L) stringResource(R.string.task_due_date) else java.text.DateFormat.getDateTimeInstance().format(java.util.Date(editTaskDueAt))) }
                                                                        if (editTaskDueAt != 0L) OutlinedButton(onClick = { editTaskDueAt = 0L }) { Text(stringResource(R.string.task_clear_due_date)) }
                                                                    }
                                                                    Box {
                                                                        OutlinedButton(onClick = { editTaskAssigneeMenu = true }) { Text(taskAssignees.firstOrNull { it.id == editTaskAssigneeId }?.title ?: stringResource(R.string.task_assignee)) }
                                                                        androidx.compose.material3.DropdownMenu(expanded = editTaskAssigneeMenu, onDismissRequest = { editTaskAssigneeMenu = false }) {
                                                                            androidx.compose.material3.DropdownMenuItem(text = { Text(stringResource(R.string.task_unassigned)) }, onClick = { editTaskAssigneeId = ""; editTaskAssigneeMenu = false })
                                                                            taskAssignees.forEach { member -> androidx.compose.material3.DropdownMenuItem(text = { Text(member.title) }, onClick = { editTaskAssigneeId = member.id; editTaskAssigneeMenu = false }) }
                                                                        }
                                                                    }
                                                                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                                                        Button(enabled = editTaskTitle.isNotBlank() && row.version != null, onClick = {
                                                                            scope.launch {
                                                                                runCatching {
                                                                                    val token = session.accessToken() ?: error("No access token")
                                                                                    val dueAt = editTaskDueAt.takeIf { it > 0L }?.let { java.time.Instant.ofEpochMilli(it).toString() }
                                                                                    withContext(Dispatchers.IO) { api.patchJson(ApiEndpoints.task(selectedGroup!!.id, row.id), JSONObject().put("title", editTaskTitle.trim()).put("notes", editTaskNotes.trim().ifBlank { JSONObject.NULL }).put("dueAt", dueAt ?: JSONObject.NULL).put("assigneeUserId", editTaskAssigneeId.ifBlank { JSONObject.NULL }).put("expectedVersion", row.version), token) }
                                                                                    nativeDisplayRows(withContext(Dispatchers.IO) { api.get(ApiEndpoints.tasks(selectedGroup!!.id), token) }, "tasks")
                                                                                }.onSuccess { morePageData = it; editingTask = false }
                                                                                    .onFailure { error = "request" }
                                                                            }
                                                                        }) { Text(stringResource(R.string.more_save)) }
                                                                        OutlinedButton(onClick = { editingTask = false }) { Text(stringResource(R.string.people_cancel)) }
                                                                    }
                                                                } else {
                                                                    Text(row.title, style = MaterialTheme.typography.titleSmall)
                                                                    if (row.detail.isNotBlank()) Text(row.detail, style = MaterialTheme.typography.bodyMedium)
                                                                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                                                        if (row.version != null) OutlinedButton(onClick = { editingTask = true }) { Text(stringResource(R.string.task_edit)) }
                                                                        if (row.status != null && row.version != null) OutlinedButton(onClick = {
                                                                            val next = when (row.status) { "open" -> "in_progress"; "in_progress" -> "done"; else -> "open" }
                                                                            scope.launch {
                                                                                runCatching { val token = session.accessToken() ?: error("No access token"); withContext(Dispatchers.IO) { api.updateTaskStatus(selectedGroup!!.id, row.id, next, row.version, token) }; nativeDisplayRows(withContext(Dispatchers.IO) { api.get(ApiEndpoints.tasks(selectedGroup!!.id), token) }, "tasks") }
                                                                                    .onSuccess { morePageData = it }
                                                                                    .onFailure { error = "request" }
                                                                            }
                                                                        }) { Text(stringResource(R.string.more_advance_task)) }
                                                                        if (row.version != null) OutlinedButton(onClick = { confirmDeleteTask = true }) { Text(stringResource(R.string.task_delete)) }
                                                                        if (confirmDeleteTask) AlertDialog(
                                                                            onDismissRequest = { confirmDeleteTask = false },
                                                                            title = { Text(stringResource(R.string.task_confirm_delete)) },
                                                                            confirmButton = {
                                                                                Button(onClick = {
                                                                                    confirmDeleteTask = false
                                                                                    scope.launch {
                                                                                        runCatching { val token = session.accessToken() ?: error("No access token"); withContext(Dispatchers.IO) { api.delete(ApiEndpoints.task(selectedGroup!!.id, row.id), token) }; nativeDisplayRows(withContext(Dispatchers.IO) { api.get(ApiEndpoints.tasks(selectedGroup!!.id), token) }, "tasks") }
                                                                                            .onSuccess { morePageData = it }
                                                                                            .onFailure { error = "request" }
                                                                                    }
                                                                                }) { Text(stringResource(R.string.task_delete)) }
                                                                            },
                                                                            dismissButton = { OutlinedButton(onClick = { confirmDeleteTask = false }) { Text(stringResource(R.string.people_cancel)) } },
                                                                        )
                                                                    }
                                                                }
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                            morePageLoading -> Text(stringResource(R.string.loading), Modifier.padding(top = 16.dp))
                                            morePageData.isEmpty() -> Text(stringResource(R.string.more_empty), Modifier.padding(top = 16.dp))
                                            else -> LazyColumn(Modifier.padding(top = 10.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                                itemsIndexed(morePageData, key = { index, row -> "$page-$index-${row.id}" }) { _, row ->
                                                    Card(
                                                        Modifier.fillMaxWidth(),
                                                        shape = RoundedCornerShape(16.dp),
                                                        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
                                                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                                                    ) {
                                                        Column(Modifier.fillMaxWidth().padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                                            if (page == "notifications") Text(stringResource(nativeNotificationTitle(row.title)), style = MaterialTheme.typography.titleSmall)
                                                            else Text(row.title, style = MaterialTheme.typography.titleSmall)
                                                            if (row.detail.isNotBlank()) Text(row.detail, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                                            if (page == "resources") row.url?.let { rawUrl ->
                                                                val resourceUrl = runCatching { Uri.parse(rawUrl) }.getOrNull()
                                                                if (resourceUrl != null && resourceUrl.scheme in setOf("https", "http")) {
                                                                    OutlinedButton(onClick = { context.startActivity(Intent(Intent.ACTION_VIEW, resourceUrl)) }) { Text(stringResource(R.string.resource_open_link)) }
                                                                }
                                                            }
                                                            if (page == "notifications" && row.status == "unread") OutlinedButton(onClick = {
                                                                scope.launch {
                                                                    runCatching { val token = session.accessToken() ?: error("No access token"); withContext(Dispatchers.IO) { api.markNotificationRead(row.id, token) } }
                                                                        .onSuccess { moreReloadKey++ }
                                                                        .onFailure { error = "request" }
                                                                }
                                                            }) { Text(stringResource(R.string.more_mark_read)) }
                                                            if (page == "reports" && row.id == "responses-members") OutlinedButton(onClick = {
                                                                scope.launch {
                                                                    runCatching {
                                                                        val token = session.accessToken() ?: error("No access token")
                                                                        val now = java.time.Instant.now()
                                                                        val future = now.plus(180, java.time.temporal.ChronoUnit.DAYS)
                                                                        val csv = withContext(Dispatchers.IO) { api.get(ApiEndpoints.eventResponseReportCsv(selectedGroup!!.id, now.toString(), future.toString()), token) }
                                                                        val share = Intent(Intent.ACTION_SEND).apply {
                                                                            type = "text/csv"
                                                                            putExtra(Intent.EXTRA_TEXT, csv)
                                                                        }
                                                                        context.startActivity(Intent.createChooser(share, context.getString(R.string.report_export_csv)))
                                                                    }.onFailure { error = "request" }
                                                                }
                                                            }) { Text(stringResource(R.string.report_export_csv)) }
                                                            if (page == "tasks" && row.status != null && row.version != null) OutlinedButton(onClick = {
                                                                val next = when (row.status) { "open" -> "in_progress"; "in_progress" -> "done"; else -> "open" }
                                                                scope.launch {
                                                                    runCatching { val token = session.accessToken() ?: error("No access token"); withContext(Dispatchers.IO) { api.updateTaskStatus(selectedGroup!!.id, row.id, next, row.version, token) } }
                                                                        .onSuccess { moreReloadKey++ }
                                                                        .onFailure { error = "request" }
                                                                }
                                                            }) { Text(stringResource(R.string.more_advance_task)) }
                                                            if (page == "security" && row.status != "current") OutlinedButton(onClick = {
                                                                scope.launch {
                                                                    runCatching { val token = session.accessToken() ?: error("No access token"); withContext(Dispatchers.IO) { api.revokeSession(row.id, token) } }
                                                                        .onSuccess { moreReloadKey++ }
                                                                        .onFailure { error = "request" }
                                                                }
                                                            }) { Text(stringResource(R.string.more_revoke_session)) }
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                    if (error == "update") Text(stringResource(R.string.mobile_update_required, requiredVersion.orEmpty()))
                    else if (error != null) Text(stringResource(R.string.request_failed))
                }
            }
        }
        if (error == "update") {
            AlertDialog(
                onDismissRequest = {},
                title = { Text(stringResource(R.string.update_required_title)) },
                text = { Text(stringResource(R.string.mobile_update_required, requiredVersion.orEmpty())) },
                confirmButton = {
                    Button(
                        onClick = { storeUrl?.let { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(it))) } },
                        enabled = !storeUrl.isNullOrBlank(),
                    ) { Text(stringResource(R.string.update_now)) }
                },
            )
        }
    }
}

private data class NativeDestination(val id: String, val title: Int, val section: String)
private val brandingTextFieldKeys = listOf("accentColorHex", "successHex", "warningHex", "errorHex", "typography", "themeDefault", "defaultLocale", "welcomeText", "loginHeadline", "tagline", "verse")
private val brandingAppearanceFieldKeys = listOf("themeId", "intensity", "gradientStyle", "coverKind", "coverValue")
private data class BrandingSelector(val key: String, val label: Int, val options: List<Pair<String, Int>>)
private val brandingSelectorOptions = listOf(
    BrandingSelector("themeId", R.string.branding_theme, listOf("sonivo" to R.string.branding_theme_sonivo, "emerald" to R.string.branding_theme_emerald, "ocean" to R.string.branding_theme_ocean, "indigo" to R.string.branding_theme_indigo, "violet" to R.string.branding_theme_violet, "fuchsia" to R.string.branding_theme_fuchsia, "crimson" to R.string.branding_theme_crimson, "amber" to R.string.branding_theme_amber, "turquoise" to R.string.branding_theme_turquoise, "graphite" to R.string.branding_theme_graphite)),
    BrandingSelector("intensity", R.string.branding_intensity, listOf("subtle" to R.string.branding_intensity_subtle, "medium" to R.string.branding_intensity_medium, "intense" to R.string.branding_intensity_intense)),
    BrandingSelector("gradientStyle", R.string.branding_gradient_style, listOf("fixed" to R.string.branding_gradient_fixed, "liquid" to R.string.branding_gradient_liquid)),
    BrandingSelector("cover", R.string.branding_cover, listOf("" to R.string.branding_cover_none, "preset:soundwave" to R.string.branding_cover_preset_soundwave, "preset:stage" to R.string.branding_cover_preset_stage, "preset:vinyl" to R.string.branding_cover_preset_vinyl, "preset:choir" to R.string.branding_cover_preset_choir, "gradient:violet" to R.string.branding_cover_gradient_violet, "gradient:ocean" to R.string.branding_cover_gradient_ocean, "gradient:forest" to R.string.branding_cover_gradient_forest, "gradient:sunset" to R.string.branding_cover_gradient_sunset)),
)
private val brandingThemeColors = mapOf(
    "sonivo" to ("#8366F1" to "#E8C4F6"), "emerald" to ("#047857" to "#0E7490"), "ocean" to ("#0369A1" to "#4338CA"),
    "indigo" to ("#4338CA" to "#BE185D"), "violet" to ("#7C3AED" to "#0369A1"), "fuchsia" to ("#BE185D" to "#7C3AED"),
    "crimson" to ("#B91C1C" to "#B45309"), "amber" to ("#B45309" to "#047857"), "turquoise" to ("#0F766E" to "#0369A1"),
    "graphite" to ("#1F2937" to "#64748B"),
)
private fun brandingDefaultChoice(key: String): String = when (key) {
    "themeId" -> "sonivo"
    "intensity" -> "medium"
    "gradientStyle" -> "fixed"
    else -> ""
}

private fun brandingTextFieldLabel(key: String): Int = when (key) {
    "accentColorHex" -> R.string.branding_accent_color
    "successHex" -> R.string.branding_success_color
    "warningHex" -> R.string.branding_warning_color
    "errorHex" -> R.string.branding_error_color
    "typography" -> R.string.branding_typography
    "themeDefault" -> R.string.branding_default_theme
    "defaultLocale" -> R.string.branding_default_locale
    "welcomeText" -> R.string.branding_welcome_text
    "loginHeadline" -> R.string.branding_login_headline
    "tagline" -> R.string.branding_tagline
    else -> R.string.branding_verse
}

private data class NativeDataItem(val id: String, val title: String, val detail: String, val status: String?, val version: Int?, val enabled: Boolean? = null, val notes: String? = null, val type: String? = null, val startsAt: String? = null, val url: String? = null, val isSystem: Boolean? = null, val groupRoleId: String? = null, val dueAt: String? = null, val assigneeUserId: String? = null, val arrangementId: String? = null, val kind: String? = null, val originalFileName: String? = null, val attribution: String? = null, val rightsNotes: String? = null, val tags: List<String> = emptyList(), val part: String? = null, val groupId: String? = null, val groupName: String? = null)

private fun planNameResource(planId: String): Int = when (planId.lowercase()) {
    "starter" -> R.string.plans_name_starter
    "pro" -> R.string.plans_name_pro
    "studio" -> R.string.plans_name_studio
    else -> R.string.plans_name_unknown
}

private fun nativePlanUsageRows(context: Context, raw: String): List<NativeDataItem> = runCatching {
    val root = JSONObject(raw)
    buildList {
        val planId = root.optString("planId", "unknown")
        add(NativeDataItem("planId", context.getString(R.string.plans_current), context.getString(planNameResource(planId)), null, null))
        val metrics = listOf(
            "members" to R.string.plans_members,
            "songs" to R.string.plans_songs,
            "setlists" to R.string.plans_setlists,
            "eventsThisMonth" to R.string.plans_events,
            "storageBytes" to R.string.plans_storage,
        )
        for ((key, label) in metrics) {
            val metric = root.optJSONObject(key) ?: continue
            val used = metric.optLong("used")
            val limit = if (metric.isNull("limit")) context.getString(R.string.plans_unlimited) else metric.optLong("limit").toString()
            val displayUsed = if (key == "storageBytes") android.text.format.Formatter.formatShortFileSize(context, used) else used.toString()
            val displayLimit = if (key == "storageBytes" && !metric.isNull("limit")) android.text.format.Formatter.formatShortFileSize(context, metric.optLong("limit")) else limit
            add(NativeDataItem(key, context.getString(label), "$displayUsed / $displayLimit", null, null))
        }
        add(NativeDataItem("billingStatus", context.getString(R.string.plans_billing_state), root.optString("billingStatus"), null, null))
        root.optString("trialEndsAt").takeIf(String::isNotBlank)?.let { add(NativeDataItem("trialEndsAt", context.getString(R.string.plans_trial_ends), it, null, null)) }
        root.optString("scheduledPlanId").takeIf(String::isNotBlank)?.let { add(NativeDataItem("scheduledPlanId", context.getString(R.string.plans_scheduled_plan), context.getString(planNameResource(it)), null, null)) }
    }
}.getOrDefault(emptyList())

private fun nativeCalendarRows(context: Context, raw: String): List<NativeDataItem> = runCatching {
    val events = JSONArray(raw)
    (0 until events.length()).mapNotNull { index ->
        val event = events.optJSONObject(index) ?: return@mapNotNull null
        val eventId = event.optString("eventId").takeIf(String::isNotBlank) ?: return@mapNotNull null
        val startsAt = event.optString("startsAt").takeIf(String::isNotBlank) ?: return@mapNotNull null
        val groupId = event.optString("groupId").takeIf(String::isNotBlank) ?: return@mapNotNull null
        val groupName = event.optString("groupName")
        val date = runCatching { java.time.Instant.parse(startsAt).atZone(java.time.ZoneId.systemDefault()).format(java.time.format.DateTimeFormatter.ofLocalizedDateTime(java.time.format.FormatStyle.MEDIUM)) }.getOrDefault(startsAt)
        NativeDataItem(eventId, event.optString("title"), date, event.optString("myResponse").takeIf(String::isNotBlank), null, type = event.optString("type"), startsAt = startsAt, groupId = groupId, groupName = groupName)
    }
}.getOrDefault(emptyList())

private fun nativeNotificationTitle(kind: String): Int = when (kind) {
    "role_changed" -> R.string.notification_role_changed
    "invitation_created" -> R.string.notification_invitation_created
    "event_created" -> R.string.notification_event_created
    "task_assigned" -> R.string.notification_task_assigned
    "password_changed" -> R.string.notification_password_changed
    "passkey_added" -> R.string.notification_passkey_added
    "passkey_removed" -> R.string.notification_passkey_removed
    else -> R.string.notification_generic
}

private fun nativeRoleResource(role: String): Int = when (role) {
    "Owner" -> R.string.people_role_owner
    "Manager" -> R.string.people_role_manager
    "Member" -> R.string.people_role_member
    "Viewer" -> R.string.people_role_viewer
    else -> R.string.people_change_role
}

private fun resourcePurposeLabel(purpose: String): Int = when (purpose) {
    "chart" -> R.string.resource_purpose_chart
    "lyrics" -> R.string.resource_purpose_lyrics
    "audio" -> R.string.resource_purpose_audio
    "click" -> R.string.resource_purpose_click
    "practice" -> R.string.resource_purpose_practice
    "reference" -> R.string.resource_purpose_reference
    else -> R.string.resource_purpose_other
}

private val nativeDestinations = listOf(
    NativeDestination("home", R.string.destination_home, "account"),
    NativeDestination("groups", R.string.destination_groups, "account"),
    NativeDestination("join", R.string.destination_join, "account"),
    NativeDestination("profile", R.string.destination_profile, "account"),
    NativeDestination("notifications", R.string.destination_notifications, "account"),
    NativeDestination("preferences", R.string.destination_preferences, "account"),
    NativeDestination("membership", R.string.destination_membership, "account"),
    NativeDestination("plans", R.string.destination_plans, "account"),
    NativeDestination("calendar", R.string.destination_calendar, "account"),
    NativeDestination("help", R.string.destination_help, "account"),
    NativeDestination("groupHelp", R.string.destination_help, "group"),
    NativeDestination("security", R.string.destination_security, "account"),
    NativeDestination("songs", R.string.destination_songs, "group"),
    NativeDestination("setlists", R.string.destination_setlists, "group"),
    NativeDestination("groupCalendar", R.string.destination_group_calendar, "group"),
    NativeDestination("events", R.string.destination_events, "group"),
    NativeDestination("tasks", R.string.destination_tasks, "group"),
    NativeDestination("people", R.string.destination_people, "group"),
    NativeDestination("roles", R.string.destination_roles, "group"),
    NativeDestination("reports", R.string.destination_reports, "group"),
    NativeDestination("resources", R.string.destination_resources, "group"),
    NativeDestination("audit", R.string.destination_audit, "group"),
    NativeDestination("settings", R.string.destination_settings, "group"),
    NativeDestination("groupHome", R.string.destination_group_home, "group"),
)

private fun nativeReportRows(context: Context, reports: List<Pair<String, String>>): List<NativeDataItem> = buildList {
    val metricLabels = mapOf(
        "songs" to R.string.report_songs, "arrangements" to R.string.report_arrangements,
        "files" to R.string.report_files, "links" to R.string.report_links,
        "members" to R.string.report_members, "total" to R.string.report_total,
        "open" to R.string.report_open, "inProgress" to R.string.report_in_progress,
        "done" to R.string.report_done, "unassigned" to R.string.report_unassigned,
        "overdue" to R.string.report_overdue, "setlists" to R.string.report_setlists,
        "arrangementReferences" to R.string.report_arrangement_references,
        "yes" to R.string.report_yes, "no" to R.string.report_no,
        "maybe" to R.string.report_maybe, "noResponse" to R.string.report_no_response,
        "responses" to R.string.report_responses,
    )
    reports.forEach { (section, raw) ->
        val root = runCatching { JSONObject(raw) }.getOrNull() ?: return@forEach
        fun addMetric(key: String) {
            if (!root.has(key) || root.isNull(key)) return
            val label = metricLabels[key]?.let(context::getString) ?: key
            add(NativeDataItem("$section-$key", label, root.opt(key).toString(), null, null))
        }
        when (section) {
            "repertoire" -> listOf("songs", "arrangements", "files", "links").forEach(::addMetric)
            "responses" -> {
                addMetric("members")
                val events = root.optJSONArray("events") ?: JSONArray()
                for (index in 0 until events.length()) {
                    val event = events.optJSONObject(index) ?: continue
                    val title = event.optString("title").ifBlank { context.getString(R.string.report_event) }
                    val details = listOf("startsAt", "yes", "no", "maybe", "noResponse").mapNotNull { key ->
                        if (event.has(key) && !event.isNull(key)) "${context.getString(metricLabels[key] ?: R.string.report_responses)}: ${event.opt(key)}" else null
                    }.joinToString(" · ")
                    add(NativeDataItem("responses-event-${event.optString("eventId", index.toString())}", title, details, null, null))
                }
            }
            "tasks" -> {
                listOf("total", "open", "inProgress", "done", "unassigned", "overdue").forEach(::addMetric)
                val assignees = root.optJSONArray("byAssignee") ?: JSONArray()
                for (index in 0 until assignees.length()) {
                    val item = assignees.optJSONObject(index) ?: continue
                    add(NativeDataItem("tasks-assignee-$index", item.optString("displayName"), "${context.getString(R.string.report_total)}: ${item.optInt("count")}", null, null))
                }
            }
            "setlists" -> listOf("setlists", "arrangementReferences").forEach(::addMetric)
        }
    }
}.take(100)

@Composable
private fun DestinationCard(destination: NativeDestination, onClick: () -> Unit) {
    Card(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
    ) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(stringResource(destination.title), Modifier.weight(1f), style = MaterialTheme.typography.titleSmall)
            Text("›", color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.titleLarge)
        }
    }
}

private fun nativeDisplayRows(raw: String, page: String): List<NativeDataItem> {
    val preferredTitle = if (page == "notifications") listOf("kind", "title", "name") else listOf("title", "name", "displayName", "label", "songTitle", "planId")
    val preferredDetail = if (page == "notifications") listOf("createdAt") else (if (page == "people") emptyList() else listOf("role")) + listOf("originKind", "attribution", "purpose", "arrangementLabel", "songTitle", "response", "status", "type", "startsAt", "dueAt", "createdAt", "lastSeenAt", "expiresAt", "description", "permissions", "notes", "email", "itemCount")
    fun row(value: JSONObject, fallback: String): NativeDataItem {
        val title = preferredTitle.firstNotNullOfOrNull { key -> value.optString(key).takeIf { it.isNotBlank() && it != "null" } } ?: fallback
        val detail = preferredDetail.mapNotNull { key -> value.optString(key).takeIf { it.isNotBlank() && it != "null" } }.distinct().take(2).joinToString(" · ")
        val status = when {
            page == "notifications" -> if (value.isNull("readAt")) "unread" else "read"
            page == "security" -> if (value.optBoolean("isCurrent")) "current" else "other"
            page == "people" -> value.optString("role").takeIf { it.isNotBlank() }
            else -> value.optString("status").takeIf { it.isNotBlank() && it != "null" }
        }
        val id = value.optString("id").takeIf { it.isNotBlank() && it != "null" }
            ?: value.optString("userId").takeIf { it.isNotBlank() && it != "null" }
            ?: value.optString("memberId").takeIf { it.isNotBlank() && it != "null" }
            ?: value.optString("sessionKey").takeIf { it.isNotBlank() && it != "null" } ?: fallback
        val version = value.optInt("version", -1).takeIf { it >= 0 }
        val enabled = if (page == "people" && value.has("accessEnabled")) value.optBoolean("accessEnabled") else null
        val tags = value.optJSONArray("tags")?.let { array -> (0 until array.length()).mapNotNull { array.optString(it).takeIf(String::isNotBlank) } }.orEmpty()
        val resourceNote = value.optString("note").ifBlank { value.optString("notes") }
        return NativeDataItem(id, title, detail, status, version, enabled, resourceNote.takeIf { it.isNotBlank() && it != "null" }, value.optString("type").ifBlank { value.optString("originKind") }.takeIf { it.isNotBlank() && it != "null" }, value.optString("startsAt").takeIf { it.isNotBlank() && it != "null" }, value.optString("url").takeIf { it.isNotBlank() && it != "null" }, if (value.has("isSystem")) value.optBoolean("isSystem") else null, value.optString("groupRoleId").takeIf { it.isNotBlank() && it != "null" }, value.optString("dueAt").takeIf { it.isNotBlank() && it != "null" }, value.optString("assigneeUserId").takeIf { it.isNotBlank() && it != "null" }, value.optString("arrangementId").takeIf { it.isNotBlank() && it != "null" }, value.optString("kind").takeIf { it.isNotBlank() && it != "null" }, value.optString("originalFileName").takeIf { it.isNotBlank() && it != "null" }, value.optString("attribution").takeIf { it.isNotBlank() && it != "null" }, value.optString("rightsNotes").takeIf { it.isNotBlank() && it != "null" }, tags, value.optString("part").takeIf { it.isNotBlank() && it != "null" })
    }
    return runCatching {
        when (val value = raw.trim().let { if (it.startsWith("[")) JSONArray(it) else JSONObject(it) }) {
            is JSONArray -> (0 until value.length()).mapNotNull { index ->
                val item = value.optJSONObject(index) ?: return@mapNotNull null
                row(item, "${index + 1}")
            }
            is JSONObject -> {
                val entries = value.keys().asSequence().mapNotNull { key ->
                    val nested = value.optJSONArray(key) ?: return@mapNotNull null
                    (0 until nested.length()).mapNotNull { index -> nested.optJSONObject(index)?.let { row(it, key) } }
                }.flatten().toList()
                if (entries.isNotEmpty()) entries else value.keys().asSequence().map { key -> NativeDataItem(key, key, value.optString(key), null, null) }.filter { it.detail.isNotBlank() }.toList()
            }
            else -> emptyList()
        }.take(100)
    }.getOrDefault(emptyList())
}

private fun timedPracticeLines(source: String, timingJson: String?): List<PracticeChartLine> {
    val positions = runCatching {
        val marks = JSONArray(timingJson.orEmpty())
        buildMap {
            for (index in 0 until marks.length()) {
                val mark = marks.optJSONObject(index) ?: continue
                val lineIndex = mark.optInt("lineIndex", -1)
                val atMs = mark.optLong("atMs", -1L)
                if (lineIndex >= 0 && atMs >= 0L) put(lineIndex, atMs)
            }
        }
    }.getOrDefault(emptyMap())
    return source.replace("\r\n", "\n").replace('\r', '\n')
        .split('\n')
        .mapIndexed { index, line -> PracticeChartLine(line, positions[index]) }
}
