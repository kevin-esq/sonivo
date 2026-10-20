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
import lat.sonivo.android.R

data class PracticeChartLine(val text: String, val startPositionMs: Long? = null)

@Composable
fun PracticeChart(lines: List<PracticeChartLine>, positionMs: Long, showChords: Boolean = true, karaoke: Boolean = false) {
    val activeIndex = lines.indices
        .filter { lines[it].startPositionMs?.let { start -> start <= positionMs } == true }
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
            val active = index == activeIndex
            Text(
                text = renderChordPro(line.text, if (karaoke) Color(0xFF91E7FF) else MaterialTheme.colorScheme.primary, showChords),
                modifier = Modifier.fillMaxWidth()
                    .background(if (active && karaoke) Color.White.copy(alpha = 0.14f) else if (active) MaterialTheme.colorScheme.secondaryContainer else Color.Transparent)
                    .padding(horizontal = 16.dp, vertical = 14.dp)
                    .semantics { selected = active },
                style = if (karaoke) MaterialTheme.typography.titleLarge.copy(fontSize = if (active) 34.sp else 30.sp) else MaterialTheme.typography.titleLarge,
                color = when {
                    karaoke && active -> Color.White
                    karaoke -> Color.White.copy(alpha = 0.7f)
                    active -> MaterialTheme.colorScheme.onSecondaryContainer
                    else -> MaterialTheme.colorScheme.onSurface
                },
            )
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
