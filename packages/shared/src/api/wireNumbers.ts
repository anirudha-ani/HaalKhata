/**
 * Money crosses the API as 64-bit integers (`int64` cents), which
 * protobuf-es represents as `bigint` — or, on a JavaScript engine without
 * 64-bit DataView methods, as a decimal string. Everything on either side
 * of the wire — the split math, balances, formatting, charts — works in
 * plain numbers, which are exact for whole cents up to 2^53 (about 90
 * trillion in a two-decimal currency). These two functions convert at the
 * boundary, once per message, walking the message's schema so no field is
 * missed: a response is turned into plain numbers as it arrives, and a
 * request is turned back into 64-bit integers as it leaves.
 *
 * A value that a plain number cannot hold exactly is never rounded: the
 * conversion throws {@link WireNumberError} and the caller refuses the
 * message.
 */

import {
  create,
  protoInt64,
  type DescField,
  type DescMessage,
  type MessageInitShape,
  type MessageShape,
  type ScalarType,
} from "@bufbuild/protobuf";
import { LONG_SCALAR_TYPES, UNSIGNED_LONG_SCALAR_TYPES } from "./wireNumbers.constants";

/**
 * `T` with every 64-bit integer field as a plain `number`. A message with no
 * 64-bit field maps to a type identical to itself.
 */
export type PlainNumbers<T> = T extends bigint
  ? number
  : T extends Uint8Array
    ? T
    : T extends readonly (infer Item)[]
      ? PlainNumbers<Item>[]
      : T extends object
        ? { [Key in keyof T]: PlainNumbers<T[Key]> }
        : T;

/** A 64-bit field whose value a plain number cannot carry exactly. */
export class WireNumberError extends Error {
  /**
   * @param field - The field, as `package.Message.field_name`.
   */
  constructor(readonly field: string) {
    super(`${field} is outside the range of whole numbers this app can count exactly`);
    this.name = "WireNumberError";
  }
}

/**
 * Converts one 64-bit value; `field` names it for the error and `unsigned`
 * says whether it is a uint64 or fixed64.
 */
type Convert = (value: unknown, field: string, unsigned: boolean) => unknown;

/** Whether each schema holds a 64-bit field anywhere inside it. */
const holdsLongs = new WeakMap<DescMessage, boolean>();

/**
 * The 64-bit scalar type a field holds directly (as a value, list item or
 * map value), as opposed to inside a nested message.
 *
 * @param field - The field to inspect.
 * @returns Its int64-family scalar type, or undefined when it holds none.
 */
function longScalarOf(field: DescField): ScalarType | undefined {
  switch (field.fieldKind) {
    case "scalar":
      return LONG_SCALAR_TYPES.has(field.scalar) ? field.scalar : undefined;
    case "list":
      return field.listKind === "scalar" && LONG_SCALAR_TYPES.has(field.scalar) ? field.scalar : undefined;
    case "map":
      return field.mapKind === "scalar" && LONG_SCALAR_TYPES.has(field.scalar) ? field.scalar : undefined;
    default:
      return undefined;
  }
}

/**
 * The message a field nests, if any (a message field, a list of messages or
 * a map onto messages).
 *
 * @param field - The field to inspect.
 * @returns The nested schema, or undefined for scalars and enums.
 */
function nestedMessage(field: DescField): DescMessage | undefined {
  if (field.fieldKind === "message") return field.message;
  if (field.fieldKind === "list" && field.listKind === "message") return field.message;
  if (field.fieldKind === "map" && field.mapKind === "message") return field.message;
  return undefined;
}

/**
 * Whether a schema holds a 64-bit field anywhere inside it, so a message
 * without one passes through untouched. Memoised per schema. A schema that
 * refers back to itself counts as holding none along that path, so a "no"
 * found partway through a cycle is not remembered; only the outermost
 * answer, which has seen everything reachable, is.
 *
 * @param schema - The message schema.
 * @param visiting - Schemas already on the current path.
 * @returns True when some field, at any depth, is a 64-bit integer.
 */
function containsLongs(schema: DescMessage, visiting: Set<DescMessage> = new Set()): boolean {
  const known = holdsLongs.get(schema);
  if (known !== undefined) return known;
  if (visiting.has(schema)) return false;
  visiting.add(schema);
  const found = schema.fields.some((field) => {
    if (longScalarOf(field) !== undefined) return true;
    const nested = nestedMessage(field);
    return nested !== undefined && containsLongs(nested, visiting);
  });
  visiting.delete(schema);
  if (found || visiting.size === 0) holdsLongs.set(schema, found);
  return found;
}

/**
 * Converts one field's value: a 64-bit value, each item of a list of them,
 * each value of a map onto them, or the messages a field nests.
 *
 * @param field - The field's schema.
 * @param value - Its current value (absent values pass through).
 * @param convert - What to do with one 64-bit value.
 * @returns The converted value.
 */
