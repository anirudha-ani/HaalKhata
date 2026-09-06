/** Thin ReceiptService Connect handlers; logic lives in receipt.usecase. */

import { Code, ConnectError, type ServiceImpl } from "@connectrpc/connect";
import type { ReceiptService } from "@haalkhata/protogen/receipt/v1/receipt_pb";
import { parseReceipt } from "@/server/receipt/usecase/receipt.usecase";
import { runUsecase } from "@/server/api/connect/context";
import {
  MAX_CONCURRENT_RECEIPT_PARSES,
  requireRateLimitedUser,
  RPC_RATE_LIMITS,
} from "@/server/api/connect/rpcRateLimit";

/** Number of receipt parsing jobs currently holding image/provider resources. */
let activeReceiptParses = 0;

/** ReceiptService implementation; authentication happens here, parsing in receipt.usecase. */
export const receiptHandler: ServiceImpl<typeof ReceiptService> = {
  /**
   * Parses an uploaded receipt image into structured line items for the
   * signed-in user, and hands back the JPEG the provider was shown so the
   * client can display it next to the extracted values. The image is not
   * stored anywhere — it only round-trips through this response.
   */
  async parseReceipt(request, handlerContext) {
    await requireRateLimitedUser(
      handlerContext,
      "parse-receipt",
      RPC_RATE_LIMITS.parseReceipt,
    );
    if (activeReceiptParses >= MAX_CONCURRENT_RECEIPT_PARSES) {
      throw new ConnectError("receipt parsing is busy, please try again", Code.ResourceExhausted);
    }
    activeReceiptParses += 1;
    try {
      return await runUsecase(() => parseReceipt(request.image), handlerContext);
    } finally {
      activeReceiptParses -= 1;
    }
  },
};
