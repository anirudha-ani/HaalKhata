/** Constants for the email-or-phone field: the two halves of its toggle. */

import type { ContactMode } from "@haalkhata/shared/phone/contact";

/** The two halves of the toggle, in the order they render. */
export const CONTACT_MODES: { key: ContactMode; label: string }[] = [
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
];
