package com.srikanthvvs1.financetracker

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import com.srikanthvvs1.financetracker.ui.FinTrackApp
import com.srikanthvvs1.financetracker.ui.theme.FinTrackTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            FinTrackTheme {
                FinTrackApp()
            }
        }
    }
}
