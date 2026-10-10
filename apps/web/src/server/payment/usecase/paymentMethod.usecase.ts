/** Payment-method business logic: a person's own list, the cap on it, and the one-star-per-currency rule. */

import type { PoolClient } from "pg";
import {
  checkPaymentMethod,
  firstPaymentMethodError,
} from "@haalkhata/shared/payment/validateMethod";
import type { PaymentMethodFields } from "@haalkhata/shared/payment/types";
import {
  clearPreferred,
  countPaymentMethods,
  deletePaymentMethod as deletePaymentMethodRow,
  findPaymentMethod,
  insertPaymentMethod,
  listPaymentMethodsByUser,
  setPreferred,
  updatePaymentMethod as updatePaymentMethodRow,
  type PaymentMethodRow,
  type PaymentMethodWrite,
} from "@/server/payment/repo/paymentMethods.repo";
import { newId, transaction } from "@/server/common/db";
import { invalid, notFound, UsecaseError } from "@/server/common/errors";
import { lockPaymentMethods } from "@/server/common/ledgerLocks";
import {
  MAX_PAYMENT_METHODS_PER_USER,
  METHOD_NOT_FOUND_MESSAGE,
} from "@/server/payment/payment.constants";
import { toPaymentMethod } from "./paymentMethod.mapper";

/**
 * Validates what a person typed and returns it ready to store. The validator
 * is the one both clients run for their inline errors, so a request the
 * forms accept is never refused here for a reason they could have shown.
 *
 * @param fields - The method as it arrived in the request.
 * @returns The cleaned method, with an empty currency spelled as null.
 * @throws UsecaseError "invalid_argument" naming the first problem found.
 */
function validatedWrite(fields: PaymentMethodFields): PaymentMethodWrite {
  const check = checkPaymentMethod(fields);
  if (!check.valid) invalid(firstPaymentMethodError(check.errors));
  return {
    name: check.method.name,
    currency: check.method.currency === "" ? null : check.method.currency,
    note: check.method.note,
    details: check.method.details.map((detail) => ({ ...detail })),
  };
}

/**
 * Whether a save changes anything a payer would act on.
 *
 * @param existing - The method as stored.
 * @param write - The method as it would be stored.
 * @returns True when the name, currency, note or any detail differs.
 */
function differs(existing: PaymentMethodRow, write: PaymentMethodWrite): boolean {
  return (
    existing.name !== write.name ||
    existing.currency !== write.currency ||
    existing.note !== write.note ||
    JSON.stringify(existing.details) !== JSON.stringify(write.details)
  );
}

/**
 * Gives a method the star for its currency, taking it from whichever method
 * of the same person held it.
 *
 * @param client - Transaction client holding the owner's payment-methods lock.
 * @param userId - Owner of the methods.
 * @param methodId - Method to star.
 * @param currency - That method's currency bucket; null for any currency.
 */
async function takeStar(
  client: PoolClient,
  userId: string,
  methodId: string,
  currency: string | null,
): Promise<void> {
  await clearPreferred(userId, currency, client);
  await setPreferred(methodId, true, client);
}

/**
 * Lists the caller's own payment methods.
 *
 * @param userId - Id of the authenticated caller.
 * @returns Their methods in proto shape, oldest first.
 */
export async function listMyPaymentMethods(userId: string) {
  return { methods: (await listPaymentMethodsByUser(userId)).map(toPaymentMethod) };
}

/**
 * Lists the payment methods of the person a payer is about to pay.
 *
 * This is the one place another person's methods are read, and it does not
 * decide who may see them: the caller does, and must only call it for a
 * payer who owes the payee (see getFriendLedger). It reads on the caller's
 * client so the methods belong to the same instant as the balances they are
 * shown beside.
 *
 * @param payeeId - Owner of the methods.
 * @param client - The ledger read's snapshot client.
 * @returns The payee's methods in proto shape, oldest first.
 */
export async function listPayeeMethods(payeeId: string, client: PoolClient) {
  return (await listPaymentMethodsByUser(payeeId, client)).map(toPaymentMethod);
}

