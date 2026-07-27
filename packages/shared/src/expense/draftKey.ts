/** Stable React keys for draft line items, without depending on crypto.randomUUID. */

/** Monotonic counter behind {@link nextDraftKey}. */
let draftKeySequence = 0;

/**
 * Returns a unique key for a new draft line item.
 *
 * Deliberately a counter rather than `crypto.randomUUID()`, which is absent
 * in both of this project's clients for different reasons:
 *
 * - **Mobile Safari over plain http.** `randomUUID` lives on the Web Crypto
 *   API, which browsers expose only in a *secure context*. `localhost`
 *   counts; `http://192.168.x.x:3000` — how you reach a dev server from a
 *   phone on the same wifi — does not. So `crypto` exists but has no
 *   `randomUUID`, and the itemized editor died with "crypto.randomUUID is not
 *   a function" the moment it built a row.
 * - **Hermes**, the React Native engine, has never implemented it.
 *
 * A counter is not a lesser substitute here — it is the right tool. These
 * keys only have to be distinct among the rows of one draft in one session:
 * `DraftLineItem.key` is documented as "not sent to the server", and
 * `buildItemsPayload` sends `id: ""` for every row. Nothing downstream ever
 * sees it, so there is nothing for randomness to buy.
 *
 * @returns A key unique within this session.
 */
export function nextDraftKey(): string {
  draftKeySequence += 1;
  return `draft-${draftKeySequence}`;
}
