/** Starting points for a new payment method: what the add form opens with for a wallet, a bank account, or one of the built-in apps. */

import { HANDLE_METHODS, findPaymentMethod } from "./methods";
import type { PaymentMethodFields } from "./types";

/** One starting point offered when adding a payment method. */
export interface MethodTemplate {
  /** Stable key of the starting point. */
  key: string;
  /** Text on its chip. */
  label: string;
  /** The built-in app it creates, or "" for a method the person defines. */
  preset: string;
  /** Method name the form opens with; "" leaves the name to the person. */
  name: string;
  /**
   * Currency the form opens with: a code, "" for any currency, or null to
   * start on the person's own default currency.
   */
  currency: string | null;
  /** Kinds of the detail rows the form opens with, in order. */
  detailKinds: readonly string[];
  /**
   * The only kinds a detail of this method may take. Empty means every kind,
   * which is the case for anything the person defines. A built-in app is
   * narrower, because its link is built from one known identifier.
   */
  allowedKinds: readonly string[];
}

/** Template key of the free-form starting point. */
export const CUSTOM_TEMPLATE_KEY = "custom";

/**
 * The kinds a built-in app's one detail may take. Zelle is reached by
 * whichever of an email or a phone the recipient registered with their bank;
 * the rest are found by username.
 */
const PRESET_DETAIL_KINDS: Readonly<Record<string, readonly string[]>> = {
  venmo: ["username"],
  zelle: ["email", "phone"],
  cashapp: ["username"],
  paypal: ["username"],
};

/** Keys of the built-in apps, in the order they are offered. */
export const PRESET_KEYS: readonly string[] = HANDLE_METHODS.map((method) => method.key);

/**
 * Currency a built-in app starts on. PayPal moves money in most currencies;
 * the other three are US dollar services.
 */
const PRESET_CURRENCIES: Readonly<Record<string, string>> = {
  venmo: "USD",
  zelle: "USD",
  cashapp: "USD",
  paypal: "",
};

/**
 * Every starting point, in the order the add form offers them: the built-in
 * apps first, Venmo and Zelle leading because they are what most people
 * here are paid with, then the two open-ended shapes that cover everything
 * else (a wallet such as bKash, a bank account in any country), then the
 * blank one.
 */
export const METHOD_TEMPLATES: readonly MethodTemplate[] = [
  ...PRESET_KEYS.map((presetKey) => ({
    key: presetKey,
    label: findPaymentMethod(presetKey)?.label ?? presetKey,
    preset: presetKey,
    name: findPaymentMethod(presetKey)?.label ?? presetKey,
    currency: PRESET_CURRENCIES[presetKey] ?? "",
    detailKinds: (PRESET_DETAIL_KINDS[presetKey] ?? []).slice(0, 1),
    allowedKinds: PRESET_DETAIL_KINDS[presetKey] ?? [],
  })),
  {
    key: "wallet",
    label: "Mobile wallet or app",
    preset: "",
    name: "",
    currency: null,
    detailKinds: ["phone"],
    allowedKinds: [],
  },
  {
    key: "bank",
    label: "Bank account",
    preset: "",
    name: "",
    currency: null,
    detailKinds: [
      "account_name",
      "bank_name",
      "account_type",
      "account_number",
      "routing_number",
      "swift",
    ],
    allowedKinds: [],
  },
  {
    key: CUSTOM_TEMPLATE_KEY,
    label: "Something else",
    preset: "",
    name: "",
    currency: null,
    detailKinds: ["custom"],
    allowedKinds: [],
  },
];

/**
 * The starting point the add form opens on: the first one offered. Derived
 * rather than named, so the chip that is selected when the form opens is
 * always the chip that comes first, whatever order the list is given.
 */
export const DEFAULT_TEMPLATE_KEY = METHOD_TEMPLATES[0]!.key;

/**
 * Whether a preset key names one of the built-in apps.
 *
 * @param preset - Preset key, or "" for none.
 * @returns True for venmo, zelle, cashapp and paypal.
 */
export function isPreset(preset: string): boolean {
  return PRESET_KEYS.includes(preset);
}

/**
 * The kinds a method's details may take.
 *
 * @param preset - The method's preset key, or "" for none.
 * @returns The allowed kind keys; empty when every kind is allowed.
 */
export function allowedDetailKinds(preset: string): readonly string[] {
  return PRESET_DETAIL_KINDS[preset] ?? [];
}

/**
 * Looks up a starting point by key.
 *
 * @param templateKey - Template key, e.g. "bank".
 * @returns The template, or undefined for an unknown key.
 */
export function findMethodTemplate(templateKey: string): MethodTemplate | undefined {
  return METHOD_TEMPLATES.find((template) => template.key === templateKey);
}

/**
 * Builds the empty draft the add form opens with for a starting point.
 *
 * @param templateKey - Which starting point was picked; an unknown key gets the free-form one.
 * @param defaultCurrency - The person's default currency, used when the template names none.
 * @returns A draft with the template's name, currency and blank detail rows.
 */
export function draftFromTemplate(
  templateKey: string,
  defaultCurrency: string,
): PaymentMethodFields {
  const template =
    findMethodTemplate(templateKey) ?? findMethodTemplate(CUSTOM_TEMPLATE_KEY)!;
  return {
    name: template.name,
    currency: template.currency ?? defaultCurrency,
    preset: template.preset,
    details: template.detailKinds.map((kind) => ({ kind, label: "", value: "" })),
    note: "",
  };
}
