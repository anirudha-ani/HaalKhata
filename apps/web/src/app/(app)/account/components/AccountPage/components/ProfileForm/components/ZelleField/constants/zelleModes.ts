/** Constants for the Zelle field: the two kinds of identity a bank accepts. */

/** The two things a bank will accept as a Zelle identity. */
export const ZELLE_MODES = [
  { key: "phone", label: "Phone" },
  { key: "email", label: "Email" },
] as const;
