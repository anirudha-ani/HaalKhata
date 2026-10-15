/** Thin ReceiptService Connect handlers; logic lives in receipt.usecase. */

import { Code, ConnectError, type ServiceImpl } from "@connectrpc/connect";
import type { ReceiptService } from "@haalkhata/protogen/receipt/v1/receipt_pb";
import { parseReceiptWithConsent, getReceiptProcessingInfo, grantReceiptConsent, revokeReceiptConsent } from "@/server/receipt/usecase/receiptConsent.usecase";
import { requireUser, runUsecase } from "@/server/api/connect/context";
import {
  MAX_CONCURRENT_RECEIPT_PARSES,
  requireRateLimitedUser,
  RPC_RATE_LIMITS,
} from "@/server/api/connect/rpcRateLimit";

/** Number of receipt parsing jobs currently holding image/provider resources. */
let activeReceiptParses = 0;

/** ReceiptService implementation; authentication happens here, parsing in receipt.usecase. */
export const receiptHandler: ServiceImpl<typeof ReceiptService> = {
  /** Returns processor disclosure before any photo leaves the device. */
  async getProcessingInfo(_request, handlerContext) {
    return runUsecase(async () => getReceiptProcessingInfo(await requireUser(handlerContext)), handlerContext);
  },
  /** Saves permission for future receipt scans on the signed-in account. */
  async grantConsent(request, handlerContext) {
    return runUsecase(async () => grantReceiptConsent(await requireUser(handlerContext), request.consentVersion), handlerContext);
  },
  /** Withdraws permission across all devices signed in to this account. */
  async revokeConsent(_request, handlerContext) {
    return runUsecase(async () => revokeReceiptConsent(await requireUser(handlerContext)), handlerContext);
  },
  /**
   * Parses an uploaded receipt image into structured line items for the
   * signed-in user, and hands back the JPEG the provider was shown so the
   * client can display it next to the extracted values. The image is not
   * stored anywhere — it only round-trips through this response.
   */
  async parseReceipt(request, handlerContext) {
    const userId = await requireRateLimitedUser(
      handlerContext,
      "parse-receipt",
      RPC_RATE_LIMITS.parseReceipt,
    );
    if (activeReceiptParses >= MAX_CONCURRENT_RECEIPT_PARSES) {
      throw new ConnectError("receipt parsing is busy, please try again", Code.ResourceExhausted);
    }
    activeReceiptParses += 1;
    try {
      return await runUsecase(() => parseReceiptWithConsent(userId, request.image, request.consentVersion), handlerContext);
    } finally {
      activeReceiptParses -= 1;
    }
  },
};
