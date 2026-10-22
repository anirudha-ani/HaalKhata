/**
 * The one SQL expression the admin surface uses to name a person, so that a
 * name withheld on one admin page is withheld on every one of them.
 */

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
 * - it is made of digits and phone punctuation: a number typed as a name;
 * - it equals the part of their email before the "@". Sign-in falls back to
 *   exactly that when Google supplies no name, and with the domain almost
 *   always guessable it is the address in all but name.
 *
 * The last case compares against the email inside the database and returns
 * only the verdict, so the address still never leaves it. It will also
 * withhold a real name that happens to match (someone called "Ani" at
 * ani@...), which costs the operator one name and is the right way round to
 * be wrong.
 */
export const DISPLAY_NAME = `CASE
    WHEN usr.name LIKE '%@%' THEN ''
    WHEN usr.name ~ '^[+0-9 ().-]{7,}$' THEN ''
    WHEN usr.email IS NOT NULL
         AND lower(btrim(usr.name)) = lower(split_part(usr.email, '@', 1)) THEN ''
    ELSE usr.name
  END`;
