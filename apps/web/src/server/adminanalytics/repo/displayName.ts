/**
 * The one SQL expression the admin surface uses to name a person, so that a
 * name withheld on one admin page is withheld on every one of them.
 */

import { PHONE_DIGIT_COUNT } from "@/server/adminanalytics/adminanalytics.constants";
import { unicodeClass } from "@/server/adminanalytics/repo/unicodeClass";

/** Decimal digits in every script: Bengali, Arabic-Indic, Devanagari and the rest. */
const DIGITS = /^\p{Nd}$/u;

/** Characters nobody can see: zero-width spaces and joiners, bidi controls, soft hyphens. */
const INVISIBLE = /^\p{Cf}$/u;

/** Every kind of space, no-break ones included. */
const SPACE = /^\p{White_Space}$/u;

/** The expression once built; see displayNameSql. */
let builtDisplayName: string | undefined;

/**
 * A person's display name, or '' when the name is itself a way to reach
 * them. Written for a `users usr` alias, and used by every statement on the
 * admin surface that names a person: the usage overview and the moderation
 * queue withhold the same names.
 *
 * A display name is free text the person typed, and "names only" is a
 * promise about what the operator sees, not about what a column is called.
 * Three cases are withheld:
 *
 * - it contains "@": an email address typed as a name;
 * - it contains seven or more digits, in any script and wherever they are:
 *   a phone number typed as or into a name, whatever separates its digits;
 * - it equals the part of their email before the "@". Sign-in falls back to
 *   exactly that when Google supplies no name, and with the domain almost
 *   always guessable it is the address in all but name.
 *
 * Each test reads the compared form of the name (see buildDisplayName), so
 * look-alike characters, no-break spaces and invisible characters cannot
 * slip a name past them; the name shown is the one the person saved. The
 * character lists come from Unicode itself, because Postgres's own classes
 * follow the C library, under which a Bengali digit is not a digit.
 *
 * The last case compares against the email inside the database and returns
 * only the verdict, so the address still never leaves it. Each case will
 * also withhold a real name that happens to match (someone called "Ani" at
 * ani@..., a name with a long number in it), which costs the operator one
 * name and is the right way round to be wrong.
 *
 * Built on first use, not when the module loads: reading Unicode's tables
 * for the three character lists takes tens of milliseconds, and every
 * server process loads this module with the Connect routes, while only an
 * admin request ever names a person this way.
 *
 * @returns The SQL expression.
 */
export function displayNameSql(): string {
  builtDisplayName ??= buildDisplayName();
  return builtDisplayName;
}

/**
 * Writes the expression displayNameSql describes.
 *
 * @returns The SQL expression.
 */
function buildDisplayName(): string {
  const digits = unicodeClass(DIGITS);
  const space = unicodeClass(SPACE);
  // The name as it is compared, never as it is shown: compatibility
  // normalized, so full-width letters and digits, "＠" and no-break spaces
  // become their plain forms, and with invisible characters removed, so a
  // zero-width space cannot split an address or a number in two.
  const comparedName = `regexp_replace(normalize(usr.name, NFKC), '[${unicodeClass(INVISIBLE)}]', '', 'g')`;
  return `CASE
    WHEN ${comparedName} LIKE '%@%' THEN ''
    WHEN length(regexp_replace(${comparedName}, '[^${digits}]', '', 'g')) >= ${PHONE_DIGIT_COUNT} THEN ''
    WHEN usr.email IS NOT NULL
         AND lower(regexp_replace(${comparedName}, '^[${space}]+|[${space}]+$', '', 'g'))
             = lower(split_part(usr.email, '@', 1)) THEN ''
    ELSE usr.name
  END`;
}
