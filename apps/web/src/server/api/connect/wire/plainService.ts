/**
 * Serves a Connect service whose handlers speak plain numbers. Every service
 * is registered through this (routes.ts), so handlers and usecases never
 * see the bigint protobuf-es uses for the API's 64-bit money fields: a
 * request's are turned into numbers before the handler runs and the
 * handler's numbers are turned back into 64-bit integers after it returns
 * (see @haalkhata/shared/api/wireNumbers).
 */

import type { DescMessage, DescMethodUnary, DescService, MessageInitShape, MessageShape } from "@bufbuild/protobuf";
import { Code, ConnectError, type HandlerContext, type ServiceImpl } from "@connectrpc/connect";
import { plainNumbers, wireIntegers, WireNumberError, type PlainNumbers } from "@haalkhata/shared/api/wireNumbers";
import { logError } from "@/server/common/logger";
import { REQUEST_NUMBER_REFUSED_MESSAGE, RESPONSE_NUMBER_REFUSED_MESSAGE } from "../connect.constants";

/** One unary method implemented in plain numbers. */
type PlainUnaryImpl<Input extends DescMessage, Output extends DescMessage> = (
  request: PlainNumbers<MessageShape<Input>>,
  context: HandlerContext,
) => Promise<PlainNumbers<MessageInitShape<Output>>> | PlainNumbers<MessageInitShape<Output>>;

/** A service implementation whose requests and responses carry plain numbers. */
export type PlainServiceImpl<Service extends DescService> = {
  [Name in keyof Service["method"]]: Service["method"][Name] extends DescMethodUnary<infer Input, infer Output>
    ? PlainUnaryImpl<Input, Output>
    : never;
};

/** One unary handler, with its types erased. */
type UnaryHandler = (request: unknown, context: HandlerContext) => unknown;

/**
 * Wraps a plain-number service implementation for the Connect router.
 *
 * A request number beyond what a plain number holds exactly is refused as
 * invalid before the handler runs. A response number that cannot be sent
 * exactly — a fraction, or a figure past 2^53 — is a failed precondition the
 * person sees, and is logged, since what can be recorded is meant to keep
 * every figure far below that.
 *
 * @param service - The service being served.
 * @param implementation - Its handlers, in plain numbers.
 * @returns The same handlers in protobuf-es's types.
 */
export function plainService<Service extends DescService>(
  service: Service,
  implementation: Partial<PlainServiceImpl<Service>>,
): Partial<ServiceImpl<Service>> {
  const handlers = implementation as unknown as Record<string, UnaryHandler | undefined>;
  const wrapped: Record<string, UnaryHandler> = {};
  for (const method of service.methods) {
    const handle = handlers[method.localName];
    if (handle === undefined) continue;
    if (method.methodKind !== "unary") {
      wrapped[method.localName] = handle;
      continue;
    }
    wrapped[method.localName] = async (request, context) => {
      let incoming: unknown;
      try {
        incoming = plainNumbers(method.input, request as never);
      } catch (error) {
        if (error instanceof WireNumberError) throw new ConnectError(REQUEST_NUMBER_REFUSED_MESSAGE, Code.InvalidArgument);
        throw error;
      }
      const response = await handle.call(implementation, incoming, context);
      try {
        return wireIntegers(method.output, response as never);
      } catch (error) {
        if (!(error instanceof WireNumberError)) throw error;
        logError(error, { rpc: method.name, field: error.field });
        throw new ConnectError(RESPONSE_NUMBER_REFUSED_MESSAGE, Code.FailedPrecondition);
      }
    };
  }
  return wrapped as Partial<ServiceImpl<Service>>;
}
