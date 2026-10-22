"use client";
/** Account's Notifications card on the web: which kinds of push to send, and the phones that receive them. */

import { PUSH_CATEGORIES } from "@haalkhata/shared/notifications/categories";
import { PUSH_COPY } from "@haalkhata/shared/notifications/copy";
import { PushCategorySwitch } from "./components/PushCategorySwitch/PushCategorySwitch";
import { PushDeviceRow } from "./components/PushDeviceRow/PushDeviceRow";
import { useNotificationSettings } from "./hooks/useNotificationSettings";

/**
 * The browser has no phone of its own to turn on, so it shows the account's
 * switches and its phones; turning notifications on happens in the app.
 *
 * @returns The card.
 */
export function NotificationSettings() {
  const settings = useNotificationSettings();
  return (
    <section className="space-y-4 rounded-2xl border border-line bg-card p-5" aria-label={PUSH_COPY.settingTitle}>
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">{PUSH_COPY.settingTitle}</h2>
        <p className="text-sm text-ink-soft">{PUSH_COPY.settingHint}</p>
      </div>

      <div>
        <h3 className="font-semibold">{PUSH_COPY.categoriesTitle}</h3>
        {settings.preferencesLoading ? <p className="text-sm text-ink-soft">Loading…</p> : null}
        {settings.preferencesError ? (
          <p role="alert" className="text-sm text-neg-700">
            {settings.preferencesError}{" "}
            <button type="button" className="underline" onClick={settings.retryPreferences}>
              {PUSH_COPY.retry}
            </button>
          </p>
        ) : null}
        {settings.preferences ? (
          <div className="divide-y divide-line">
            {PUSH_CATEGORIES.map((category) => (
              <PushCategorySwitch
                key={category}
                category={category}
                enabled={settings.preferences![category]}
                saving={settings.pendingSwitch === category}
                locked={settings.pendingSwitch !== null && settings.pendingSwitch !== category}
                error={settings.switchErrors[category] ?? ""}
                onChange={(enabled) => void settings.toggle(category, enabled)}
              />
            ))}
          </div>
        ) : null}
      </div>

      <div className="border-t border-line pt-4">
        <h3 className="font-semibold">{PUSH_COPY.phonesTitle}</h3>
        {settings.listNotice ? (
          <p role="status" className="text-sm text-pos-700">
            {settings.listNotice}
          </p>
        ) : null}
        {settings.devicesLoading ? <p className="text-sm text-ink-soft">Loading…</p> : null}
        {settings.devicesError ? (
          <p role="alert" className="text-sm text-neg-700">
            {settings.devicesError}{" "}
            <button type="button" className="underline" onClick={settings.retryDevices}>
              {PUSH_COPY.retry}
            </button>
          </p>
        ) : null}
        {!settings.devicesLoading && !settings.devicesError && settings.devices.length === 0 ? (
          <p className="text-sm text-ink-soft">{PUSH_COPY.noPhones}</p>
        ) : null}
        <ul className="divide-y divide-line">
          {settings.devices.map((device) => (
            <PushDeviceRow
              key={device.id}
              device={device}
              busy={settings.busyDevice === device.id}
              locked={settings.busyDevice !== null && settings.busyDevice !== device.id}
              notice={settings.deviceFeedback[device.id]?.notice ?? ""}
              error={settings.deviceFeedback[device.id]?.error ?? ""}
              onTest={() => void settings.sendTest(device.id)}
              onRemove={() => void settings.remove(device.id)}
            />
          ))}
        </ul>
      </div>
    </section>
  );
}
