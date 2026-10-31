/** Thin PaymentMethodService Connect handlers; logic lives in paymentMethod.usecase. */

import type { PlainServiceImpl } from "@/server/api/connect/wire/plainService";
import type { PaymentMethodService } from "@haalkhata/protogen/payment/v1/payment_pb";
import * as paymentMethods from "@/server/payment/usecase/paymentMethod.usecase";
import { requireUser, runUsecase } from "@/server/api/connect/context";
import { requireRateLimitedUser, RPC_RATE_LIMITS } from "@/server/api/connect/rateLimit/rpcRateLimit";
import { PAYMENT_METHOD_WRITE_SCOPE } from "@/server/payment/payment.constants";

/**
 * ConnectRPC implementation of PaymentMethodService. Every method acts on
 * the caller's own methods: it authenticates through {@link requireUser}
 * (the writes through {@link requireRateLimitedUser}, sharing one bucket) and
 * delegates to the usecase inside {@link runUsecase}, which maps
 * UsecaseError to ConnectError.
 */
export const paymentMethodHandler: PlainServiceImpl<typeof PaymentMethodService> = {
  /** Lists the caller's own payment methods, oldest first. */
  async listMyPaymentMethods(_request, context) {
    return runUsecase(
      async () => paymentMethods.listMyPaymentMethods(await requireUser(context)),
      context,
    );
  },

  /** Adds a payment method to the caller's list. */
  async createPaymentMethod(request, context) {
    return runUsecase(
      async () =>
        paymentMethods.createPaymentMethod(
          await requireRateLimitedUser(
            context,
            PAYMENT_METHOD_WRITE_SCOPE,
            RPC_RATE_LIMITS.writePaymentMethod,
          ),
          request,
        ),
      context,
    );
  },

  /** Replaces one of the caller's payment methods with what the form holds. */
  async updatePaymentMethod(request, context) {
    return runUsecase(
      async () =>
        paymentMethods.updatePaymentMethod(
          await requireRateLimitedUser(
            context,
            PAYMENT_METHOD_WRITE_SCOPE,
            RPC_RATE_LIMITS.writePaymentMethod,
          ),
          request,
        ),
      context,
    );
  },

  /** Removes one of the caller's payment methods. */
  async deletePaymentMethod(request, context) {
    await runUsecase(
      async () =>
        paymentMethods.deletePaymentMethod(
          await requireRateLimitedUser(
            context,
            PAYMENT_METHOD_WRITE_SCOPE,
            RPC_RATE_LIMITS.writePaymentMethod,
          ),
          request.id,
        ),
      context,
    );
    return {};
  },

  /** Sets or clears the star on one of the caller's payment methods. */
  async setPreferredPaymentMethod(request, context) {
    return runUsecase(
      async () =>
        paymentMethods.setPreferredPaymentMethod(
          await requireRateLimitedUser(
            context,
            PAYMENT_METHOD_WRITE_SCOPE,
            RPC_RATE_LIMITS.writePaymentMethod,
          ),
          request,
        ),
      context,
    );
  },
};
