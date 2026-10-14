/** Unit tests for the payment-method usecase: ownership, the cap, and how the star moves. */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PoolClient } from "pg";
import type { PaymentMethodRow } from "@/server/payment/repo/paymentMethods.repo";

const { transactionClient } = vi.hoisted(() => ({
  transactionClient: { query: vi.fn() } as unknown as PoolClient,
}));

vi.mock("@/server/payment/repo/paymentMethods.repo", () => ({
  clearPreferred: vi.fn(),
  countPaymentMethods: vi.fn(),
  deletePaymentMethod: vi.fn(),
  findMethodRemoval: vi.fn(),
  findPaymentMethod: vi.fn(),
  forgetLegacyHandle: vi.fn(),
  insertPaymentMethod: vi.fn(),
  listPaymentMethodsByUser: vi.fn(),
  recordMethodRemoval: vi.fn(),
  setPreferred: vi.fn(),
  updatePaymentMethod: vi.fn(),
}));
vi.mock("@/server/common/ledger/ledgerLocks", () => ({ lockPaymentMethods: vi.fn() }));
vi.mock("@/server/common/db/db", () => ({
  newId: vi.fn(() => "method-new"),
  transaction: vi.fn((operation: (client: PoolClient) => Promise<unknown>) =>
    operation(transactionClient),
  ),
}));

import {
  clearPreferred,
  countPaymentMethods,
  deletePaymentMethod as deletePaymentMethodRow,
  findMethodRemoval,
  findPaymentMethod,
  forgetLegacyHandle,
  insertPaymentMethod,
  listPaymentMethodsByUser,
  recordMethodRemoval,
  setPreferred,
  updatePaymentMethod as updatePaymentMethodRow,
} from "@/server/payment/repo/paymentMethods.repo";
import { lockPaymentMethods } from "@/server/common/ledger/ledgerLocks";
import {
  createPaymentMethod,
  deletePaymentMethod,
  listMyPaymentMethods,
  listPayeeMethods,
  setPreferredPaymentMethod,
  updatePaymentMethod,
} from "./paymentMethod.usecase";

const CALLER = "user-caller";

/** A stored bKash method the tests edit, star and delete. */
const bkashRow: PaymentMethodRow = {
  id: "method-bkash",
  user_id: CALLER,
  name: "bKash",
  currency: "BDT",
  preset: null,
  note: "",
  is_preferred: false,
  preferred_at: null,
  created_at: "2026-10-01T00:00:00.000Z",
  updated_at: "2026-10-01T00:00:00.000Z",
  details: [{ kind: "phone", label: "", value: "+8801712345678" }],
};

/** A request body for the same method, as the form would send it. */
const bkashInput = {
  name: "bKash",
  currency: "BDT",
  preset: "",
  details: [{ kind: "phone", label: "", value: "+8801712345678" }],
  note: "",
  preferred: false,
};

/**
 * Records the order repo writes were made in, by function name.
 *
 * @returns The names of the star and update calls, in call order.
 */
function writeOrder(): string[] {
  const calls = [
    ...vi.mocked(setPreferred).mock.invocationCallOrder.map((order, index) => ({
      order,
      name: `setPreferred(${String(vi.mocked(setPreferred).mock.calls[index]?.[1])})`,
    })),
    ...vi.mocked(updatePaymentMethodRow).mock.invocationCallOrder.map((order) => ({
      order,
      name: "update",
    })),
    ...vi.mocked(clearPreferred).mock.invocationCallOrder.map((order, index) => ({
      order,
      name: `clearPreferred(${String(vi.mocked(clearPreferred).mock.calls[index]?.[1])})`,
    })),
  ];
  return calls.sort((left, right) => left.order - right.order).map((call) => call.name);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(countPaymentMethods).mockResolvedValue(0);
  vi.mocked(findPaymentMethod).mockResolvedValue(bkashRow);
  vi.mocked(insertPaymentMethod).mockResolvedValue(bkashRow);
  vi.mocked(listPaymentMethodsByUser).mockResolvedValue([bkashRow]);
  vi.mocked(deletePaymentMethodRow).mockResolvedValue(true);
  vi.mocked(updatePaymentMethodRow).mockResolvedValue(true);
});

