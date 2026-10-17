/** One box of the verification code: its digit, or a blinking caret when it is next. */

import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  ZoomIn,
} from "react-native-reanimated";
import { Text } from "@/components/ui/Text";
import { FADE_OUT } from "@/lib/motion/entrances";
import { POP_SPRING } from "@/lib/motion/motion.constants";
import { colors, radii } from "@/lib/theme/theme";

/** A digit lands with a quick, small pop. */
const DIGIT_ENTERING = ZoomIn.springify(POP_SPRING.duration).dampingRatio(0.7);

/**
 * Draws one box. A typed digit pops in; the box that takes the next digit
 * gets the brand outline and a blinking caret, like a real text cursor
 * (which the hidden field above the boxes cannot show). Under Reduce Motion
 * the caret holds still.
 *
 * @param props - Component props.
 * @returns The box.
 */
export function CodeBox({
  digit,
  current,
  focused,
  reduceMotion,
}: {
  /** The digit in this box, or "" when empty. */
  digit: string;
  /** Whether the next typed digit lands here. */
  current: boolean;
  /** Whether the code field has the keyboard. */
  focused: boolean;
  reduceMotion: boolean;
}) {
  const caret = useSharedValue(1);
  const lift = useSharedValue(0);
  const showCaret = current && focused;

  useEffect(() => {
    if (!showCaret || reduceMotion) {
      cancelAnimation(caret);
      caret.value = 1;
      return undefined;
    }
    caret.value = withRepeat(withSequence(withTiming(0, { duration: 500 }), withTiming(1, { duration: 500 })), -1);
    return () => cancelAnimation(caret);
  }, [caret, reduceMotion, showCaret]);

  useEffect(() => {
    lift.value = reduceMotion ? (showCaret ? 1 : 0) : withSpring(showCaret ? 1 : 0, POP_SPRING);
  }, [lift, reduceMotion, showCaret]);

  const caretStyle = useAnimatedStyle(() => ({ opacity: caret.value }));
  const boxStyle = useAnimatedStyle(() => ({ transform: [{ translateY: -2 * lift.value }] }));

  return (
    <Animated.View style={[styles.box, showCaret ? styles.current : null, digit ? styles.filled : null, boxStyle]}>
      {digit ? (
        <Animated.View entering={reduceMotion ? undefined : DIGIT_ENTERING} exiting={FADE_OUT} key={digit}>
          <Text allowFontScaling={false} style={styles.digit}>{digit}</Text>
        </Animated.View>
      ) : showCaret ? (
        <Animated.View style={[styles.caret, caretStyle]} />
      ) : (
        <View />
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  box: {
    alignItems: "center",
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: radii.md,
    borderWidth: 1.5,
    height: 56,
    justifyContent: "center",
    width: 46,
  },
  caret: { backgroundColor: colors.brand600, borderRadius: 1, height: 26, width: 2 },
  current: { borderColor: colors.brand500 },
  digit: { color: colors.ink, fontSize: 26, fontVariant: ["tabular-nums"], fontWeight: "600" },
  filled: { borderColor: colors.ink },
});
