package lat.sonivo.android.practice

import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.FilledIconButton
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.getValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.blur
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.interaction.DragInteraction
import kotlinx.coroutines.flow.collect
import kotlin.math.abs
import lat.sonivo.android.LucideIcon
import lat.sonivo.android.R

@Composable
fun KaraokePracticeScreen(
    groupName: String,
    title: String,
    lines: List<PracticeChartLine>,
    instrumentals: List<PracticeInstrumentalInterval> = emptyList(),
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
    val activeLines = activePracticeLineIndexes(lines, position)
    val activeIndex = activeLines.firstOrNull { !isBackingLine(lines[it]) } ?: activeLines.firstOrNull()
        ?: lines.indices.filter { lines[it].startPositionMs?.let { start -> start <= position } == true }
            .maxByOrNull { lines[it].startPositionMs ?: Long.MIN_VALUE }
    val hasTiming = lines.any { it.startPositionMs != null || it.words.isNotEmpty() } || instrumentals.isNotEmpty()
    val listState = rememberLazyListState()
    var autoFollow by remember { mutableStateOf(true) }
    var manualFocusIndex by remember { mutableIntStateOf(0) }
    val focusedIndex = if (autoFollow) activeIndex ?: 0 else manualFocusIndex.coerceIn(0, (lines.size - 1).coerceAtLeast(0))
    LaunchedEffect(listState) {
        listState.interactionSource.interactions.collect { interaction ->
            if (interaction is DragInteraction.Start) autoFollow = false
        }
    }
    LaunchedEffect(autoFollow, activeIndex, hasTiming) {
        if (autoFollow && hasTiming && activeIndex != null) {
            listState.animateScrollToItem(activeIndex, scrollOffset = -(listState.layoutInfo.viewportSize.height / 3))
        }
    }
    LaunchedEffect(autoFollow, listState) {
        if (!autoFollow) {
            snapshotFlow {
                val info = listState.layoutInfo
                val center = (info.viewportStartOffset + info.viewportEndOffset) / 2
                info.visibleItemsInfo.minByOrNull { item -> abs(item.offset + item.size / 2 - center) }?.index
            }.collect { index -> if (index != null) manualFocusIndex = index }
        }
    }
    val firstLyricMs = lines.flatMap { line ->
        listOfNotNull(line.startPositionMs) + line.words.map { it.startPositionMs }
    }.minOrNull()
    val activeInstrumental = instrumentals.firstOrNull { position >= it.startPositionMs && position < it.endPositionMs }
        ?: firstLyricMs?.takeIf { it >= 2_000L && position < it }?.let { PracticeInstrumentalInterval(0L, it) }
    val instrumentalProgress = activeInstrumental?.let {
        ((position - it.startPositionMs).toFloat() / (it.endPositionMs - it.startPositionMs)).coerceIn(0f, 1f)
    } ?: 0f
    val accent = MaterialTheme.colorScheme.primary
    val seekLabel = stringResource(R.string.practice_seek)
    val followLabel = stringResource(if (autoFollow) R.string.practice_following_lyrics else R.string.practice_follow_lyrics)
    Surface(modifier = Modifier.fillMaxSize(), color = Color(0xFF0A0910), contentColor = Color.White) {
        Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(Color(0xFF30264C), Color(0xFF17141F), Color(0xFF09090D))))) {
            Column(Modifier.fillMaxSize().padding(horizontal = 22.dp, vertical = 12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    IconButton(onClick = onClose, modifier = Modifier.size(48.dp)) {
                        LucideIcon("chevronDown", Color.White, size = 23.dp, label = stringResource(R.string.practice_close_karaoke))
                    }
                    Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(groupName, style = MaterialTheme.typography.labelMedium, color = Color.White.copy(alpha = .68f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text(title, style = MaterialTheme.typography.titleMedium, color = Color.White, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                    IconButton(onClick = onToggleChords, modifier = Modifier.size(48.dp)) {
                        LucideIcon(if (showChords) "eye" else "eyeOff", accent, size = 21.dp, label = stringResource(if (showChords) R.string.practice_hide_chords else R.string.practice_show_chords))
                    }
                    if (hasTiming) {
                        IconButton(
                            onClick = { autoFollow = true },
                            enabled = !autoFollow,
                            modifier = Modifier.size(48.dp).semantics {
                                contentDescription = followLabel
                            },
                        ) {
                            LucideIcon(if (autoFollow) "audioLines" else "locateFixed", accent, size = 21.dp, label = followLabel)
                        }
                    }
                }

                if (!hasTiming) {
                    Text(stringResource(R.string.practice_karaoke_no_timing), style = MaterialTheme.typography.bodySmall, color = Color.White.copy(alpha = .62f), textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
                }
                if (activeInstrumental != null) {
                    Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.Center) {
                        Box(Modifier.width(24.dp).height(1.dp).background(accent.copy(alpha = .7f)))
                        Text(stringResource(R.string.practice_instrumental), style = MaterialTheme.typography.labelMedium, color = accent, modifier = Modifier.padding(horizontal = 10.dp))
                        Box(Modifier.width(24.dp).height(1.dp).background(accent.copy(alpha = .7f)))
                        }
                        LinearProgressIndicator(progress = { instrumentalProgress }, modifier = Modifier.fillMaxWidth(.58f), color = accent, trackColor = Color.White.copy(alpha = .14f))
                    }
                }
                LazyColumn(
                    state = listState,
                    modifier = Modifier.weight(1f).fillMaxWidth(),
                    verticalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterVertically),
                ) {
                    itemsIndexed(lines) { lineIndex, line ->
                        val active = autoFollow && (lineIndex in activeLines || lineIndex == focusedIndex && hasTiming)
                        val primary = lineIndex == focusedIndex
                        val focusItem = listState.layoutInfo.visibleItemsInfo.firstOrNull { it.index == focusedIndex }
                        val rowItem = listState.layoutInfo.visibleItemsInfo.firstOrNull { it.index == lineIndex }
                        val adjacentStep = listState.layoutInfo.visibleItemsInfo
                            .filter { abs(it.index - focusedIndex) == 1 }
                            .map { item -> abs(item.offset + item.size / 2 - (focusItem?.let { it.offset + it.size / 2 } ?: 0)) }
                            .filter { it > 0 }
                            .average()
                            .takeIf { it.isFinite() && it > 0.0 }
                            ?.toFloat()
                        val distance = if (focusItem != null && rowItem != null) {
                            val step = adjacentStep ?: focusItem.size.toFloat().coerceAtLeast(1f)
                            (rowItem.offset + rowItem.size / 2f - (focusItem.offset + focusItem.size / 2f)) / step
                        } else (lineIndex - focusedIndex).toFloat()
                        val blurRadius = if (active) 0f else (abs(distance) * 1.1f).coerceAtMost(2.5f)
                        val seekPosition = line.startPositionMs ?: line.words.minOfOrNull { it.startPositionMs }
                        val textColor by animateColorAsState(
                            if ((primary && (!hasTiming || !autoFollow)) || active) Color.White
                            else Color.White.copy(alpha = if (distance < 0) (0.96f - abs(distance) * .22f).coerceAtLeast(.24f) else (0.66f - abs(distance) * .18f).coerceAtLeast(.18f)),
                            label = "lyric-line",
                        )
                        Text(
                            text = androidx.compose.ui.text.buildAnnotatedString { appendPracticeLine(line, position, accent, showChords) },
                            style = MaterialTheme.typography.headlineMedium.copy(fontSize = when { primary -> 34.sp; active -> 27.sp; else -> 24.sp }, lineHeight = when { primary -> 42.sp; active -> 35.sp; else -> 31.sp }, fontWeight = if (primary || active) FontWeight.Bold else FontWeight.Medium),
                            color = textColor,
                            textAlign = TextAlign.Center,
                            modifier = Modifier
                                .blur(blurRadius.dp)
                                .fillMaxWidth()
                                .clip(MaterialTheme.shapes.large)
                                .background(if (active && primary) Color.White.copy(alpha = .09f) else Color.Transparent)
                                .clickable(enabled = seekPosition != null) { seekPosition?.let(onSeek) }
                                .padding(horizontal = 12.dp, vertical = if (active || primary) 9.dp else 5.dp),
                        )
                    }
                }

                Column(Modifier.fillMaxWidth().clip(MaterialTheme.shapes.extraLarge).background(Color.White.copy(alpha = .07f)).padding(horizontal = 18.dp, vertical = 14.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    if (duration > 0L) Slider(value = position.toFloat().coerceIn(0f, duration.toFloat()), onValueChange = { onSeek(it.toLong()) }, valueRange = 0f..duration.toFloat(), modifier = Modifier.fillMaxWidth().semantics { contentDescription = seekLabel })
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
                        Text(formatPracticeTime(position), style = MaterialTheme.typography.labelMedium, color = Color.White.copy(alpha = .66f))
                        FilledIconButton(onClick = onTogglePlayback, modifier = Modifier.size(64.dp), shape = CircleShape, colors = androidx.compose.material3.IconButtonDefaults.filledIconButtonColors(containerColor = accent, contentColor = Color(0xFF211735))) {
                            LucideIcon(if (playing) "pause" else "play", Color(0xFF211735), size = 27.dp, label = stringResource(if (playing) R.string.practice_pause else R.string.practice_play))
                        }
                        Text(formatPracticeTime(duration), style = MaterialTheme.typography.labelMedium, color = Color.White.copy(alpha = .66f))
                    }
                }
            }
        }
    }
}