describe("listMyPaymentMethods", () => {
  it("returns the caller's methods in proto shape, with nulls spelled as empty strings", async () => {
    vi.mocked(listPaymentMethodsByUser).mockResolvedValue([
      { ...bkashRow, currency: null, preset: null, is_preferred: true },
    ]);

    expect(await listMyPaymentMethods(CALLER)).toEqual({
      methods: [
        {
          id: "method-bkash",
          name: "bKash",
          currency: "",
          preset: "",
          details: [{ kind: "phone", label: "", value: "+8801712345678" }],
          note: "",
          preferred: true,
          updatedAt: "2026-10-01T00:00:00.000Z",
          createdAt: "2026-10-01T00:00:00.000Z",
          preferredAt: "",
        },
      ],
    });
    expect(listPaymentMethodsByUser).toHaveBeenCalledWith(CALLER);
  });
});

describe("createPaymentMethod", () => {
  it("stores the cleaned method under the caller, behind their lock", async () => {
    await createPaymentMethod(CALLER, {
      ...bkashInput,
      name: "  bKash ",
      currency: "bdt",
      details: [
        { kind: "phone", label: "", value: "+880 1712-345678" },
        { kind: "email", label: "", value: "   " },
      ],
    });

    expect(lockPaymentMethods).toHaveBeenCalledWith(transactionClient, CALLER);
    expect(insertPaymentMethod).toHaveBeenCalledWith(
      {
        id: "method-new",
        userId: CALLER,
        name: "bKash",
        currency: "BDT",
        preset: null,
        note: "",
        details: [{ kind: "phone", label: "", value: "+8801712345678" }],
        preferred: false,
      },
      transactionClient,
    );
    expect(clearPreferred).not.toHaveBeenCalled();
  });

  it("stores an empty currency as null, the any-currency bucket", async () => {
    await createPaymentMethod(CALLER, {
      ...bkashInput,
      name: "PayPal",
      currency: "",
      preset: "paypal",
      details: [{ kind: "username", label: "", value: "paypal.me/jordanlee" }],
    });

    expect(vi.mocked(insertPaymentMethod).mock.calls[0]?.[0]).toMatchObject({
      currency: null,
      preset: "paypal",
      details: [{ kind: "username", label: "", value: "jordanlee" }],
    });
  });

  it("takes the star from the method that held it for that currency", async () => {
    await createPaymentMethod(CALLER, { ...bkashInput, preferred: true });

    expect(clearPreferred).toHaveBeenCalledWith(CALLER, "BDT", transactionClient);
    expect(vi.mocked(clearPreferred).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(insertPaymentMethod).mock.invocationCallOrder[0]!,
    );
    expect(vi.mocked(insertPaymentMethod).mock.calls[0]?.[0]).toMatchObject({ preferred: true });
  });

  it("refuses the thirteenth method", async () => {
    vi.mocked(countPaymentMethods).mockResolvedValue(12);

    await expect(createPaymentMethod(CALLER, bkashInput)).rejects.toMatchObject({
      code: "failed_precondition",
    });
    expect(insertPaymentMethod).not.toHaveBeenCalled();
  });

  it("allows the twelfth", async () => {
    vi.mocked(countPaymentMethods).mockResolvedValue(11);

    await createPaymentMethod(CALLER, bkashInput);
    expect(insertPaymentMethod).toHaveBeenCalled();
  });

  it("refuses invalid input before opening a transaction", async () => {
    await expect(
      createPaymentMethod(CALLER, { ...bkashInput, name: "" }),
    ).rejects.toMatchObject({ code: "invalid_argument", message: "give this method a name" });
    await expect(
      createPaymentMethod(CALLER, { ...bkashInput, details: [] }),
    ).rejects.toMatchObject({ code: "invalid_argument" });
    expect(lockPaymentMethods).not.toHaveBeenCalled();
    expect(insertPaymentMethod).not.toHaveBeenCalled();
  });
});

