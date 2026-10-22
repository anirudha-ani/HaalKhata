/** Groups local credential assignments at the bottom without re-encoding their values. */

import { isDeepStrictEqual, parseEnv } from "node:util";
import { ENVIRONMENT_ASSIGNMENT_PATTERN, SECRET_ENVIRONMENT_NAMES, SECRET_SECTION_HEADER } from "./environment.constants.mjs";

/**
 * Removes the generated section marker only from text outside assignment values.
 * @param {string} text Comments and spacing between dotenv assignments.
 * @returns {string} Text without a previous generated marker.
 */
function removeSectionHeader(text) {
  return text.split("\n").filter((line) => line.trim() !== SECRET_SECTION_HEADER).join("\n");
}

/**
 * Moves complete secret assignments and their adjacent comments into one final section.
 * Keeps the last assignment for duplicate secret names, matching dotenv precedence.
 * @param {string} source Current dotenv file, including comments and multiline credentials.
 * @returns {string} Reordered text with identical effective values.
 */
export function groupSecretSection(source) {
  const ordinary = [];
  const secrets = new Map();
  let offset = 0;
  for (const match of source.matchAll(ENVIRONMENT_ASSIGNMENT_PATTERN)) {
    const prefix = removeSectionHeader(source.slice(offset, match.index));
    const [assignment, name] = match;
    offset = match.index + assignment.length;
    if (!SECRET_ENVIRONMENT_NAMES.includes(name.replace(/_FILE$/, ""))) {
      ordinary.push(prefix, assignment);
      continue;
    }
    // Keep section headings in place; move only the immediately preceding explanatory comments.
    const comments = prefix.match(/(?:^|\n)((?:[\t ]*#(?![\t ]*---)[^\r\n]*\r?\n)+)$/)?.[1] ?? "";
    ordinary.push(prefix.slice(0, prefix.length - comments.length));
    const previousComments = secrets.get(name)?.comments ?? "";
    secrets.set(name, { comments: `${previousComments}${comments}`, assignment });
  }
  ordinary.push(removeSectionHeader(source.slice(offset)));
  if (!secrets.size) return source;
  const blocks = [...secrets.values()].map(({ comments, assignment }) => `${comments}${assignment}`.trimEnd());
  const result = `${ordinary.join("").trimEnd()}\n\n${SECRET_SECTION_HEADER}\n\n${blocks.join("\n\n")}\n`;
  // A malformed or unusual dotenv construct must never silently change an existing credential.
  if (!isDeepStrictEqual(parseEnv(result), parseEnv(source))) {
    throw new Error("Cannot group .env secrets without changing parsed values; the environment file was not rewritten.");
  }
  return result;
}
