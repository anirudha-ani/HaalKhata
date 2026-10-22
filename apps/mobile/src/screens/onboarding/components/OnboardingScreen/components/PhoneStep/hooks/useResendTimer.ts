/** A countdown before a verification code may be sent again. */

import { useEffect, useState } from "react";

/**
 * Counts down from the moment a code was sent, once a second, from the
 * clock rather than by subtracting ticks, so a backgrounded app comes back
 * showing the right number.
 *
 * @param delaySeconds - How long to wait after each send.
 * @returns Seconds left (0 when resending is allowed) and `restart` for a new send.
 */
export function useResendTimer(delaySeconds: number) {
  const [sentAt, setSentAt] = useState(() => Date.now());
  const [clock, setClock] = useState(() => Date.now());
  const remaining = Math.max(0, Math.ceil(delaySeconds - (clock - sentAt) / 1_000));

  useEffect(() => {
    if (remaining === 0) return undefined;
    const interval = setInterval(() => setClock(Date.now()), 1_000);
    return () => clearInterval(interval);
  }, [remaining]);

  return {
    remaining,
    /** Starts the wait again after another send. */
    restart: () => {
      const sent = Date.now();
      setSentAt(sent);
      setClock(sent);
    },
  };
}