describe("updatePaymentMethod", () => {
  const update = { ...bkashInput, id: "method-bkash" };

  it("reads a method that is not the caller's as not found", async () => {
    vi.mocked(findPaymentMethod).mockResolvedValue(undefined);

    await expect(updatePaymentMethod(CALLER, update)).rejects.toMatchObject({
      code: "not_found",
    });
    expect(findPaymentMethod).toHaveBeenCalledWith("method-bkash", CALLER, transactionClient);
    expect(updatePaymentMethodRow).not.toHaveBeenCalled();
  });

  it("leaves the row, and so its changed-at stamp, alone when nothing changed", async () => {
    await updatePaymentMethod(CALLER, update);

    expect(updatePaymentMethodRow).not.toHaveBeenCalled();
    expect(setPreferred).not.toHaveBeenCalled();
  });

  it("rewrites the row when a detail changes", async () => {
    await updatePaymentMethod(CALLER, {
      ...update,
      details: [{ kind: "phone", label: "", value: "+8801812345678" }],
      note: " Use Send Money ",
    });

    expect(updatePaymentMethodRow).toHaveBeenCalledWith(
      "method-bkash",
      {
        name: "bKash",
        currency: "BDT",
        note: "Use Send Money",
        details: [{ kind: "phone", label: "", value: "+8801812345678" }],
      },
      CALLER,
      transactionClient,
    );
    // The handle it may have been copied from is out of date now.
    expect(forgetLegacyHandle).toHaveBeenCalledWith("method-bkash", CALLER, transactionClient);
  });

  it("reads a method removed in the middle of the edit as not found, not as a failure", async () => {
    vi.mocked(updatePaymentMethodRow).mockResolvedValue(false);

    await expect(
      updatePaymentMethod(CALLER, { ...update, note: "changed" }),
    ).rejects.toMatchObject({ code: "not_found" });
    expect(forgetLegacyHandle).not.toHaveBeenCalled();
  });

  it("only moving the star does not rewrite the row", async () => {
    await updatePaymentMethod(CALLER, { ...update, preferred: true });

    expect(updatePaymentMethodRow).not.toHaveBeenCalled();
    expect(writeOrder()).toEqual(["clearPreferred(BDT)", "setPreferred(true)"]);
  });

  it("a starred method re-saved with its star keeps the star, and the star's time, untouched", async () => {
    vi.mocked(findPaymentMethod).mockResolvedValue({
      ...bkashRow,
      is_preferred: true,
      preferred_at: "2026-01-01T00:00:00.000Z",
    });

    await updatePaymentMethod(CALLER, { ...update, note: "changed", preferred: true });

    expect(writeOrder()).toEqual(["update"]);
  });

  it("gives the star up when the form unticks it", async () => {
    vi.mocked(findPaymentMethod).mockResolvedValue({ ...bkashRow, is_preferred: true });

    await updatePaymentMethod(CALLER, { ...update, preferred: false });

    expect(writeOrder()).toEqual(["setPreferred(false)"]);
  });

  it("unstars before moving a starred method into a currency that may already have a star", async () => {
    vi.mocked(findPaymentMethod).mockResolvedValue({ ...bkashRow, is_preferred: true });

    await updatePaymentMethod(CALLER, { ...update, currency: "USD", preferred: true });

    expect(writeOrder()).toEqual([
      "setPreferred(false)",
      "update",
      "clearPreferred(USD)",
      "setPreferred(true)",
    ]);
  });

  it("validates against the stored preset, which the request cannot change", async () => {
    vi.mocked(findPaymentMethod).mockResolvedValue({
      ...bkashRow,
      name: "Venmo",
      currency: "USD",
      preset: "venmo",
      details: [{ kind: "username", label: "", value: "jordan-lee" }],
    });

    await expect(
      updatePaymentMethod(CALLER, {
        ...update,
        name: "Venmo",
        currency: "USD",
        details: [{ kind: "account_number", label: "", value: "000123454821" }],
      }),
    ).rejects.toMatchObject({ code: "invalid_argument" });
    expect(updatePaymentMethodRow).not.toHaveBeenCalled();
  });
});

