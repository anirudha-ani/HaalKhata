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
  findPaymentMethod: vi.fn(),
  insertPaymentMethod: vi.fn(),
  listPaymentMethodsByUser: vi.fn(),
  setPreferred: vi.fn(),
  updatePaymentMethod: vi.fn(),
}));
vi.mock("@/server/common/ledgerLocks", () => ({ lockPaymentMethods: vi.fn() }));
vi.mock("@/server/common/db", () => ({
  newId: vi.fn(() => "method-new"),
  transaction: vi.fn((operation: (client: PoolClient) => Promise<unknown>) =>
    operation(transactionClient),
  ),
}));

import {
  clearPreferred,
  countPaymentMethods,
  deletePaymentMethod as deletePaymentMethodRow,
  findPaymentMethod,
  insertPaymentMethod,
  listPaymentMethodsByUser,
  setPreferred,
  updatePaymentMethod as updatePaymentMethodRow,
} from "@/server/payment/repo/paymentMethods.repo";
import { lockPaymentMethods } from "@/server/common/ledgerLocks";
import {
  createPaymentMethod,
  deletePaymentMethod,
  listMyPaymentMethods,
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
      transactionClient,
    );
  });

  it("only moving the star does not rewrite the row", async () => {
    await updatePaymentMethod(CALLER, { ...update, preferred: true });

    expect(updatePaymentMethodRow).not.toHaveBeenCalled();
    expect(writeOrder()).toEqual(["clearPreferred(BDT)", "setPreferred(true)"]);
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
  it("deletes a method scoped to the caller", async () => {
    await deletePaymentMethod(CALLER, "method-bkash");
    expect(deletePaymentMethodRow).toHaveBeenCalledWith("method-bkash", CALLER);
  });

  it("reports not found when nothing of the caller's was deleted", async () => {
    vi.mocked(deletePaymentMethodRow).mockResolvedValue(false);

    await expect(deletePaymentMethod(CALLER, "method-other")).rejects.toMatchObject({
      code: "not_found",
    });
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
