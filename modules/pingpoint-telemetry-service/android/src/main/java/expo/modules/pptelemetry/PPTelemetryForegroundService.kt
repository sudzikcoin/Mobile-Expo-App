package expo.modules.pptelemetry

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat

/**
 * Keeps the app process out of Android's cached-app freezer while the IOSiX
 * BLE dongle is connected, so BLE notifications and the JS upload loop keep
 * running when the driver switches to another app. All actual telemetry work
 * stays in JS — this service only holds the foreground state + notification.
 */
class PPTelemetryForegroundService : Service() {
  companion object {
    const val EXTRA_TITLE = "title"
    const val EXTRA_TEXT = "text"
    private const val CHANNEL_ID = "pingpoint_telemetry"
    private const val NOTIFICATION_ID = 27182
  }

  private var wakeLock: PowerManager.WakeLock? = null

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val title = intent?.getStringExtra(EXTRA_TITLE) ?: "PingPoint tracking active"
    val text = intent?.getStringExtra(EXTRA_TEXT) ?: "Streaming truck telemetry"
    try {
      createChannel()
      val notification = buildNotification(title, text)
      val type =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q)
          ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE
        else 0
      ServiceCompat.startForeground(this, NOTIFICATION_ID, notification, type)
      // The foreground service keeps the process alive, but with the screen
      // off some OEMs still gate CPU for apps without a wake lock, which
      // would stall the 5s tick (and with it every upload) between BLE
      // interrupts. Held for the whole dongle session; released in
      // onDestroy, and by the kernel if the process dies.
      if (wakeLock == null) {
        wakeLock = getSystemService(PowerManager::class.java)
          ?.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "PingPoint:telemetry")
          ?.apply {
            setReferenceCounted(false)
            acquire()
          }
      }
    } catch (t: Throwable) {
      // Missing runtime prerequisite (e.g. BLUETOOTH_CONNECT revoked) — a
      // dead service is better than a crash loop; JS retries on reconnect.
      stopSelf()
    }
    // The JS side owns the lifecycle; if the process is killed there is no
    // JS to feed the notification, so don't resurrect a zombie service.
    return START_NOT_STICKY
  }

  override fun onDestroy() {
    try {
      wakeLock?.release()
    } catch (_: Throwable) {}
    wakeLock = null
    ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
    super.onDestroy()
  }

  private fun createChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = getSystemService(NotificationManager::class.java) ?: return
    val channel = NotificationChannel(
      CHANNEL_ID,
      "Truck telemetry",
      NotificationManager.IMPORTANCE_LOW,
    )
    channel.setShowBadge(false)
    manager.createNotificationChannel(channel)
  }

  private fun buildNotification(title: String, text: String): android.app.Notification {
    val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
    val contentIntent = launchIntent?.let {
      PendingIntent.getActivity(
        this,
        0,
        it,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )
    }
    val smallIcon = resources
      .getIdentifier("ic_notification", "drawable", packageName)
      .takeIf { it != 0 }
      ?: android.R.drawable.stat_notify_sync
    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle(title)
      .setContentText(text)
      .setSmallIcon(smallIcon)
      .setOngoing(true)
      .setContentIntent(contentIntent)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
      .build()
  }
}