/**
 * Adds a payment method to the caller's list.
 *
 * @param userId - Id of the authenticated caller.
 * @param input - The method as typed, and whether to star it for its currency.
 * @returns The stored method in proto shape.
 * @throws UsecaseError "invalid_argument" when a field fails the shared
 *   validator; "failed_precondition" when the caller is already at the cap.
 */
export async function createPaymentMethod(
  userId: string,
  input: PaymentMethodFields & { preferred: boolean },
) {
  const write = validatedWrite(input);
  const preset = input.preset.trim() === "" ? null : input.preset.trim();
  return transaction(async (client) => {
    // The count below is only a limit if nothing can be added between
    // reading it and inserting; the lock makes a person's saves take turns.
    await lockPaymentMethods(client, userId);
    if ((await countPaymentMethods(userId, client)) >= MAX_PAYMENT_METHODS_PER_USER) {
      throw new UsecaseError(
        "failed_precondition",
        `you already have ${MAX_PAYMENT_METHODS_PER_USER} payment methods, the most allowed; remove one to add another`,
      );
    }
    if (input.preferred) await clearPreferred(userId, write.currency, client);
    const methodRow = await insertPaymentMethod(
      { ...write, id: newId(), userId, preset, preferred: input.preferred },
      client,
    );
    return toPaymentMethod(methodRow);
  });
}

/**
 * Replaces one of the caller's payment methods with what the form holds.
 *
 * The preset is fixed when a method is created and is not part of the
 * request: a Venmo method cannot be turned into a bank account, because its
 * one detail is what its link is built from.
 *
 * `updated_at` moves only when something a payer would act on changed. It is
 * what tells a payer that details changed recently, so re-saving an untouched
 * form, or only moving the star, must not set that warning off.
 *
 * @param userId - Id of the authenticated caller.
 * @param input - The method's id, its complete new fields, and the star as the form left it.
 * @returns The stored method in proto shape.
 * @throws UsecaseError "not_found" when the caller has no such method;
 *   "invalid_argument" when a field fails the shared validator.
 */
export async function updatePaymentMethod(
  userId: string,
  input: Omit<PaymentMethodFields, "preset"> & { id: string; preferred: boolean },
) {
  return transaction(async (client) => {
    await lockPaymentMethods(client, userId);
    const existing = await findPaymentMethod(input.id, userId, client);
    if (!existing) notFound(METHOD_NOT_FOUND_MESSAGE);
    const write = validatedWrite({ ...input, preset: existing.preset ?? "" });

    // Unstar before the currency can move: a starred method carried into a
    // currency that already has a star would break the unique index, and
    // which of the two keeps it is decided below, not by arrival order.
    if (existing.is_preferred) await setPreferred(existing.id, false, client);
    if (differs(existing, write)) await updatePaymentMethodRow(existing.id, write, client);
    if (input.preferred) await takeStar(client, userId, existing.id, write.currency);

    return toPaymentMethod((await findPaymentMethod(existing.id, userId, client))!);
  });
}

/**
 * Removes one of the caller's payment methods.
 *
 * @param userId - Id of the authenticated caller.
 * @param methodId - Id of the method to remove.
 * @throws UsecaseError "not_found" when the caller has no such method.
 */
export async function deletePaymentMethod(userId: string, methodId: string): Promise<void> {
  if (!(await deletePaymentMethodRow(methodId, userId))) notFound(METHOD_NOT_FOUND_MESSAGE);
}

/**
 * Sets or clears the star on one of the caller's payment methods.
 *
 * @param userId - Id of the authenticated caller.
 * @param input - The method's id and whether it should carry the star.
 * @returns The caller's whole list in proto shape, since starring one method
 *   takes the star from another in the same currency.
 * @throws UsecaseError "not_found" when the caller has no such method.
 */
export async function setPreferredPaymentMethod(
  userId: string,
  input: { id: string; preferred: boolean },
) {
  return transaction(async (client) => {
    await lockPaymentMethods(client, userId);
    const existing = await findPaymentMethod(input.id, userId, client);
    if (!existing) notFound(METHOD_NOT_FOUND_MESSAGE);
    if (input.preferred) await takeStar(client, userId, existing.id, existing.currency);
    else await setPreferred(existing.id, false, client);
    return { methods: (await listPaymentMethodsByUser(userId, client)).map(toPaymentMethod) };
  });
}
