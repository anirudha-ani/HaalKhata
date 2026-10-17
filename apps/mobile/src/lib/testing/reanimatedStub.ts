/**
 * Test-only stand-in for react-native-reanimated, aliased in vitest.config.ts.
 * Animated hosts render through whatever `react-native` the test mocked, and
 * nothing animates: shared values hold their target, springs and timings
 * return it, and layout-animation builders accept any chain. Tests check
 * what a screen shows and does, not how it moves.
 */

import * as NativeHosts from "react-native";

/** Any chain of builder calls (`FadeInDown.delay(70).springify()`) ends back here. */
type AnimationBuilder = { [method: string]: (...args: unknown[]) => AnimationBuilder };

const builder: AnimationBuilder = new Proxy({} as AnimationBuilder, {
  get: () => () => builder,
});

/**
 * Returns the component unchanged; the test's host mocks render it.
 *
 * @param component - Any component.
 * @returns The same component.
 */
export function createAnimatedComponent<Component>(component: Component): Component {
  return component;
}

// Getters, so a test's react-native mock only has to define the hosts the
// component under test actually renders.
const Animated = {
  get View() {
    return NativeHosts.View;
  },
  get Text() {
    return NativeHosts.Text;
  },
  get ScrollView() {
    return NativeHosts.ScrollView;
  },
  createAnimatedComponent,
};
export default Animated;

/**
 * A shared value that never animates.
 *
 * @param initial - Starting value.
 * @returns A mutable box holding it.
 */
export function useSharedValue<Value>(initial: Value): { value: Value } {
  return { value: initial };
}

/** @returns No animated style; the static styles are what tests read. */
export function useAnimatedStyle(): Record<string, never> {
  return {};
}

/** @returns No scroll handler. */
export function useAnimatedScrollHandler(): undefined {
  return undefined;
}

/** @returns Motion is never reduced in tests unless a test mocks this. */
export function useReducedMotion(): boolean {
  return false;
}

/**
 * Jumps straight to the target.
 *
 * @param target - Where the animation would end.
 * @returns The target.
 */
export function withSpring<Value>(target: Value): Value {
  return target;
}

/**
 * Jumps straight to the target.
 *
 * @param target - Where the animation would end.
 * @returns The target.
 */
export function withTiming<Value>(target: Value): Value {
  return target;
}

/**
 * Ignores the delay.
 *
 * @param _delay - Unused.
 * @param animation - The delayed value.
 * @returns The value.
 */
export function withDelay<Value>(_delay: number, animation: Value): Value {
  return animation;
}

/**
 * Runs the repeated animation once.
 *
 * @param animation - The repeated value.
 * @returns The value.
 */
export function withRepeat<Value>(animation: Value): Value {
  return animation;
}

/**
 * Ends on the last step.
 *
 * @param steps - The sequence.
 * @returns Its last value.
 */
export function withSequence<Value>(...steps: Value[]): Value | undefined {
  return steps.at(-1);
}

/**
 * Linear interpolation is enough for tests that read a static frame.
 *
 * @param value - Input.
 * @param input - Input range.
 * @param output - Output range.
 * @returns The output at the first input point.
 */
export function interpolate(value: number, input: number[], output: number[]): number {
  return value <= (input[0] ?? 0) ? (output[0] ?? 0) : (output.at(-1) ?? 0);
}

/** Does nothing. */
export function cancelAnimation(): void {}

/** Identity easing curves. */
export const Easing = {
  bezier: () => (progress: number) => progress,
  cubic: (progress: number) => progress,
  inOut: () => (progress: number) => progress,
  linear: (progress: number) => progress,
  out: () => (progress: number) => progress,
  quad: (progress: number) => progress,
};

/** Reduce-motion modes, as Reanimated names them. */
export const ReduceMotion = { System: "system", Always: "always", Never: "never" } as const;

/** Extrapolation modes, as Reanimated names them. */
export const Extrapolation = { CLAMP: "clamp", EXTEND: "extend", IDENTITY: "identity" } as const;

export const FadeIn = builder;
export const FadeInDown = builder;
export const FadeInUp = builder;
export const FadeOut = builder;
export const FadeOutDown = builder;
export const FadeOutUp = builder;
export const LinearTransition = builder;
export const SlideInDown = builder;
export const SlideInLeft = builder;
export const SlideInRight = builder;
export const SlideOutDown = builder;
export const SlideOutLeft = builder;
export const SlideOutRight = builder;
export const ZoomIn = builder;
export const ZoomOut = builder;
