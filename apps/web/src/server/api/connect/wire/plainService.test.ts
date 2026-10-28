/**
 * A service served through plainService gets plain numbers in its requests
 * and returns plain numbers, while the wire carries 64-bit integers; a
 * request number that cannot be held exactly never reaches the handler, and
 * a response number that cannot be sent exactly is refused, not rounded.
 */

import { Code, createClient, createRouterTransport } from "@connectrpc/connect";
import { ExpenseService } from "@haalkhata/protogen/expense/v1/expense_pb";
import { describe, expect, it, vi } from "vitest";
import { REQUEST_NUMBER_REFUSED_MESSAGE, RESPONSE_NUMBER_REFUSED_MESSAGE } from "../connect.constants";
import { plainService, type PlainServiceImpl } from "./plainService";

vi.mock("@/server/common/logger", () => ({ logError: vi.fn() }));

/**
 * A raw (bigint) client of an expense service whose handlers are `handlers`.
 *
 * @param handlers - Plain-number handlers for the methods under test.
 * @returns A client speaking the wire's own types.
 */
function wireClient(handlers: Partial<PlainServiceImpl<typeof ExpenseService>>) {
  const transport = createRouterTransport(({ service }) => {
    service(ExpenseService, plainService(ExpenseService, handlers));
  });
  return createClient(ExpenseService, transport);
}

describe("plainService", () => {
  it("hands the handler numbers and sends its numbers as 64-bit integers", async () => {
    const seen = vi.fn();
    const client = wireClient({
      recordSettlement: (request) => {
        seen(request.amountCents);
        return { id: "payment", amountCents: request.amountCents * 2 };
      },
    });

    const payment = await client.recordSettlement({ amountCents: 4_000_000_000_000n, operationId: "op" });

    expect(seen).toHaveBeenCalledWith(4_000_000_000_000);
    expect(payment.amountCents).toBe(8_000_000_000_000n);
  });

  it("converts figures nested in lists of messages", async () => {
    const client = wireClient({
      getGroupBalances: () => ({
        byCurrency: [{ currency: "IDR", nets: [{ userId: "pat", netCents: -2_500_000_000_000 }] }],
      }),
    });

    const balances = await client.getGroupBalances({ groupId: "trip" });

    expect(balances.byCurrency[0].nets[0].netCents).toBe(-2_500_000_000_000n);
  });

  it("refuses a request number past 2^53 before the handler runs", async () => {
    const handler = vi.fn(() => ({}));
    const client = wireClient({ recordSettlement: handler });

    await expect(client.recordSettlement({ amountCents: 2n ** 53n, operationId: "op" })).rejects.toMatchObject({
      code: Code.InvalidArgument,
      rawMessage: REQUEST_NUMBER_REFUSED_MESSAGE,
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it("refuses to send a figure it cannot carry exactly, and logs it", async () => {
    const { logError } = await import("@/server/common/logger");
    const client = wireClient({ getOverallBalances: () => ({ youOweCents: 2 ** 53 + 2 }) });

    await expect(client.getOverallBalances({})).rejects.toMatchObject({
      code: Code.FailedPrecondition,
      rawMessage: RESPONSE_NUMBER_REFUSED_MESSAGE,
    });
    expect(logError).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ rpc: "GetOverallBalances" }));
  });
});
