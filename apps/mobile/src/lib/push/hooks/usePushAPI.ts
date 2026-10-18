/** Push notification queries and mutations for the native app: the caller's phones and their switches. */

import { onlineManager, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@haalkhata/shared/api/queryKeys";
import type { PushPreferenceValues } from "@haalkhata/shared/notifications/categories";
import { PUSH_COPY } from "@haalkhata/shared/notifications/copy";
import { pushClient } from "@/lib/api/connect";

/** Refuses a change while offline instead of queuing it for later. */
function assertOnline(): void {
  if (!onlineManager.isOnline()) throw new Error(PUSH_COPY.offline);
}

/**
 * The caller's phones and switches, and the actions on them. Every mutation
 * is sent once and fails visibly; nothing is retried behind the person's back.
 *
 * @returns Queries for phones and switches, and mutations to change them.
 */
export function usePushAPI() {
  const queryClient = useQueryClient();
  const devices = useQuery({
    queryKey: queryKeys.pushDevices,
    queryFn: () => pushClient.listDevices({}),
  });
  const preferences = useQuery({
    queryKey: queryKeys.pushPreferences,
    queryFn: () => pushClient.getPreferences({}),
  });
  const updatePreferences = useMutation({
    mutationFn: async (values: PushPreferenceValues) => {
      assertOnline();
      return pushClient.updatePreferences(values);
    },
    retry: false,
    networkMode: "always",
    onSuccess: (stored) => queryClient.setQueryData(queryKeys.pushPreferences, stored),
  });
  const removeDevice = useMutation({
    mutationFn: async (deviceId: string) => {
      assertOnline();
      await pushClient.removeDevice({ deviceId });
    },
    retry: false,
    networkMode: "always",
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.pushDevices }),
  });
  const sendTest = useMutation({
    mutationFn: async (deviceId: string) => {
      assertOnline();
      await pushClient.sendTestPush({ deviceId });
    },
    retry: false,
    networkMode: "always",
    // Success stamps the phone's "last notification"; a refused phone may
    // have just been forgotten. Either way the list is worth reading again.
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.pushDevices }),
  });
  return { devices, preferences, updatePreferences, removeDevice, sendTest };
}
