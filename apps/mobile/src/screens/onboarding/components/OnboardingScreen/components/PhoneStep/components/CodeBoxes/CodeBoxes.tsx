/** The verification code field: one real text input drawn as a row of boxes. */

import { useEffect, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, TextInput, type TextInputInstance } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from "react-native-reanimated";
import { useReduceMotion } from "@/lib/motion/hooks/useReduceMotion";
import { spacing } from "@/lib/theme/theme";
import {
  VERIFICATION_CODE_INPUT_MAX_CHARACTERS,
  VERIFICATION_CODE_LENGTH,
} from "@haalkhata/shared/phone/phone.constants";
import { CODE_SHAKE_DISTANCE } from "../../../../../../constants/onboarding";
import { CODE_STEP } from "../../../../../../constants/onboardingCopy";
import { CodeBox } from "./components/CodeBox/CodeBox";

/**
 * Renders one box per digit of our code over a single transparent
 * TextInput. One real input is what keeps iOS's one-time-code AutoFill,
 * paste and VoiceOver working; a box per digit breaks all three. Every
 * change goes to the step as raw text: it reads the digits, and checks a
 * whole code that arrived in one piece. A refused code shakes the row.
 *
 * @param props - Component props.
 * @returns The field.
 */
export function CodeBoxes({
  code,
  onChangeText,
  rejections,
  disabled,
}: {
  /** The digits entered so far. */
  code: string;
  /** Receives the field's whole text after each change, unread. */
  onChangeText: (text: string) => void;
  /** Counts refused codes; each increase shakes the boxes. */
  rejections: number;
  disabled: boolean;
}) {
  const reduceMotion = useReduceMotion();
  const inputRef = useRef<TextInputInstance>(null);
  const [focused, setFocused] = useState(false);
  const shake = useSharedValue(0);

  useEffect(() => {
    if (rejections === 0 || reduceMotion) return;
    shake.value = withSequence(
      withTiming(-CODE_SHAKE_DISTANCE, { duration: 50 }),
      withTiming(CODE_SHAKE_DISTANCE, { duration: 70 }),
      withTiming(-CODE_SHAKE_DISTANCE / 2, { duration: 60 }),
      withTiming(CODE_SHAKE_DISTANCE / 2, { duration: 60 }),
      withTiming(0, { duration: 50 }),
    );
  }, [rejections, reduceMotion, shake]);
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }] }));

  return (
    <Pressable accessible={false} onPress={() => inputRef.current?.focus()}>
      <Animated.View style={[styles.row, shakeStyle]}>
        {Array.from({ length: VERIFICATION_CODE_LENGTH }, (_unused, index) => (
          <CodeBox
            current={index === code.length}
            digit={code[index] ?? ""}
            focused={focused}
            key={index}
            reduceMotion={reduceMotion}
          />
        ))}
        <TextInput
          accessibilityLabel={CODE_STEP.inputLabel}
          autoComplete={Platform.OS === "android" ? "sms-otp" : undefined}
          autoFocus
          caretHidden
          editable={!disabled}
          keyboardType="number-pad"
          maxLength={VERIFICATION_CODE_INPUT_MAX_CHARACTERS}
          onBlur={() => setFocused(false)}
          onChangeText={onChangeText}
          onFocus={() => setFocused(true)}
          ref={inputRef}
          selectionColor="transparent"
          style={styles.input}
          textContentType="oneTimeCode"
          value={code}
        />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  input: { ...StyleSheet.absoluteFill, color: "transparent", fontSize: 1, opacity: 0.02 },
  row: { flexDirection: "row", gap: spacing.sm, justifyContent: "center" },
});
