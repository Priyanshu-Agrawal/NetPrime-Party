/**
 * Notification & Background Playback Permissions Manager
 *
 * Provides cross-platform permission checking, requesting, and persistence
 * without interrupting active video playback.
 */
import { createMMKV } from "react-native-mmkv";
import { Linking, PermissionsAndroid, Platform } from "react-native";

const storage = createMMKV();
const K_NOTIF_PROMPTED = "bearoom.notifications.prompted";

/** Check if notification permission is currently granted */
export async function checkNotificationPermission(): Promise<boolean> {
  if (Platform.OS === "android") {
    if (Platform.Version >= 33) {
      try {
        return await PermissionsAndroid.check(
          PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
        );
      } catch {
        return false;
      }
    }
    return true; // Granted by default on Android < 13
  }

  // iOS: Notifications for background audio controls do not require push permission,
  // but push notifications for party invites can be requested.
  return true;
}

/** Request notification permission contextually */
export async function requestNotificationPermission(): Promise<boolean> {
  setPromptedNotification(true);

  if (Platform.OS === "android" && Platform.Version >= 33) {
    try {
      const result = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
        {
          title: "Bearoom Notifications",
          message:
            "Get notified when friends start a watch party and manage playback from your lock screen.",
          buttonPositive: "Allow",
          buttonNegative: "Not Now",
        }
      );
      return result === PermissionsAndroid.RESULTS.GRANTED;
    } catch {
      return false;
    }
  }

  return true;
}

/** Whether the user has already seen the onboarding notification prompt */
export function hasPromptedNotification(): boolean {
  return storage.getBoolean(K_NOTIF_PROMPTED) ?? false;
}

export function setPromptedNotification(prompted: boolean): void {
  storage.set(K_NOTIF_PROMPTED, prompted);
}

/** Open device app settings */
export async function openAppSettings(): Promise<void> {
  try {
    await Linking.openSettings();
  } catch {
    // ignore
  }
}
