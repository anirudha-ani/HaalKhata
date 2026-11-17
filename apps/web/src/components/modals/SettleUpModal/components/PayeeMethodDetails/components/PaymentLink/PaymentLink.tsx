/** A payment destination, checked before navigation when opened from a bill. */
import type { ReactNode } from "react";

/**
 * @param props - Destination, label, and optional validation action.
 * @returns A button for a checked handoff or a link for an ordinary settlement.
 */
export function PaymentLink({ url, onOpen, children, className }: {
  url: string; onOpen?: (url: string) => void; children: ReactNode; className: string;
}) {
  return onOpen
    ? <button type="button" className={className} onClick={() => onOpen(url)}>{children}</button>
    : <a href={url} target="_blank" rel="noopener noreferrer" className={className}>{children}</a>;
}
