package com.srikanthvvs1.financetracker.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val FinTrackColors = lightColorScheme(
    primary = Color(0xFF2855D9),
    secondary = Color(0xFF5570C7),
    tertiary = Color(0xFF00876C),
    background = Color(0xFFF7F8FC),
    surface = Color.White,
)

@Composable
fun FinTrackTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = FinTrackColors, content = content)
}
