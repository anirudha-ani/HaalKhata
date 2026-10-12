/** How each kind of payment detail is typed in a browser. */

import type { DetailInput } from "@haalkhata/shared/payment/detailKinds";

/** What each kind of input asks the browser for: the input type and the phone keyboard. */
export const INPUT_MODES: Record<
  DetailInput,
  { type: string; inputMode: "text" | "email" | "numeric" | "url" | "tel" }
> = {
  text: { type: "text", inputMode: "text" },
  email: { type: "email", inputMode: "email" },
  number: { type: "text", inputMode: "numeric" },
  link: { type: "url", inputMode: "url" },
  phone: { type: "tel", inputMode: "tel" },
  choice: { type: "text", inputMode: "text" },
};

/** Shared look of the form's text inputs; 16px so iOS does not zoom the page on focus. */
export const DETAIL_INPUT_CLASS =
  "w-full min-w-0 rounded-xl border border-line bg-card px-3 py-2 text-base focus:border-brand-500 focus:outline-none";
