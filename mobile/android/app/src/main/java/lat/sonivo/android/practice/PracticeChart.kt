package lat.sonivo.android.practice

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.text.AnnotatedString
import lat.sonivo.android.R

data class PracticeChartWord(val wordIndex: Int, val startPositionMs: Long, val endPositionMs: Long)

data class PracticeInstrumentalInterval(val startPositionMs: Long, val endPositionMs: Long)

data class PracticeChartTimeline(
    val lines: List<PracticeChartLine>,
    val instrumentals: List<PracticeInstrumentalInterval> = emptyList(),
)

data class PracticeChartLine(
    val text: String,
    val startPositionMs: Long? = null,
    val words: List<PracticeChartWord> = emptyList(),
    val endPositionMs: Long? = null,
)

internal fun activePracticeLineIndexes(lines: List<PracticeChartLine>, positionMs: Long): Set<Int> {
    val active = linkedSetOf<Int>()
    val startedLines = lines.indices.filter { index -> lines[index].startPositionMs?.let { it <= positionMs } == true }
    val latestLineStart = startedLines.maxOfOrNull { lines[it].startPositionMs ?: Long.MIN_VALUE }
    startedLines.forEach { index ->
        val line = lines[index]
        val lineStart = line.startPositionMs ?: return@forEach
        if (line.endPositionMs != null) {
            if (positionMs < line.endPositionMs) active += index
        } else if (lineStart == latestLineStart) {
            active += index
        }
    }

    lines.forEachIndexed { index, line ->
        if (line.words.isEmpty()) return@forEachIndexed
        val explicitStart = line.startPositionMs ?: line.words.minOf { it.startPositionMs }
        if (positionMs < explicitStart) return@forEachIndexed
        if (line.endPositionMs != null) {
            if (positionMs < line.endPositionMs) active += index
            return@forEachIndexed
        }

        val lastWordEnd = line.words.maxOf { it.endPositionMs }
        if (positionMs < lastWordEnd) {
            active += index
            return@forEachIndexed
        }
        val nextOtherLineStart = lines.indices.asSequence()
            .filter { it != index }
            .mapNotNull { other -> lines[other].startPositionMs ?: lines[other].words.minOfOrNull { it.startPositionMs } }
            .filter { it >= lastWordEnd }
            .minOrNull()
        if (nextOtherLineStart != null && positionMs < nextOtherLineStart) active += index
    }
    return active
}

internal fun isBackingPracticeLine(line: PracticeChartLine): Boolean = line.text.trim().let { it.startsWith('(') && it.endsWith(')') && it.length > 2 }

@Composable
fun PracticeChart(
    lines: List<PracticeChartLine>,
    positionMs: Long,
    showChords: Boolean = true,
    karaoke: Boolean = false,
) {
    val activeLines = activePracticeLineIndexes(lines, positionMs)
    val activeIndex = activeLines.firstOrNull { !isBackingPracticeLine(lines[it]) } ?: activeLines.firstOrNull()
        ?: lines.indices.filter { lines[it].startPositionMs?.let { start -> start <= positionMs } == true }
            .maxByOrNull { lines[it].startPositionMs ?: Long.MIN_VALUE }
    val listState = rememberLazyListState()
    LaunchedEffect(activeIndex) {
        activeIndex?.let { listState.animateScrollToItem(it) }
    }

    if (lines.isEmpty()) {
        Text(stringResource(R.string.chart_empty), style = MaterialTheme.typography.bodyLarge)
        return
    }

    LazyColumn(state = listState) {
        itemsIndexed(lines) { index, line ->
            val active = index in activeLines || index == activeIndex
            Text(
                text = renderTimedLine(line, positionMs, MaterialTheme.colorScheme.primary, showChords, active),
                style = if (karaoke) MaterialTheme.typography.titleLarge.copy(fontSize = if (active) 34.sp else 30.sp) else MaterialTheme.typography.titleLarge,
                modifier = Modifier.fillMaxWidth()
                    .background(if (active && karaoke) Color.White.copy(alpha = 0.14f) else if (active) MaterialTheme.colorScheme.secondaryContainer else Color.Transparent)
                    .padding(horizontal = 16.dp, vertical = 14.dp)
                    .semantics { selected = active },
                color = when {
                    karaoke && active -> Color.White
                    karaoke && line.words.isNotEmpty() -> Color.White.copy(alpha = 0.7f)
                    karaoke -> Color.White.copy(alpha = 0.7f)
                    active -> MaterialTheme.colorScheme.onSecondaryContainer
                    else -> MaterialTheme.colorScheme.onSurface
                },
            )
        }
    }
}

private fun renderTimedLine(line: PracticeChartLine, positionMs: Long, chordColor: Color, showChords: Boolean, focused: Boolean) = buildAnnotatedString {
    if (line.words.isEmpty()) {
        append(renderChordPro(line.text, chordColor, showChords))
        return@buildAnnotatedString
    }
    val wordIndex = intArrayOf(0)
    val marks = line.words
    val chordPattern = Regex("\\[([^]]+)]")
    var cursor = 0
    chordPattern.findAll(line.text).forEach { match ->
        appendTimedWords(line.text.substring(cursor, match.range.first), marks, positionMs, wordIndex, chordColor, focused)
        if (showChords) {
            pushStyle(SpanStyle(color = chordColor, fontWeight = FontWeight.Bold))
            append(match.groupValues[1])
            pop()
        }
        cursor = match.range.last + 1
    }
    appendTimedWords(line.text.substring(cursor), marks, positionMs, wordIndex, chordColor, focused)
}

private fun AnnotatedString.Builder.appendTimedWords(text: String, marks: List<PracticeChartWord>, positionMs: Long, wordIndex: IntArray, accent: Color, focused: Boolean) {
    Regex("\\s+|\\S+").findAll(text).forEach { match ->
        val part = match.value
        if (part.isBlank()) append(part) else {
            val mark = marks.firstOrNull { it.wordIndex == wordIndex[0]++ }
            val activeMark = mark?.takeIf { positionMs >= it.startPositionMs && positionMs < it.endPositionMs }
            val active = activeMark != null
            val progress = activeMark?.let { ((positionMs - it.startPositionMs).toFloat() / (it.endPositionMs - it.startPositionMs)).coerceIn(0f, 1f) } ?: 0f
            val fillColor = accent.copy(alpha = .68f + progress * .32f)
            val idleColor = if (focused) Color.White else Color.White.copy(alpha = .58f)
            pushStyle(SpanStyle(color = when { active -> fillColor; mark != null && positionMs >= mark.endPositionMs -> accent.copy(alpha = .72f); else -> idleColor }, fontWeight = if (active) FontWeight.Bold else FontWeight.Normal))
            append(part)
            pop()
        }
    }
}

private fun renderChordPro(source: String, chordColor: Color, showChords: Boolean) = buildAnnotatedString {
    val chordPattern = Regex("\\[([^]]+)]")
    var cursor = 0
    chordPattern.findAll(source).forEach { match ->
        append(source.substring(cursor, match.range.first))
        if (showChords) {
            pushStyle(SpanStyle(color = chordColor, fontWeight = FontWeight.Bold))
            append(match.groupValues[1])
            pop()
        }
        cursor = match.range.last + 1
    }
    append(source.substring(cursor))
}
