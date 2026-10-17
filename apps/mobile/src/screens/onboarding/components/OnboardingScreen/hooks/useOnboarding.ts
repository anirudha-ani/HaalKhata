/** The first-run flow's controller: the planned steps, moving between them, and leaving. */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { queryKeys } from "@haalkhata/shared/api/queryKeys";
import { authClient, errorMessage } from "@/lib/api/connect";
import type { FlowDirection } from "@/lib/motion/entrances";
import { DEVICE_SETUP_QUERY_KEY } from "@/lib/onboarding/onboarding.constants";
import { finishDeviceSetup, markDeviceSetupDue, readOnboardingSituation } from "@/lib/onboarding/deviceSetup";
import {
  ACCOUNT_STEPS,
  onboardingDestination,
  onboardingProgress,
  planOnboardingSteps,
} from "@/lib/onboarding/onboardingPlan";
import type { SetupAchievements } from "../components/DoneStep/DoneStep";
import type { FriendsSummary } from "../components/FriendsStep/FriendsStep";

/** Query key for the plan of this visit to the flow; local, never sent. */
const PLAN_QUERY_KEY = ["device", "onboardingPlan"] as const;

/**
 * Drives the flow.
 *
 * The steps are planned once, when the flow opens, from the account and
 * this phone (see planOnboardingSteps), and then held: a step must not
 * vanish because the permission it asked for changed while it was showing.
 * The account steps end on the payment step, which marks onboarding
 * complete on the server, so an interruption after it resumes with only
 * the device steps. The last screen marks the device steps done on this
 * phone and opens the app where the person was headed.
 *
 * @returns The signed-in account, the plan and current step, progress, the
 *   direction of the last move, what setup achieved, and the handlers each
 *   step calls when it ends.
 */
export function useOnboarding() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { next } = useLocalSearchParams<{ next?: string }>();
  const meQuery = useQuery({ queryKey: queryKeys.me, queryFn: () => authClient.getMe({}) });
  const user = meQuery.data;

  const planQuery = useQuery({
    queryKey: [...PLAN_QUERY_KEY, user?.id ?? ""],
    enabled: Boolean(user),
    gcTime: 0,
    retry: false,
    staleTime: Infinity,
    queryFn: async () => {
      if (!user) return [];
      // Someone still setting up their account owes the device steps too;
      // noting it means an interruption after the account steps resumes them.
      if (!user.onboarded) await markDeviceSetupDue();
      return planOnboardingSteps(await readOnboardingSituation(user));
    },
  });
  const steps = planQuery.data;

  const [stepIndex, setStepIndex] = useState(0);
  const [direction, setDirection] = useState<FlowDirection>("forward");
  const [accountDone, setAccountDone] = useState(false);
  const [error, setError] = useState("");
  const [achievements, setAchievements] = useState<SetupAchievements>({
    phoneVerified: false,
    requestsSent: 0,
    friendsAdded: 0,
    notificationsOn: false,
    paymentAdded: false,
  });

  const current = steps?.[stepIndex];

  /** Moves to the following step. */
  const advance = useCallback(() => {
    setError("");
    setDirection("forward");
    setStepIndex((index) => index + 1);
  }, []);

  const completeAccount = useMutation({
    mutationFn: () => authClient.completeOnboarding({}),
    onSuccess: (profile, hasMethods: boolean) => {
      // The signed-in layout decides from this cached flag; a stale false
      // would send the person straight back here.
      queryClient.setQueryData(queryKeys.me, profile);
      setAccountDone(true);
      setAchievements((done) => ({ ...done, paymentAdded: hasMethods }));
      advance();
    },
    onError: (failure) => setError(errorMessage(failure)),
  });

  const leave = useMutation({
    mutationFn: async () => {
      // Bookkeeping only: if it cannot be written, the worst outcome is the
      // device steps being offered again, which must not keep anyone out.
      if (user) await finishDeviceSetup(user.id).catch(() => undefined);
    },
    onSuccess: () => {
      if (user) queryClient.setQueryData([...DEVICE_SETUP_QUERY_KEY, user.id], false);
      router.replace(onboardingDestination(next));
    },
    onError: (failure) => setError(errorMessage(failure)),
  });

  // Nothing to show (every question already answered here), or the plan
  // could not be made: go straight on, once.
  const leftRef = useRef(false);
  const nothingToShow = (steps !== undefined && steps.length === 0) || planQuery.isError;
  useEffect(() => {
    if (!nothingToShow || leftRef.current) return;
    leftRef.current = true;
    leave.mutate();
  }, [leave, nothingToShow]);

  const onFriendsDone = useCallback(
    (summary: FriendsSummary) => {
      setAchievements((done) => ({ ...done, requestsSent: summary.sent, friendsAdded: summary.accepted }));
      advance();
    },
    [advance],
  );

  const canGoBack =
    current !== undefined && ACCOUNT_STEPS.includes(current) && stepIndex > 0 && !accountDone && !completeAccount.isPending;

  return {
    user,
    loadError: user ? null : meQuery.error,
    retry: meQuery.refetch,
    current,
    progress: steps && current ? onboardingProgress(steps, current) : { total: 0, position: 0 },
    direction,
    achievements,
    error,
    completing: completeAccount.isPending,
    leaving: leave.isPending,
    /** Goes back one account step, when that is still possible. */
    back: canGoBack
      ? () => {
          setError("");
          setDirection("back");
          setStepIndex((index) => Math.max(0, index - 1));
        }
      : undefined,
    onProfileDone: advance,
    onPhoneDone: useCallback(
      (verified: boolean) => {
        if (verified) setAchievements((done) => ({ ...done, phoneVerified: true }));
        advance();
      },
      [advance],
    ),
    /** Finishes the account steps; the payment step's one button. */
    onPaymentDone: (hasMethods: boolean) => {
      setError("");
      completeAccount.mutate(hasMethods);
    },
    onFriendsDone,
    onNotificationsDone: useCallback(
      (granted: boolean) => {
        setAchievements((done) => ({ ...done, notificationsOn: granted }));
        advance();
      },
      [advance],
    ),
    /** Opens the app; the closing screen's button. */
    finish: () => {
      setError("");
      leave.mutate();
    },
  };
}
