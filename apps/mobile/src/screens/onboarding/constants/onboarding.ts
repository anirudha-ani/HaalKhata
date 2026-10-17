/** Sizes and timings for the first-run flow. */

/** Code boxes shown before any digit is typed; Twilio Verify sends six by default. */
export const CODE_BOX_COUNT = 6;

/** The longest code the server accepts (PHONE_VERIFICATION_CODE_PATTERN). */
export const MAX_CODE_LENGTH = 10;

/** The shortest code the server accepts. */
export const MIN_CODE_LENGTH = 4;

/** Seconds before "Resend code" is offered again; the server also caps sends per number per hour. */
export const RESEND_DELAY_SECONDS = 30;

/** How far the code boxes shake on a wrong code. */
export const CODE_SHAKE_DISTANCE = 8;

/** Size of the art above each step's title. */
export const STEP_ART_SIZE = 112;
