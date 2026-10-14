/** Eye dot: the filled eye the activity glyphs' faces share. */

/** A filled eye dot. */
export function EyeDot({ x: eyeX, y: eyeY, r: radius = 1 }: { x: number; y: number; r?: number }) {
  return <circle cx={eyeX} cy={eyeY} r={radius} fill="currentColor" />;
}