function convertField(field: DescField, value: unknown, convert: Convert): unknown {
  if (value === undefined || value === null) return value;
  const scalar = longScalarOf(field);
  if (scalar !== undefined) {
    const name = `${field.parent.typeName}.${field.name}`;
    const unsigned = UNSIGNED_LONG_SCALAR_TYPES.has(scalar);
    const convertOne = (item: unknown) => convert(item, name, unsigned);
    if (field.fieldKind === "list") return (value as unknown[]).map(convertOne);
    if (field.fieldKind === "map") {
      return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([mapKey, item]) => [mapKey, convertOne(item)]));
    }
    return convertOne(value);
  }
  const nested = nestedMessage(field);
  if (nested === undefined || !containsLongs(nested)) return value;
  if (field.fieldKind === "list") return (value as unknown[]).map((item) => convertMessage(nested, item, convert));
  if (field.fieldKind === "map") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([mapKey, item]) => [mapKey, convertMessage(nested, item, convert)]),
    );
  }
  return convertMessage(nested, value, convert);
}

/**
 * Copies a message with every 64-bit value converted, including inside the
 * selected case of a oneof and inside nested messages. A message holding no
 * 64-bit field is returned as it is.
 *
 * @param schema - The message's schema.
 * @param value - The message, or a plain object shaped like it.
 * @param convert - What to do with one 64-bit value.
 * @returns The converted copy.
 */
function convertMessage(schema: DescMessage, value: unknown, convert: Convert): unknown {
  if (value === undefined || value === null || !containsLongs(schema)) return value;
  const source = value as Record<string, unknown>;
  const copy: Record<string, unknown> = { ...source };
  for (const member of schema.members) {
    const current = source[member.localName];
    if (member.kind === "field") {
      copy[member.localName] = convertField(member, current, convert);
      continue;
    }
    const selected = current as { case?: string; value?: unknown } | undefined;
    const field = member.fields.find((candidate) => candidate.localName === selected?.case);
    if (selected && field) copy[member.localName] = { ...selected, value: convertField(field, selected.value, convert) };
  }
  return copy;
}

/**
 * One 64-bit value as a plain number. Any value past 2^53 − 1 either way
 * converts to a number that is no longer a safe integer, which is how it is
 * caught.
 *
 * @param value - The value protobuf-es produced: a bigint, or its decimal string.
 * @param field - The field, for the error.
 * @returns The same value as a number.
 * @throws WireNumberError when the value is beyond 2^53 − 1 either way.
 */
const toNumber: Convert = (value, field) => {
  if (typeof value !== "bigint" && typeof value !== "string") return value;
  const converted = Number(value);
  if (!Number.isSafeInteger(converted)) throw new WireNumberError(field);
  return converted;
};

/**
 * One plain number as the 64-bit value protobuf-es expects on this engine
 * (a bigint, or its decimal string where bigint is unsupported).
 *
 * @param value - A whole number (anything else is passed through).
 * @param field - The field, for the error.
 * @param unsigned - Whether the field is a uint64 or fixed64.
 * @returns The same value in protobuf-es's representation.
 * @throws WireNumberError for a fraction, a non-finite number, a whole
 *   number already past 2^53 − 1 (no longer known exactly), or a negative
 *   number in an unsigned field.
 */
const toWireInteger: Convert = (value, field, unsigned) => {
  if (typeof value !== "number") return value;
  if (!Number.isSafeInteger(value) || (unsigned && value < 0)) throw new WireNumberError(field);
  return unsigned ? protoInt64.uParse(value) : protoInt64.parse(value);
};

/**
 * A decoded message with every 64-bit integer as a plain number.
 *
 * @param schema - The message's schema (a generated `…Schema`).
 * @param message - The message protobuf-es decoded.
 * @returns A copy with plain numbers (the message itself when it holds none).
 * @throws WireNumberError when a value is beyond what a number holds exactly.
 */
export function plainNumbers<Desc extends DescMessage>(
  schema: Desc,
  message: MessageShape<Desc>,
): PlainNumbers<MessageShape<Desc>> {
  return convertMessage(schema, message, toNumber) as PlainNumbers<MessageShape<Desc>>;
}

/**
 * A message to encode, with every plain number in a 64-bit field turned
 * into the 64-bit value protobuf-es expects.
 *
 * @param schema - The message's schema (a generated `…Schema`).
 * @param value - The message, or a plain object shaped like it, with numbers.
 * @returns A copy protobuf-es can encode (the value itself when it holds none).
 * @throws WireNumberError when a value is not a whole number known exactly.
 */
export function wireIntegers<Desc extends DescMessage>(
  schema: Desc,
  value: PlainNumbers<MessageInitShape<Desc>>,
): MessageInitShape<Desc> {
  return convertMessage(schema, value, toWireInteger) as MessageInitShape<Desc>;
}

/**
 * Builds a message from plain numbers and hands it back the way a plain
 * client returns one: every field defaulted, money as numbers. For tests and
 * for placeholders a screen shows before the server answers.
 *
 * @param schema - The message's schema (a generated `…Schema`).
 * @param value - The fields to set, with plain numbers.
 * @returns The complete message, with plain numbers.
 * @throws WireNumberError when a value is not a whole number known exactly.
 */
export function createPlain<Desc extends DescMessage>(
  schema: Desc,
  value: PlainNumbers<MessageInitShape<Desc>>,
): PlainNumbers<MessageShape<Desc>> {
  return plainNumbers(schema, create(schema, wireIntegers(schema, value)));
}
