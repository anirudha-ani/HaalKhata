"use client";
/** The remove control of the edit dialog: a quiet link that turns into an in-place confirmation. */

/**
 * Renders "Remove this method", and once tapped, the question in its place.
 *
 * In place rather than in a second dialog: the answer sits where the tap
 * happened, and backing out is one tap on "Keep it" with the form untouched.
 *
 * @param props - Component props.
 * @returns The link, or the confirmation.
 */
export function RemoveMethod({
  name,
  confirming,
  pending,
  disabled,
  onAsk,
  onCancel,
  onConfirm,
}: {
  /** Name of the method, as stored. */
  name: string;
  /** Whether the confirmation is showing. */
  confirming: boolean;
  /** Whether the removal is in flight. */
  pending: boolean;
  /** Whether removing is unavailable for now, because a save is in flight. */
  disabled: boolean;
  /** Called when the link is tapped. */
  onAsk: () => void;
  /** Called when the owner backs out. */
  onCancel: () => void;
  /** Called when the owner confirms. */
  onConfirm: () => void;
}) {
  if (!confirming) {
    return (
      <button
        type="button"
        onClick={onAsk}
        disabled={disabled}
        className="block w-full py-2 text-center text-sm font-semibold text-ink-soft underline-offset-2 hover:text-brand-600 hover:underline disabled:opacity-50 disabled:hover:no-underline"
      >
        Remove this method
      </button>
    );
  }
  return (
    <div className="space-y-2 rounded-xl border border-brand-200 bg-brand-50 p-3">
      <p className="text-sm font-medium text-brand-700">
        Remove {name}? People who owe you will stop seeing it.
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onConfirm}
          disabled={pending || disabled}
          className="flex-1 rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {pending ? "Removing…" : "Remove"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="flex-1 rounded-xl border border-line bg-card py-2.5 text-sm font-semibold text-ink-soft hover:bg-paper disabled:opacity-50"
        >
          Keep it
        </button>
      </div>
    </div>
  );
}
