/** Whether the signed-in app should open the first-run flow's device steps before anything else. */

import { useQuery } from "@tanstack/react-query";
import type { User } from "@haalkhata/protogen/common/v1/common_pb";
import { DEVICE_SETUP_QUERY_KEY } from "../onboarding.constants";
import { deviceSetupPending } from "../deviceSetup";

/**
 * Checks once per account per launch whether this phone owes the person the
 * device steps. Only an account whose onboarding is complete is checked
 * here; one that is not goes to the flow anyway. A failed check lets the
 * person into the app: the steps are an offer, never a wall.
 *
 * @param user - The signed-in account, once loaded.
 * @returns Whether the check is still running and whether the flow is due.
 */
export function useDeviceSetupGate(user: User | undefined) {
  const enabled = Boolean(user?.onboarded);
  const pending = useQuery({
    queryKey: [...DEVICE_SETUP_QUERY_KEY, user?.id ?? ""],
    queryFn: () => (user ? deviceSetupPending(user) : Promise.resolve(false)),
    enabled,
    retry: false,
    staleTime: Infinity,
  });
  return {
    checking: enabled && pending.isPending,
    due: pending.data === true,
  };
}