private fun isBackingLine(line: PracticeChartLine): Boolean = isBackingPracticeLine(line)

private fun androidx.compose.ui.text.AnnotatedString.Builder.appendPracticeLine(line: PracticeChartLine, positionMs: Long, accent: Color, showChords: Boolean) {
    val marks = line.words.sortedBy { it.wordIndex }
    val wordIndex = intArrayOf(0)
    val pattern = Regex("\\[([^]]+)]")
    var cursor = 0
    pattern.findAll(line.text).forEach { match ->
        appendMarkedText(line.text.substring(cursor, match.range.first), marks, wordIndex, positionMs, accent)
        if (showChords) {
            pushStyle(androidx.compose.ui.text.SpanStyle(color = accent, fontWeight = FontWeight.Bold))
            append(match.groupValues[1])
            pop()
        }
        cursor = match.range.last + 1
    }
    appendMarkedText(line.text.substring(cursor), marks, wordIndex, positionMs, accent)
}

private fun androidx.compose.ui.text.AnnotatedString.Builder.appendMarkedText(text: String, marks: List<PracticeChartWord>, wordIndex: IntArray, positionMs: Long, accent: Color) {
    Regex("\\s+|\\S+").findAll(text).forEach { token ->
        val part = token.value
        if (part.isBlank()) append(part) else {
            val index = wordIndex[0]++
            val mark = marks.firstOrNull { it.wordIndex == index }
            val activeMark = mark?.takeIf { positionMs >= it.startPositionMs && positionMs < it.endPositionMs }
            val active = activeMark != null
            val progress = activeMark?.let { ((positionMs - it.startPositionMs).toFloat() / (it.endPositionMs - it.startPositionMs)).coerceIn(0f, 1f) } ?: 0f
            val fillStyle = if (active) {
                val edge = (progress + .025f).coerceAtMost(1f)
                androidx.compose.ui.text.SpanStyle(
                    brush = Brush.horizontalGradient(colorStops = arrayOf(0f to accent, progress to accent, edge to Color.White, 1f to Color.White)),
                    fontWeight = FontWeight.Bold,
                )
            } else {
                androidx.compose.ui.text.SpanStyle(
                    color = if (mark != null && positionMs >= mark.endPositionMs) accent.copy(alpha = .72f) else Color.White.copy(alpha = .58f),
                    fontWeight = FontWeight.Medium,
                )
            }
            pushStyle(fillStyle)
            append(part)
            pop()
        }
    }
}

private fun formatPracticeTime(positionMs: Long): String {
    val seconds = positionMs.coerceAtLeast(0L) / 1000L
    return "${seconds / 60}:${(seconds % 60).toString().padStart(2, '0')}"
}
