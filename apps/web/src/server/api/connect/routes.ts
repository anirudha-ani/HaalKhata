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
import { PushService } from "@haalkhata/protogen/push/v1/push_pb";
import { PersonalAnalyticsService } from "@haalkhata/protogen/personalanalytics/v1/personalanalytics_pb";
import { AdminAnalyticsService } from "@haalkhata/protogen/adminanalytics/v1/adminanalytics_pb";
import { AdminModerationService } from "@haalkhata/protogen/adminmoderation/v1/adminmoderation_pb";
import { authHandler, authRequestGate } from "@/server/auth/handler";
import { groupHandler } from "@/server/group/handler";
import { expenseHandler } from "@/server/expense/handler";
import { receiptHandler } from "@/server/receipt/handler";
import { socialHandler, socialRequestGate } from "@/server/social/handler";
import { paymentMethodHandler } from "@/server/payment/handler";
import { pushHandler } from "@/server/push/handler";
import { personalAnalyticsHandler } from "@/server/personalanalytics/handler";
import { adminAnalyticsHandler } from "@/server/adminanalytics/handler";
import { adminModerationHandler } from "@/server/adminmoderation/handler";
import { requireAdminPageRequest } from "./admin/adminRequest";
import { plainService } from "./wire/plainService";
import { EXPENSE_READ_MAX_BYTES, RECEIPT_READ_MAX_BYTES, SOCIAL_READ_MAX_BYTES } from "./connect.constants";

/**
 * Mounts every HaalKhata service implementation on the Connect router.
 *
 * Each service is served through plainService, so its handlers take and
 * return plain numbers where the wire carries 64-bit integers. It gets the
 * mount's options (mountOptions.ts) — a 64 KiB request cap, unknown fields
 * dropped, and a request gate that asks for a signed session before the
 * body is read — and overrides only what differs: a larger cap where a
 * legitimate request needs one, and its own gate where some calls are made
 * without a session.
 *
 * @param router - Connect router that the services are registered on.
 */
export default function routes(router: ConnectRouter): void {
  router.service(AuthService, plainService(AuthService, authHandler), { requestGate: authRequestGate });
  router.service(GroupService, plainService(GroupService, groupHandler));
  router.service(ExpenseService, plainService(ExpenseService, expenseHandler), { readMaxBytes: EXPENSE_READ_MAX_BYTES });
  router.service(ReceiptService, plainService(ReceiptService, receiptHandler), { readMaxBytes: RECEIPT_READ_MAX_BYTES });
  router.service(SocialService, plainService(SocialService, socialHandler), {
    readMaxBytes: SOCIAL_READ_MAX_BYTES,
    requestGate: socialRequestGate,
  });
  router.service(SafetyService, plainService(SafetyService, safetyHandler));
  router.service(PaymentMethodService, plainService(PaymentMethodService, paymentMethodHandler));
  router.service(PushService, plainService(PushService, pushHandler));
  router.service(PersonalAnalyticsService, plainService(PersonalAnalyticsService, personalAnalyticsHandler));
  // These two answer only on the admin hostname; see config/adminSurface.ts.
  // They are reached with the admin session, never the app's, so their gate
  // is the admin page's own host and origin check.
  router.service(AdminAnalyticsService, plainService(AdminAnalyticsService, adminAnalyticsHandler), {
    requestGate: requireAdminPageRequest,
  });
  router.service(AdminModerationService, plainService(AdminModerationService, adminModerationHandler), {
    requestGate: requireAdminPageRequest,
  });
}
