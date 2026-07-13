/** Placeholder panel for empty lists: icon, title, hint, and optional action. */

import type { ReactNode } from "react";

/**
 * Renders a dashed placeholder panel for empty lists: an optional icon,
 * a title, an optional hint line, and an optional call-to-action element.
 */
export function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  /** Decorative icon element shown above the title. */
  icon?: ReactNode;
  /** Main message describing what is empty. */
  title: string;
  /** Secondary line suggesting what the user can do about it. */
  hint?: string;
  /** Call-to-action element (typically a button or link) rendered below the text. */
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-line bg-card px-6 py-12 text-center">
      {icon ? <div className="text-ink-soft [&>svg]:h-8 [&>svg]:w-8">{icon}</div> : null}
      <p className="font-medium">{title}</p>
      {hint ? <p className="max-w-sm text-sm text-ink-soft">{hint}</p> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}
