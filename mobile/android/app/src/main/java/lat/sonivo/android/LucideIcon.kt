package lat.sonivo.android

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics

@Composable
internal fun LucideIcon(name: String, tint: Color, modifier: Modifier = Modifier, size: Dp = 20.dp, label: String? = null) {
    Canvas(modifier.size(size).then(if (label == null) Modifier else Modifier.semantics { contentDescription = label })) {
        val factor = this.size.minDimension / 24f
        scale(factor, factor, Offset.Zero) {
            val path = Path()
            when (name) {
                "info" -> {
                    path.addOval(androidx.compose.ui.geometry.Rect(3f, 3f, 21f, 21f))
                    path.moveTo(12f, 11f); path.lineTo(12f, 16f)
                    path.moveTo(12f, 8f); path.lineTo(12.01f, 8f)
                }
                "eye" -> {
                    path.moveTo(2f, 12f); path.cubicTo(4.6f, 7f, 8f, 5f, 12f, 5f); path.cubicTo(16f, 5f, 19.4f, 7f, 22f, 12f)
                    path.cubicTo(19.4f, 17f, 16f, 19f, 12f, 19f); path.cubicTo(8f, 19f, 4.6f, 17f, 2f, 12f)
                    path.addOval(androidx.compose.ui.geometry.Rect(9f, 9f, 15f, 15f))
                }
                "eyeOff" -> {
                    path.moveTo(3f, 3f); path.lineTo(21f, 21f)
                    path.moveTo(10.6f, 10.6f); path.cubicTo(9.7f, 11.5f, 9.7f, 12.8f, 10.6f, 13.7f); path.cubicTo(11.5f, 14.6f, 12.8f, 14.6f, 13.7f, 13.7f)
                    path.moveTo(9.9f, 5.2f); path.cubicTo(10.6f, 5.1f, 11.3f, 5f, 12f, 5f); path.cubicTo(16f, 5f, 19.4f, 7f, 22f, 12f); path.cubicTo(21.3f, 13.4f, 20.5f, 14.5f, 19.5f, 15.5f)
                    path.moveTo(6.2f, 6.2f); path.cubicTo(4.5f, 7.2f, 3.1f, 9.1f, 2f, 12f); path.cubicTo(4.6f, 17f, 8f, 19f, 12f, 19f); path.cubicTo(13.7f, 19f, 15.2f, 18.6f, 16.6f, 17.8f)
                }
                "close" -> { path.moveTo(18f, 6f); path.lineTo(6f, 18f); path.moveTo(6f, 6f); path.lineTo(18f, 18f) }
                "play" -> { path.moveTo(8f, 5f); path.lineTo(19f, 12f); path.lineTo(8f, 19f); path.close() }
                "pause" -> { path.moveTo(8f, 5f); path.lineTo(8f, 19f); path.moveTo(16f, 5f); path.lineTo(16f, 19f) }
                else -> return@Canvas
            }
            drawPath(path, tint, style = Stroke(width = 1.8f, cap = androidx.compose.ui.graphics.StrokeCap.Round, join = androidx.compose.ui.graphics.StrokeJoin.Round))
        }
    }
}
