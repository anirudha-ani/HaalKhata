/** Constants for the add-and-edit payment method dialog. */

/**
 * Id of the dialog's form. The Save button sits in the dialog's pinned
 * footer, outside the form element, and submits it by this id.
 */
export const PAYMENT_METHOD_FORM_ID = "payment-method-form";

/**
 * Selector for the form's error messages. Each one carries a
 * `data-form-error` attribute, so a refused save can find the first and
 * bring it into view.
 */
export const FORM_ERROR_SELECTOR = "[data-form-error]";
