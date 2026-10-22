/** First-run flow: profile, phone, payment, friends and notifications, one step at a time. */

import { KeyboardAvoidingView, Platform, StyleSheet, View } from "react-native";
import Animated from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { ErrorState } from "@/components/ui/ErrorState";
import { Spinner } from "@/components/ui/Spinner";
import { stepEnter, stepExit } from "@/lib/motion/entrances";
import { useReduceMotion } from "@/lib/motion/hooks/useReduceMotion";
import { colors } from "@/lib/theme/theme";
import { DoneStep } from "./components/DoneStep/DoneStep";
import { FriendsStep } from "./components/FriendsStep/FriendsStep";
import { NotificationsStep } from "./components/NotificationsStep/NotificationsStep";
import { OnboardingHeader } from "./components/OnboardingHeader/OnboardingHeader";
import { PaymentStep } from "./components/PaymentStep/PaymentStep";
import { PhoneStep } from "./components/PhoneStep/PhoneStep";
import { ProfileStep } from "./components/ProfileStep/ProfileStep";
import { useOnboarding } from "./hooks/useOnboarding";

/**
 * Shows the planned steps one at a time under a step indicator. Each step
 * says what it is for before it asks for anything, and each one slides in
 * from the side it comes from (a fade under Reduce Motion) while the last
 * one leaves the other way. Account steps can be revisited with Back;
 * contacts and notifications are each asked once, by iOS, after the step
 * has explained them.
 *
 * Someone creating an account sees every step. Someone whose account was
 * set up elsewhere sees only what this phone has not been asked yet, the
 * first time they sign in on it.
 *
 * @returns The onboarding screen.
 */
export function OnboardingScreen() {
  const flow = useOnboarding();
  const reduceMotion = useReduceMotion();
  const { user, current } = flow;

  if (!user) {
    return (
      <SafeAreaView style={styles.safeArea}>
        {flow.loadError ? <ErrorState error={flow.loadError} retry={flow.retry} /> : <Spinner />}
      </SafeAreaView>
    );
  }

  /** @returns The current step's screen. */
  const step = () => {
    switch (current) {
      case "profile":
        return <ProfileStep onContinue={flow.onProfileDone} user={user} />;
      case "phone":
        return <PhoneStep onContinue={flow.onPhoneDone} user={user} />;
      case "payment":
        return (
          <PaymentStep
            defaultCurrency={user.defaultCurrency || "USD"}
            error={flow.error}
            onFinish={flow.onPaymentDone}
            pending={flow.completing}
          />
        );
      case "friends":
        return <FriendsStep onContinue={flow.onFriendsDone} />;
      case "notifications":
        return <NotificationsStep onContinue={flow.onNotificationsDone} />;
      case "done":
        return (
          <DoneStep
            achievements={flow.achievements}
            error={flow.error}
            firstName={user.name.trim().split(/\s+/)[0] ?? ""}
            onFinish={flow.finish}
            pending={flow.leaving}
          />
        );
      default:
        return <Spinner />;
    }
  };

  return (
    <SafeAreaView edges={["top", "left", "right"]} style={styles.safeArea}>
      {flow.progress.total > 0 ? (
        <OnboardingHeader onBack={flow.back} position={flow.progress.position} total={flow.progress.total} />
      ) : null}
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flexOne}>
        <View style={styles.flexOne}>
          <Animated.View
            entering={stepEnter(flow.direction, reduceMotion)}
            exiting={stepExit(flow.direction, reduceMotion)}
            key={current ?? "loading"}
            style={StyleSheet.absoluteFill}
          >
            {step()}
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flexOne: { flex: 1 },
  safeArea: { backgroundColor: colors.paper, flex: 1 },
});
