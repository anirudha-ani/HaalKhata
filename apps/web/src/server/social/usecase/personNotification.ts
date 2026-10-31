/** Person-first notification copy: the name owns the title, the action starts the body. */

/** The visible words stored in the bell and delivered unchanged to iOS. */
export interface NotificationWords {
  title: string;
  body: string;
}

/**
 * Keeps a long display name from pushing the action off the title's one line.
 * Context and the reader's outcome follow the action, without generic labels
 * or instructions to open the app. iOS decides how much text it can display.
 *
 * @param actorName - Full display name; never guessed from a first-name split.
 * @param details - Action first, then its location and any useful outcome.
 * @returns The same two lines for the bell and the push.
 */
export function personNotification(actorName: string, ...details: string[]): NotificationWords {
  return {
    title: actorName.trim(),
    body: details.filter((detail) => detail.trim().length > 0).map((detail) => detail.trim()).join(" · "),
  };
}
