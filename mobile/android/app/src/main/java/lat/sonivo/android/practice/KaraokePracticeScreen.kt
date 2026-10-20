package lat.sonivo.android.practice

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import lat.sonivo.android.R
import lat.sonivo.android.LucideIcon

@Composable
fun KaraokePracticeScreen(
    groupName: String,
    title: String,
    lines: List<PracticeChartLine>,
    positionMs: Long,
    durationMs: Long,
    playing: Boolean,
    showChords: Boolean,
    onToggleChords: () -> Unit,
    onTogglePlayback: () -> Unit,
    onSeek: (Long) -> Unit,
    onClose: () -> Unit,
) {
    val duration = durationMs.coerceAtLeast(0L)
    val position = positionMs.coerceIn(0L, duration.takeIf { it > 0 } ?: Long.MAX_VALUE)
    val seekLabel = stringResource(R.string.practice_seek)
    Surface(
        modifier = Modifier.fillMaxSize(),
        color = Color(0xFF09090D),
        contentColor = Color.White,
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .background(Brush.verticalGradient(listOf(Color(0xFF242038), Color(0xFF111116), Color(0xFF08080B))))
                .padding(horizontal = 20.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(groupName, style = MaterialTheme.typography.labelLarge, color = Color.White.copy(alpha = 0.68f), maxLines = 1)
                    Text(title, style = MaterialTheme.typography.titleLarge, color = Color.White, maxLines = 1)
                    Text(stringResource(R.string.practice_karaoke), style = MaterialTheme.typography.labelMedium, color = Color(0xFFB9A7FF))
                }
                androidx.compose.material3.IconButton(onClick = onToggleChords) {
                    LucideIcon(if (showChords) "eye" else "eyeOff", Color.White, size = 22.dp, label = stringResource(if (showChords) R.string.practice_hide_chords else R.string.practice_show_chords))
                }
                androidx.compose.material3.IconButton(onClick = onClose) {
                    LucideIcon("close", Color.White, size = 22.dp, label = stringResource(R.string.practice_close_karaoke))
                }
            }
            if (lines.none { it.startPositionMs != null }) {
                Text(
                    stringResource(R.string.practice_karaoke_no_timing),
                    style = MaterialTheme.typography.bodySmall,
                    color = Color.White.copy(alpha = 0.62f),
                )
            }
            PracticeChart(
                lines = lines,
                positionMs = position,
                showChords = showChords,
                karaoke = true,
            )
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                if (duration > 0L) {
                    Slider(
                        value = position.toFloat().coerceIn(0f, duration.toFloat()),
                        onValueChange = { onSeek(it.toLong()) },
                        valueRange = 0f..duration.toFloat(),
                        modifier = Modifier.fillMaxWidth().semantics {
                            contentDescription = seekLabel
                        },
                    )
                }
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Text(formatPracticeTime(position), style = MaterialTheme.typography.labelMedium, color = Color.White.copy(alpha = 0.68f))
                    Surface(onClick = onTogglePlayback, shape = CircleShape, color = Color.White) {
                        LucideIcon(if (playing) "pause" else "play", Color(0xFF17131F), Modifier.padding(12.dp), size = 24.dp, label = stringResource(if (playing) R.string.practice_pause else R.string.practice_play))
                    }
                    Text(formatPracticeTime(duration), style = MaterialTheme.typography.labelMedium, color = Color.White.copy(alpha = 0.68f))
                }
            }
        }
    }
}

private fun formatPracticeTime(positionMs: Long): String {
    val seconds = positionMs.coerceAtLeast(0L) / 1000L
    return "${seconds / 60}:${(seconds % 60).toString().padStart(2, '0')}"
}
