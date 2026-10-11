"use client";
/** The pinned footer of the payment method dialog: the server's refusal, when there is one, and the Save button. */

/**
 * Renders the dialog's Save button with any refusal directly above it, so
 * the reason sits beside the control that caused it and never scrolls away.
 *
 * The button is outside the form element (the footer does not scroll with
 * the body), so it submits the form by id.
 *
 * @param props - Component props.
 * @returns The footer content.
 */
export function SaveBar({
  formId,
  label,
  pendingLabel,
  pending,
  disabled,
  error,
}: {
  /** Id of the form the button submits. */
  formId: string;
  /** Button text at rest. */
  label: string;
  /** Button text while the save is in flight. */
  pendingLabel: string;
  /** Whether the save is in flight. */
  pending: boolean;
  /** Whether the button is off for any reason, pending included. */
  disabled: boolean;
  /** Why the last save or removal was refused; empty when it was not. */
  error: string;
}) {
  return (
    <div className="space-y-2">
      {error ? (
        <p role="alert" className="text-sm font-medium text-brand-600">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        form={formId}
        disabled={disabled}
        className="w-full rounded-xl bg-brand-600 py-3 font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
      >
        {pending ? pendingLabel : label}
      </button>
    </div>
  );
}
