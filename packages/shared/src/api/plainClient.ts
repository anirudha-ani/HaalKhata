/**
 * A Connect client that speaks plain numbers. Both apps build their clients
 * through this, so screens, hooks and the shared money helpers never see the
 * bigint protobuf-es uses for the API's 64-bit money fields: a request's
 * numbers become 64-bit integers on the way out and a response's become
 * numbers on the way in (see wireNumbers.ts).
 */

import type { DescService } from "@bufbuild/protobuf";
import { Code, ConnectError, type CallOptions, type Client } from "@connectrpc/connect";
import { plainNumbers, wireIntegers, type PlainNumbers, WireNumberError } from "./wireNumbers";
import { REQUEST_NUMBER_REFUSED, RESPONSE_NUMBER_REFUSED } from "./wireNumbers.constants";

/** A Connect client for `Service` whose requests and responses carry plain numbers. */
export type PlainClient<Service extends DescService> = {
  [Name in keyof Client<Service>]: Client<Service>[Name] extends (
    request: infer Request,
    options?: CallOptions,
  ) => Promise<infer Response>
    ? (request: PlainNumbers<Request>, options?: CallOptions) => Promise<PlainNumbers<Response>>
    : Client<Service>[Name];
};

/** One unary call of a Connect client, with its types erased. */
type UnaryCall = (request: unknown, options?: CallOptions) => Promise<unknown>;

/**
 * Turns a conversion failure into the ConnectError every screen already
 * knows how to show, so it reaches the person like any refused call.
 *
 * @param error - What the conversion threw.
 * @param message - What to tell the person.
 * @param code - The Connect code it is reported under.
 * @returns A ConnectError for a number that could not be carried, else the error itself.
 */
function asConnectError(error: unknown, message: string, code: Code): unknown {
  return error instanceof WireNumberError ? new ConnectError(message, code, undefined, undefined, error) : error;
}

/**
 * Wraps a Connect client so every unary method takes and returns plain
 * numbers. Streaming methods, which the API does not have, pass through.
 *
 * @param service - The service the client was made for.
 * @param client - The client from `createClient(service, transport)`.
 * @returns The same methods, converting numbers at the boundary.
 */
export function plainClient<Service extends DescService>(service: Service, client: Client<Service>): PlainClient<Service> {
  const methods = client as unknown as Record<string, UnaryCall>;
  const wrapped: Record<string, unknown> = {};
  for (const method of service.methods) {
    const call = methods[method.localName];
    if (method.methodKind !== "unary") {
      wrapped[method.localName] = call;
      continue;
    }
    wrapped[method.localName] = async (request: unknown, options?: CallOptions) => {
      let outgoing: unknown;
      try {
        outgoing = wireIntegers(method.input, request as never);
      } catch (error) {
        throw asConnectError(error, REQUEST_NUMBER_REFUSED, Code.InvalidArgument);
      }
      const response = await call(outgoing, options);
      try {
        return plainNumbers(method.output, response as never);
      } catch (error) {
        throw asConnectError(error, RESPONSE_NUMBER_REFUSED, Code.DataLoss);
      }
    };
  }
  return wrapped as PlainClient<Service>;
}
