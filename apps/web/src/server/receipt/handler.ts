/** Thin ReceiptService Connect handlers; logic lives in receipt.usecase. */

import type { ServiceImpl } from "@connectrpc/connect";
import type { ReceiptService } from "@haalkhata/protogen/receipt/v1/receipt_pb";
import { parseReceipt } from "@/server/receipt/usecase/receipt.usecase";
import { requireUser, runUsecase } from "@/server/api/connect/context";

/** ReceiptService implementation; authentication happens here, parsing in receipt.usecase. */
export const receiptHandler: ServiceImpl<typeof ReceiptService> = {
  /** Parses an uploaded receipt image into structured line items for the signed-in user. */
  async parseReceipt(request, handlerContext) {
    await requireUser(handlerContext);
    return runUsecase(() => parseReceipt(request.image, request.mediaType), handlerContext);
  },
};
