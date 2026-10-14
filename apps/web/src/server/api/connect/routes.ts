/** Registers every service handler on the Connect router. */

import { SafetyService } from "@haalkhata/protogen/safety/v1/safety_pb";
import { safetyHandler } from "@/server/safety/handler";
import type { ConnectRouter } from "@connectrpc/connect";
import { AuthService } from "@haalkhata/protogen/auth/v1/auth_pb";
import { GroupService } from "@haalkhata/protogen/group/v1/group_pb";
import { ExpenseService } from "@haalkhata/protogen/expense/v1/expense_pb";
import { ReceiptService } from "@haalkhata/protogen/receipt/v1/receipt_pb";
import { SocialService } from "@haalkhata/protogen/social/v1/social_pb";
import { PaymentMethodService } from "@haalkhata/protogen/payment/v1/payment_pb";
import { authHandler } from "@/server/auth/handler";
import { groupHandler } from "@/server/group/handler";
import { expenseHandler } from "@/server/expense/handler";
import { receiptHandler } from "@/server/receipt/handler";
import { socialHandler } from "@/server/social/handler";
import { paymentMethodHandler } from "@/server/payment/handler";

/**
 * Mounts every HaalKhata service implementation on the Connect router.
 *
 * @param router - Connect router that the services are registered on.
 */
export default function routes(router: ConnectRouter): void {
  router.service(AuthService, authHandler);
  router.service(GroupService, groupHandler);
  router.service(ExpenseService, expenseHandler);
  router.service(ReceiptService, receiptHandler);
  router.service(SocialService, socialHandler);
  router.service(SafetyService, safetyHandler);
  router.service(PaymentMethodService, paymentMethodHandler);
}
