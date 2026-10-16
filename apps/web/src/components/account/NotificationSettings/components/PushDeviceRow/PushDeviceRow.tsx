"use client";
/** One phone that receives pushes: its name, when it was last seen and notified, and its two actions. */

import { PUSH_COPY } from "@haalkhata/shared/notifications/copy";
import { describePushDevice, type PushDeviceSummary } from "@haalkhata/shared/notifications/settings";

/** Props for {@link PushDeviceRow}. */
interface PushDeviceRowProps {
  device: PushDeviceSummary;
  /** This row's action is running. */
  busy: boolean;
  /** Another row's action is running. */
  locked: boolean;
  notice: string;
  error: string;
  onTest: () => void;
  onRemove: () => void;
}

/**
 * @param props - The phone, its feedback and its handlers.
 * @returns The row, with the outcome of its last action under its buttons.
 */
export function PushDeviceRow({ device, busy, locked, notice, error, onTest, onRemove }: PushDeviceRowProps) {
  const description = describePushDevice(device);
  return (
    <li className="space-y-2 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{description.name}</p>
          <p className="text-xs text-ink-soft">{description.detail}</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy || locked}
            onClick={onTest}
            className="min-h-11 rounded-xl border border-line px-3 text-sm font-semibold disabled:opacity-60"
          >
            {PUSH_COPY.sendTest}
          </button>
          <button
            type="button"
            disabled={busy || locked}
            onClick={onRemove}
            className="min-h-11 rounded-xl border border-line px-3 text-sm font-semibold text-neg-700 disabled:opacity-60"
          >
            {PUSH_COPY.remove}
          </button>
        </div>
      </div>
      {error ? (
        <p role="alert" className="text-xs text-neg-700">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="text-xs text-pos-700">
          {notice}
        </p>
      ) : null}
    </li>
  );
}
