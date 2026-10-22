/** Per-control feedback for the Notifications card: each switch and each phone reports its own result. */

import { useState } from "react";
import type { PushCategory } from "@haalkhata/shared/notifications/categories";
import { PUSH_COPY } from "@haalkhata/shared/notifications/copy";
import { toPushPreferenceValues, withPushSwitch } from "@haalkhata/shared/notifications/settings";
import { errorMessage } from "@/lib/api/connect";
import { usePushAPI } from "@/lib/push/hooks/usePushAPI";

/** What one phone row shows under its buttons. */
interface DeviceFeedback {
  notice: string;
  error: string;
}

/**
 * Wires the card to PushService and keeps every result beside the control
 * that caused it: a switch that didn't save says so under that switch, a
 * test that bounced says so on that phone's row.
 *
 * @returns Server state, per-control feedback and the actions.
 */
export function useNotificationSettings() {
  const pushAPI = usePushAPI();
  const [switchErrors, setSwitchErrors] = useState<Partial<Record<PushCategory, string>>>({});
  const [pendingSwitch, setPendingSwitch] = useState<PushCategory | null>(null);
  const [deviceFeedback, setDeviceFeedback] = useState<Record<string, DeviceFeedback>>({});
  const [busyDevice, setBusyDevice] = useState<string | null>(null);
  const [listNotice, setListNotice] = useState("");

  /**
   * Saves one switch. The stored record changes only when the server
   * confirms it, so a failed save leaves the switch where it was.
   *
   * @param category - The switch.
   * @param enabled - Its new state.
   */
  const toggle = async (category: PushCategory, enabled: boolean): Promise<void> => {
    const current = pushAPI.preferences.data;
    if (!current || pendingSwitch) return;
    setPendingSwitch(category);
    setSwitchErrors((previous) => ({ ...previous, [category]: "" }));
    try {
      await pushAPI.updatePreferences.mutateAsync(withPushSwitch(toPushPreferenceValues(current), category, enabled));
    } catch (failure) {
      setSwitchErrors((previous) => ({ ...previous, [category]: errorMessage(failure) }));
    } finally {
      setPendingSwitch(null);
    }
  };

  /**
   * Runs one phone action and records its outcome on that phone's row.
   *
   * @param deviceId - The phone.
   * @param action - The request to make.
   * @param notice - What to say on the row when it succeeds.
   * @returns Whether it succeeded.
   */
  const runDeviceAction = async (deviceId: string, action: () => Promise<void>, notice: string): Promise<boolean> => {
    if (busyDevice) return false;
    setBusyDevice(deviceId);
    setDeviceFeedback((previous) => ({ ...previous, [deviceId]: { notice: "", error: "" } }));
    try {
      await action();
      setDeviceFeedback((previous) => ({ ...previous, [deviceId]: { notice, error: "" } }));
      return true;
    } catch (failure) {
      setDeviceFeedback((previous) => ({ ...previous, [deviceId]: { notice: "", error: errorMessage(failure) } }));
      return false;
    } finally {
      setBusyDevice(null);
    }
  };

  /** @param deviceId - The phone to send a test push to. */
  const sendTest = async (deviceId: string): Promise<void> => {
    await runDeviceAction(deviceId, () => pushAPI.sendTest.mutateAsync(deviceId), PUSH_COPY.testSent);
  };

  /**
   * Stops pushes to a phone. Its row disappears on success, so the
   * confirmation is shown above the list instead of on the row.
   *
   * @param deviceId - The phone to stop pushing to.
   */
  const remove = async (deviceId: string): Promise<void> => {
    setListNotice("");
    if (await runDeviceAction(deviceId, () => pushAPI.removeDevice.mutateAsync(deviceId), "")) {
      setListNotice(PUSH_COPY.removed);
    }
  };

  return {
    preferences: pushAPI.preferences.data,
    preferencesLoading: pushAPI.preferences.isPending,
    preferencesError: pushAPI.preferences.error ? errorMessage(pushAPI.preferences.error) : "",
    retryPreferences: () => void pushAPI.preferences.refetch(),
    devices: pushAPI.devices.data?.devices ?? [],
    devicesLoading: pushAPI.devices.isPending,
    devicesError: pushAPI.devices.error ? errorMessage(pushAPI.devices.error) : "",
    retryDevices: () => void pushAPI.devices.refetch(),
    switchErrors,
    pendingSwitch,
    deviceFeedback,
    busyDevice,
    listNotice,
    toggle,
    sendTest,
    remove,
  };
}
