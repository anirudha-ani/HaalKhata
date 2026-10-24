/**
 * The one SQL expression the admin surface uses to name a person, so that a
 * name withheld on one admin page is withheld on every one of them.
 */

import { PHONE_DIGIT_COUNT } from "@/server/adminanalytics/adminanalytics.constants";
import { unicodeClass } from "@/server/adminanalytics/repo/unicodeClass";

/** Decimal digits in every script: Bengali, Arabic-Indic, Devanagari and the rest. */
const DIGITS = unicodeClass(/^\p{Nd}$/u);

/** Characters nobody can see: zero-width spaces and joiners, bidi controls, soft hyphens. */
const INVISIBLE = unicodeClass(/^\p{Cf}$/u);

/** Every kind of space, no-break ones included. */
const SPACE = unicodeClass(/^\p{White_Space}$/u);

/**
 * The name as it is compared, never as it is shown: compatibility
 * normalized, so full-width letters and digits, "＠" and no-break spaces
 * become their plain forms, and with invisible characters removed, so a
 * zero-width space cannot split an address or a number in two.
 */
const COMPARED_NAME = `regexp_replace(normalize(usr.name, NFKC), '[${INVISIBLE}]', '', 'g')`;

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
 * Each test reads the compared form of the name (see COMPARED_NAME), so
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
 */
export const DISPLAY_NAME = `CASE
    WHEN ${COMPARED_NAME} LIKE '%@%' THEN ''
    WHEN length(regexp_replace(${COMPARED_NAME}, '[^${DIGITS}]', '', 'g')) >= ${PHONE_DIGIT_COUNT} THEN ''
    WHEN usr.email IS NOT NULL
         AND lower(regexp_replace(${COMPARED_NAME}, '^[${SPACE}]+|[${SPACE}]+$', '', 'g'))
             = lower(split_part(usr.email, '@', 1)) THEN ''
    ELSE usr.name
  END`;
