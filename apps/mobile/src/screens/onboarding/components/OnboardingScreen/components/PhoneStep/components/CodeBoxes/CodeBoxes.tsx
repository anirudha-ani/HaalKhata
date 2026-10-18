/** The verification code field: one real text input drawn as a row of boxes. */

import { useEffect, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, TextInput, type TextInputInstance } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from "react-native-reanimated";
import { useReduceMotion } from "@/lib/motion/hooks/useReduceMotion";
import { spacing } from "@/lib/theme/theme";
import { CODE_BOX_COUNT, CODE_SHAKE_DISTANCE, MAX_CODE_LENGTH } from "../../../../../../constants/onboarding";
import { CODE_STEP } from "../../../../../../constants/onboardingCopy";
import { arrivedWhole, codeDigits } from "../../../../../../utils/codeEntry";
import { CodeBox } from "./components/CodeBox/CodeBox";

/**
 * Renders the boxes over a single transparent TextInput. One real input is
 * what keeps iOS's one-time-code AutoFill, paste and VoiceOver working; a
 * box per digit breaks all three. A code that arrives whole (AutoFill from
 * Messages, or a paste) is submitted at once. A wrong code shakes the row.
 *
 * @param props - Component props.
 * @returns The field.
 */
export function CodeBoxes({
  code,
  onChange,
  onComplete,
  rejections,
  disabled,
}: {
  /** The digits entered so far. */
  code: string;
  onChange: (code: string) => void;
  /** Called with a code that arrived in one piece. */
  onComplete: (code: string) => void;
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

  const boxCount = Math.max(CODE_BOX_COUNT, code.length + (code.length < MAX_CODE_LENGTH && code.length >= CODE_BOX_COUNT ? 1 : 0));

  return (
    <Pressable accessible={false} onPress={() => inputRef.current?.focus()}>
      <Animated.View style={[styles.row, shakeStyle]}>
        {Array.from({ length: boxCount }, (_unused, index) => (
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
          maxLength={MAX_CODE_LENGTH}
          onBlur={() => setFocused(false)}
          onChangeText={(text) => {
            const digits = codeDigits(text);
            onChange(digits);
            if (arrivedWhole(code, digits)) onComplete(digits);
          }}
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
  row: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, justifyContent: "center" },
});
