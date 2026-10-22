/** Keeps this phone registered for pushes while someone is signed in. */

import { useEffect } from "react";
import { AppState } from "react-native";
import * as Notifications from "expo-notifications";
import { refreshPushPermission, syncThisPhone } from "@/lib/push/pushStore";

/**
 * Reads the permission and registers the phone when it is allowed: on mount
 * (sign-in or launch), each time the app comes back to the foreground (the
 * person may have changed the permission in iOS Settings, and a day may have
 * passed), and whenever the token rotates. It never asks for permission.
 */
export function usePushRegistration(): void {
  useEffect(() => {
    /** Reads the permission, then registers when it allows. */
    const sync = (): void => {
      void refreshPushPermission()
        .then(() => syncThisPhone())
        .catch(() => undefined);
    };
    sync();
    const appState = AppState.addEventListener("change", (status) => {
      if (status === "active") sync();
    });
    const tokenRotation = Notifications.addPushTokenListener(() => void syncThisPhone(true));
    return () => {
      appState.remove();
      tokenRotation.remove();
    };
  }, []);
}
