/** Payment domain constants. */

import {
  MAX_PAYMENT_DETAILS_PER_METHOD,
  MAX_PAYMENT_METHODS_PER_USER,
} from "@haalkhata/shared/payment/payment.constants";

/**
 * How many methods one person keeps and how many details one method carries.
 * Defined once in the shared package and re-exported here, so both clients
 * stop offering "Add" at exactly the count the server refuses.
 */
export { MAX_PAYMENT_DETAILS_PER_METHOD, MAX_PAYMENT_METHODS_PER_USER };

/** Rate-limit bucket shared by every RPC that changes the caller's payment methods. */
export const PAYMENT_METHOD_WRITE_SCOPE = "write-payment-method";

/**
 * Said for a method that does not exist and for one that belongs to somebody
 * else alike, so the answer never confirms that an id is real.
 */
export const METHOD_NOT_FOUND_MESSAGE = "payment method not found";
