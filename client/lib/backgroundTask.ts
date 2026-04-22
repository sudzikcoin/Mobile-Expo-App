import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import { getDriverToken, addLog, isLocationEnabled } from './storage';

const BACKGROUND_LOCATION_TASK = 'PINGPOINT_BACKGROUND_LOCATION';

TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
  if (error) {
    console.error('[BGTask] Error:', error);
    return;
  }

  if (!data) return;

  const locationEnabled = await isLocationEnabled();
  if (!locationEnabled) return;

  const token = await getDriverToken();
  if (!token) return;

  const { locations } = data as { locations: Location.LocationObject[] };
  const location = locations[0];
  if (!location) return;

  try {
    const response = await fetch(`https://pingpoint.suverse.io/api/driver/${token}/ping`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lat: location.coords.latitude,
        lng: location.coords.longitude,
        accuracy: location.coords.accuracy || 0,
        speed: location.coords.speed,
        heading: location.coords.heading,
      }),
    });

    if (response.ok) {
      await addLog({
        action: 'LOCATION_PING',
        location: {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        },
      });
    }
  } catch (err) {
    console.error('[BGTask] Ping failed:', err);
  }
});

export { BACKGROUND_LOCATION_TASK };

export async function startBackgroundLocationTracking(): Promise<boolean> {
  try {
    const { status: fg } = await Location.requestForegroundPermissionsAsync();
    if (fg !== 'granted') return false;

    const { status: bg } = await Location.requestBackgroundPermissionsAsync();
    if (bg !== 'granted') return false;

    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_LOCATION_TASK);
    if (!isRegistered) {
      await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
        accuracy: Location.Accuracy.Balanced,
        timeInterval: 60000,
        distanceInterval: 100,
        foregroundService: {
          notificationTitle: 'PingPoint Tracking',
          notificationBody: 'Location sharing is active',
          notificationColor: '#00d9ff',
        },
        pausesUpdatesAutomatically: false,
        showsBackgroundLocationIndicator: true,
      });
    }
    return true;
  } catch (err) {
    console.error('[BGTask] Failed to start:', err);
    return false;
  }
}

export async function stopBackgroundLocationTracking(): Promise<void> {
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_LOCATION_TASK);
    if (isRegistered) {
      await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
    }
  } catch (err) {
    console.error('[BGTask] Failed to stop:', err);
  }
}

export async function isBackgroundTrackingActive(): Promise<boolean> {
  try {
    return await TaskManager.isTaskRegisteredAsync(BACKGROUND_LOCATION_TASK);
  } catch {
    return false;
  }
}
