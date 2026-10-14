/** Constants for the receipt picker. */

/**
 * `accept` for the receipt file inputs.
 *
 * Both the MIME types and the bare extensions are listed: iOS reports a HEIC
 * pulled from the photo library with an empty or unexpected type, so a
 * MIME-only accept list greys it out in the picker — the one format an iPhone
 * shoots by default becomes the one you cannot choose.
 */
export const ACCEPTED_IMAGE_INPUT =
  "image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,.heic,.heif,.jpg,.jpeg,.png";
