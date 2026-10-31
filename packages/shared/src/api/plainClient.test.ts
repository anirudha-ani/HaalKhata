/**
 * A plain client sends numbers as the API's 64-bit integers and reads them
 * back as numbers, through a real Connect transport, and turns a number it
 * cannot carry exactly into a ConnectError a screen shows.
 */

import { Code, ConnectError, createClient, createRouterTransport } from "@connectrpc/connect";
import { ExpenseService } from "@haalkhata/protogen/expense/v1/expense_pb";
import { describe, expect, it, vi } from "vitest";
import { plainClient } from "./plainClient";
import { REQUEST_NUMBER_REFUSED, RESPONSE_NUMBER_REFUSED } from "./wireNumbers.constants";

/**
 * A client for an in-memory expense service that answers the overall
 * balances with `owed` and records what a settlement asked for.
 *
 * @param owed - What the server says the caller owes, as the wire carries it.
 * @returns The plain client and the spy the settlement handler reports to.
 */
function clientAnswering(owed: bigint) {
  const received = vi.fn();
  const transport = createRouterTransport(({ service }) => {
    service(ExpenseService, {
      getOverallBalances: () => ({ youOweCents: owed, totals: [{ currency: "IDR", youOweCents: owed }] }),
      recordSettlement: (request) => {
        received(request.amountCents);
        return { id: "payment", amountCents: request.amountCents };
      },
    });
  });
  return { client: plainClient(ExpenseService, createClient(ExpenseService, transport)), received };
}

describe("plainClient", () => {
  it("reads 64-bit figures as numbers, nested ones included", async () => {
    const { client } = clientAnswering(4_000_000_000_000n);

    const balances = await client.getOverallBalances({});

    expect(balances.youOweCents).toBe(4_000_000_000_000);
    expect(balances.totals[0]).toMatchObject({ currency: "IDR", youOweCents: 4_000_000_000_000 });
  });

  it("sends numbers as 64-bit integers", async () => {
    const { client, received } = clientAnswering(0n);

    const payment = await client.recordSettlement({ toUserId: "sam", amountCents: 10_000_000_000_000, operationId: "op" });

    expect(received).toHaveBeenCalledWith(10_000_000_000_000n);
    expect(payment.amountCents).toBe(10_000_000_000_000);
  });

  it("refuses to send a number it cannot carry exactly, and sends nothing", async () => {
    const { client, received } = clientAnswering(0n);

    const sending = client.recordSettlement({ toUserId: "sam", amountCents: 12.5, operationId: "op" });

    await expect(sending).rejects.toBeInstanceOf(ConnectError);
    await expect(sending).rejects.toMatchObject({ code: Code.InvalidArgument, rawMessage: REQUEST_NUMBER_REFUSED });
    expect(received).not.toHaveBeenCalled();
  });

  it("reports a figure too large to show exactly instead of showing it rounded", async () => {
    const { client } = clientAnswering(2n ** 60n);

    await expect(client.getOverallBalances({})).rejects.toMatchObject({
      code: Code.DataLoss,
      rawMessage: RESPONSE_NUMBER_REFUSED,
    });
  });
});
