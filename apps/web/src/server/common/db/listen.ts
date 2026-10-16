/** A self-healing LISTEN subscription on a dedicated Postgres connection. */

import type { Client } from "pg";
import { dedicatedClient } from "@/server/common/db/db";
import { LISTEN_CHANNEL_PATTERN, LISTEN_RECONNECT_DELAY_MS } from "@/server/common/db/db.constants";
import { logError } from "@/server/common/logger";

/** Handle returned by {@link listen}; stops the subscription for good. */
export interface Subscription {
  /** Ends the connection and cancels any pending reconnect. */
  close(): Promise<void>;
}

/**
 * Subscribes to a NOTIFY channel and keeps the subscription alive across
 * database restarts. A notification raised inside a transaction is delivered
 * only when that transaction commits, so a listener never hears about work
 * that rolled back.
 *
 * Notifications sent while the connection is down are lost; callers must pair
 * this with a periodic sweep rather than rely on it alone.
 *
 * @param channel - Channel name, a plain lowercase identifier.
 * @param onNotify - Called once per notification (and once after each
 *   reconnect, since anything sent during the gap was missed).
 * @returns A handle that closes the subscription.
 */
export function listen(channel: string, onNotify: () => void): Subscription {
  if (!LISTEN_CHANNEL_PATTERN.test(channel)) throw new Error(`invalid LISTEN channel: ${channel}`);
  let client: Client | undefined;
  let reconnectTimer: NodeJS.Timeout | undefined;
  let closed = false;

  /** Schedules one reconnect attempt unless the subscription was closed. */
  const scheduleReconnect = (): void => {
    if (closed || reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = undefined;
      void connect();
    }, LISTEN_RECONNECT_DELAY_MS);
    reconnectTimer.unref();
  };

  /** Opens a fresh connection and LISTENs; failures retry after a delay. */
  const connect = async (): Promise<void> => {
    const candidate = dedicatedClient();
    candidate.on("notification", (message) => {
      if (message.channel === channel) onNotify();
    });
    candidate.on("error", (error) => {
      logError(error, { scope: "pg-listen", channel });
      void candidate.end().catch(() => undefined);
      if (client === candidate) client = undefined;
      scheduleReconnect();
    });
    try {
      await candidate.connect();
      await candidate.query(`LISTEN ${channel}`);
      if (closed) {
        await candidate.end();
        return;
      }
      client = candidate;
      onNotify();
    } catch (error) {
      logError(error, { scope: "pg-listen-connect", channel });
      void candidate.end().catch(() => undefined);
      scheduleReconnect();
    }
  };

  void connect();
  return {
    async close() {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      const current = client;
      client = undefined;
      if (current) await current.end().catch(() => undefined);
    },
  };
}
