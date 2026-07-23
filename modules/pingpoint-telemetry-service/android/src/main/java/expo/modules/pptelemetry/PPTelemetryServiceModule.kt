package expo.modules.pptelemetry

import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.Looper
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Start/stop the connected-device foreground service and emit a 5s "onPPTick"
 * event. The tick is a Handler on the main looper: unlike React Native's
 * setInterval (driven by Choreographer frame callbacks, which stop when the
 * host activity pauses), Handler messages keep firing in the background as
 * long as the process is alive — which the foreground service guarantees.
 */
class PPTelemetryServiceModule : Module() {
  companion object {
    private const val TICK_MS = 5_000L
    private const val TICK_EVENT = "onPPTick"
  }

  private val handler = Handler(Looper.getMainLooper())
  private var ticking = false
  private val tick = object : Runnable {
    override fun run() {
      if (!ticking) return
      try {
        sendEvent(TICK_EVENT, mapOf<String, Any?>())
      } catch (_: Throwable) {}
      handler.postDelayed(this, TICK_MS)
    }
  }

  override fun definition() = ModuleDefinition {
    Name("PPTelemetryService")

    Events(TICK_EVENT)

    Function("start") { title: String, text: String ->
      val context = appContext.reactContext ?: return@Function false
      val intent = Intent(context, PPTelemetryForegroundService::class.java)
        .putExtra(PPTelemetryForegroundService.EXTRA_TITLE, title)
        .putExtra(PPTelemetryForegroundService.EXTRA_TEXT, text)
      try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
          context.startForegroundService(intent)
        } else {
          context.startService(intent)
        }
      } catch (t: Throwable) {
        // e.g. ForegroundServiceStartNotAllowedException when invoked from
        // the background — caller retries on the next foreground/connect.
        return@Function false
      }
      if (!ticking) {
        ticking = true
        handler.postDelayed(tick, TICK_MS)
      }
      true
    }

    Function("stop") {
      ticking = false
      handler.removeCallbacks(tick)
      val context = appContext.reactContext ?: return@Function false
      try {
        context.stopService(Intent(context, PPTelemetryForegroundService::class.java))
      } catch (_: Throwable) {}
      true
    }

    OnDestroy {
      ticking = false
      handler.removeCallbacks(tick)
    }
  }
}