describe("deletePaymentMethod", () => {
  it("deletes a method scoped to the caller, taking turns with their other writes", async () => {
    await deletePaymentMethod(CALLER, "method-bkash");

    expect(lockPaymentMethods).toHaveBeenCalledWith(transactionClient, CALLER);
    expect(deletePaymentMethodRow).toHaveBeenCalledWith("method-bkash", CALLER, transactionClient);
    expect(vi.mocked(lockPaymentMethods).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(deletePaymentMethodRow).mock.invocationCallOrder[0]!,
    );
  });

  it("removes the old handle the method was copied from", async () => {
    await deletePaymentMethod(CALLER, "method-bkash");
    expect(forgetLegacyHandle).toHaveBeenCalledWith("method-bkash", CALLER, transactionClient);
  });

  it("remembers the removal, so a method added in its place is not shown as merely new", async () => {
    await deletePaymentMethod(CALLER, "method-bkash");
    expect(recordMethodRemoval).toHaveBeenCalledWith(CALLER, transactionClient);
  });

  it("reports not found when nothing of the caller's was deleted", async () => {
    vi.mocked(deletePaymentMethodRow).mockResolvedValue(false);

    await expect(deletePaymentMethod(CALLER, "method-other")).rejects.toMatchObject({
      code: "not_found",
    });
    expect(forgetLegacyHandle).not.toHaveBeenCalled();
    expect(recordMethodRemoval).not.toHaveBeenCalled();
  });
});

describe("listPayeeMethods", () => {
  it("returns the payee's methods with the time of their last removal, read on the snapshot", async () => {
    vi.mocked(findMethodRemoval).mockResolvedValue("2026-10-09T08:00:00.000Z");

    const payee = await listPayeeMethods("user-payee", transactionClient);

    expect(listPaymentMethodsByUser).toHaveBeenCalledWith("user-payee", transactionClient);
    expect(findMethodRemoval).toHaveBeenCalledWith("user-payee", transactionClient);
    expect(payee.methods).toHaveLength(1);
    expect(payee.removedAt).toBe("2026-10-09T08:00:00.000Z");
  });

  it("says nothing about removals for someone who never removed a method", async () => {
    vi.mocked(findMethodRemoval).mockResolvedValue(undefined);
    expect((await listPayeeMethods("user-payee", transactionClient)).removedAt).toBe("");
  });
});

describe("setPreferredPaymentMethod", () => {
  it("clears the method's currency bucket, stars it, and returns the whole list", async () => {
    const result = await setPreferredPaymentMethod(CALLER, {
      id: "method-bkash",
      preferred: true,
    });

    expect(lockPaymentMethods).toHaveBeenCalledWith(transactionClient, CALLER);
    expect(writeOrder()).toEqual(["clearPreferred(BDT)", "setPreferred(true)"]);
    expect(listPaymentMethodsByUser).toHaveBeenCalledWith(CALLER, transactionClient);
    expect(result.methods).toHaveLength(1);
  });

  it("stars an any-currency method within the any-currency bucket", async () => {
    vi.mocked(findPaymentMethod).mockResolvedValue({ ...bkashRow, currency: null });

    await setPreferredPaymentMethod(CALLER, { id: "method-bkash", preferred: true });

    expect(clearPreferred).toHaveBeenCalledWith(CALLER, null, transactionClient);
  });

  it("starring a method that already has the star changes nothing", async () => {
    vi.mocked(findPaymentMethod).mockResolvedValue({
      ...bkashRow,
      is_preferred: true,
      preferred_at: "2026-01-01T00:00:00.000Z",
    });

    await setPreferredPaymentMethod(CALLER, { id: "method-bkash", preferred: true });

    expect(writeOrder()).toEqual([]);
  });

  it("clearing the star touches only that method", async () => {
    await setPreferredPaymentMethod(CALLER, { id: "method-bkash", preferred: false });

    expect(writeOrder()).toEqual(["setPreferred(false)"]);
  });

  it("refuses a method that is not the caller's", async () => {
    vi.mocked(findPaymentMethod).mockResolvedValue(undefined);

    await expect(
      setPreferredPaymentMethod(CALLER, { id: "method-other", preferred: true }),
    ).rejects.toMatchObject({ code: "not_found" });
    expect(setPreferred).not.toHaveBeenCalled();
  });
});
