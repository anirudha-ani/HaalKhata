/** Stable user-id order shared by clients and PostgreSQL's ledger_user_order collation. */

const LEDGER_USER_COLLATOR = new Intl.Collator("en-US");

/**
 * Preserves the server's en-US matching order regardless of a device's locale.
 * ICU considers canonically equivalent strings equal; PostgreSQL's deterministic
 * collation then compares UTF-8 bytes. Unicode code-point order is the same
 * tie-break for valid database text, including supplementary characters.
 * @param first First participant identifier.
 * @param second Second participant identifier.
 * @returns Negative, zero or positive in deterministic ledger order.
 */
export function compareLedgerUsers(first: string, second: string): number {
  const compared = LEDGER_USER_COLLATOR.compare(first, second);
  if (compared !== 0 || first === second) return compared;
  const firstPoints = Array.from(first, (point) => point.codePointAt(0)!);
  const secondPoints = Array.from(second, (point) => point.codePointAt(0)!);
  for (let index = 0; index < Math.min(firstPoints.length, secondPoints.length); index++) {
    const difference = firstPoints[index] - secondPoints[index];
    if (difference !== 0) return difference;
  }
  return firstPoints.length - secondPoints.length;
}
