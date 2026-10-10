/** Constants for the add-and-edit payment method dialog. */

import type { PaymentMethodErrors } from "@haalkhata/shared/payment/validateMethod";

/**
 * The starting point the add dialog opens on. A wallet reached by phone is
 * the most common method outside the built-in apps, and opening on a filled
 * in shape shows what the form is for before anything is picked.
 */
export const DEFAULT_TEMPLATE_KEY = "wallet";

/** What the form shows before the first save attempt: no errors at all. */
export const NO_ERRORS: PaymentMethodErrors = { detailRows: {} };

/**
 * Id of the dialog's form. The Save button sits in the dialog's pinned
 * footer, outside the form element, and submits it by this id.
 */
export const PAYMENT_METHOD_FORM_ID = "payment-method-form";
