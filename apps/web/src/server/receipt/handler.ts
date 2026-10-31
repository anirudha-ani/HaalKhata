/** Thin ReceiptService Connect handlers; logic lives in receipt.usecase. */

import type { PlainServiceImpl } from "@/server/api/connect/wire/plainService";
import type { ReceiptService } from "@haalkhata/protogen/receipt/v1/receipt_pb";
import { parseReceiptWithConsent, getReceiptProcessingInfo, grantReceiptConsent, revokeReceiptConsent } from "@/server/receipt/usecase/receiptConsent.usecase";
import { requireUser, runUsecase } from "@/server/api/connect/context";

/** ReceiptService implementation; authentication happens here, parsing in receipt.usecase. */
export const receiptHandler: PlainServiceImpl<typeof ReceiptService> = {
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
   * stored anywhere — it only round-trips through this response. The attempt
   * itself is counted (who, when, whether it worked), nothing about the bill.
   */
  async parseReceipt(request, handlerContext) {
    // Which scans run, wait or are refused, and what a scan costs the
    // person's per-minute allowance, is the usecase's: it spends the
    // allowance only once the scan has a lane. The request's signal stops the
    // scan when the person goes away.
    return runUsecase(
      async () =>
        parseReceiptWithConsent(
          await requireUser(handlerContext),
          request.image,
          request.consentVersion,
          request.currency,
          handlerContext.signal,
        ),
      handlerContext,
    );
  },
};
