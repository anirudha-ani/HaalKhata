/** What the Account card says about this phone, and the one action that fits its state. */

import { useEffect } from "react";
import { Linking } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@haalkhata/shared/api/queryKeys";
import { PUSH_COPY } from "@haalkhata/shared/notifications/copy";
import { offerPushExplainer, refreshPushPermission, turnThisPhoneOn, usePushState } from "@/lib/push/pushStore";

/** The line and the action the card shows for this phone. */
export interface ThisPhoneView {
  status: string;
  /** Shown as an error, with the action as its retry. */
  failed: boolean;
  /** The action's label, or "" when there is nothing to do. */
  actionLabel: string;
  action: () => void;
  busy: boolean;
}

/**
 * Reads the permission when the card opens, keeps the list of phones in step
 * with this phone's registration, and offers exactly one next step: turn
 * on (explainer, then iOS's alert), open iOS Settings after a refusal, turn
 * a removed phone back on, or retry a registration that failed.
 *
 * @returns The status line and its action.
 */
export function useThisPhone(): ThisPhoneView {
  const push = usePushState();
  const queryClient = useQueryClient();

  useEffect(() => {
    void refreshPushPermission().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (push.deviceId) void queryClient.invalidateQueries({ queryKey: queryKeys.pushDevices });
  }, [push.deviceId, queryClient]);

  const none = { actionLabel: "", action: () => undefined };
  if (push.permission === "undetermined") {
    return { status: PUSH_COPY.statusNotAsked, failed: false, busy: false,
      actionLabel: PUSH_COPY.turnOn, action: () => void offerPushExplainer(true) };
  }
  if (push.permission === "denied") {
    return { status: PUSH_COPY.statusDenied, failed: false, busy: false,
      actionLabel: PUSH_COPY.openSettings, action: () => void Linking.openSettings() };
  }
  if (push.permission === "unknown") return { status: "Checking…", failed: false, busy: true, ...none };
  if (push.registering) return { status: PUSH_COPY.registering, failed: false, busy: true, ...none };
  if (push.keptOff) {
    return { status: PUSH_COPY.statusKeptOff, failed: false, busy: false,
      actionLabel: PUSH_COPY.turnOn, action: () => void turnThisPhoneOn() };
  }
  if (push.error) {
    return { status: push.error, failed: true, busy: false,
      actionLabel: PUSH_COPY.retry, action: () => void turnThisPhoneOn() };
  }
  return { status: PUSH_COPY.statusOn, failed: false, busy: false, ...none };
}
