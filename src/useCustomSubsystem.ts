/**
 * useCustomSubsystem Hook
 * One-line access to a custom subsystem from inside a ZMKAppContext provider
 */

import { useCallback, useContext, useMemo } from "react";
import { ZMKAppContext } from "./ZMKAppContext";
import { ZMKCustomSubsystem } from "./ZMKCustomSubsystem";

/**
 * Encode/decode pair translating between typed request/response messages and
 * the raw protobuf payload bytes a custom subsystem speaks.
 *
 * With ts-proto generated messages this is just:
 * `{ encode: (req) => Request.encode(req).finish(), decode: Response.decode }`
 */
export interface Codec<TReq, TRes> {
  /** Serialize a request message to protobuf bytes, e.g. `(req) => Request.encode(req).finish()` */
  encode: (request: TReq) => Uint8Array;
  /** Parse protobuf bytes into a response message, e.g. `(bytes) => Response.decode(bytes)` */
  decode: (payload: Uint8Array) => TRes;
}

export interface UseCustomSubsystemReturn {
  /** The resolved subsystem (index + identifier), or `null` if not connected or not found */
  subsystem: { index: number; identifier: string } | null;
  /** True when connected AND the subsystem was found on the device */
  ready: boolean;
  /**
   * Send a raw protobuf payload to the subsystem.
   * @param payload - Serialized protobuf payload to send
   * @param options.timeout - Timeout in milliseconds (default: 5000ms)
   * @returns The response payload, or `null` if the device sent none
   * @throws Error when not `ready` (no context, not connected, or subsystem not found)
   */
  callRPC: (
    payload: Uint8Array,
    options?: { timeout?: number }
  ) => Promise<Uint8Array | null>;
}

export interface UseCustomSubsystemTypedReturn<TReq, TRes>
  extends UseCustomSubsystemReturn {
  /**
   * Send a typed request to the subsystem: encodes with the codec, calls the
   * device, and decodes the response.
   * @returns The decoded response, or `null` if the device sent no payload
   * @throws Error when not `ready` (no context, not connected, or subsystem not found)
   */
  call: (request: TReq, options?: { timeout?: number }) => Promise<TRes | null>;
}

/**
 * Hook wrapping the boilerplate of talking to a custom subsystem:
 * `useContext(ZMKAppContext)` → `findSubsystem(identifier)` →
 * `new ZMKCustomSubsystem(connection, index)` → protobuf encode/decode.
 *
 * Must be rendered inside a `ZMKAppContext` provider (e.g. `ZMKConnection`).
 * Without a provider or an active connection it degrades gracefully to
 * `{ ready: false, subsystem: null }` instead of throwing -- only calling
 * `callRPC`/`call` while not ready throws.
 *
 * @param identifier - The unique identifier the subsystem registers on the device
 * @param codec - Optional encode/decode pair; when given, a typed `call()` is returned too
 *
 * @example Raw payloads
 * const { ready, callRPC } = useCustomSubsystem("your_name__template");
 * if (ready) await callRPC(new Uint8Array([1, 2, 3]));
 *
 * @example Typed via ts-proto generated messages
 * const { ready, call } = useCustomSubsystem("your_name__template", {
 *   encode: (r: Request) => Request.encode(r).finish(),
 *   decode: Response.decode,
 * });
 * // later: const response = await call({ ping: {} });
 */
export function useCustomSubsystem(identifier: string): UseCustomSubsystemReturn;
export function useCustomSubsystem<TReq, TRes>(
  identifier: string,
  codec: Codec<TReq, TRes>
): UseCustomSubsystemTypedReturn<TReq, TRes>;
export function useCustomSubsystem<TReq, TRes>(
  identifier: string,
  codec?: Codec<TReq, TRes>
): UseCustomSubsystemReturn | UseCustomSubsystemTypedReturn<TReq, TRes> {
  const zmkApp = useContext(ZMKAppContext);

  const connection = zmkApp?.state.connection ?? null;
  const subsystem = zmkApp?.findSubsystem(identifier) ?? null;
  const subsystemIndex = subsystem?.index ?? null;

  const service = useMemo(
    () =>
      connection !== null && subsystemIndex !== null
        ? new ZMKCustomSubsystem(connection, subsystemIndex)
        : null,
    [connection, subsystemIndex]
  );

  const ready = service !== null;

  const lastPacketMs = zmkApp?.lastPacketMs ?? null;

  const callRPC = useCallback(
    async (
      payload: Uint8Array,
      options?: { timeout?: number }
    ): Promise<Uint8Array | null> => {
      if (!service) {
        throw new Error(
          `Custom subsystem "${identifier}" is not ready: ` +
            (connection === null
              ? "no active ZMK connection (is this rendered inside a ZMKAppContext provider with a connected device?)"
              : "subsystem not found on the connected device")
        );
      }
      return service.callRPC(payload, {
        lastPacketMs: lastPacketMs ?? undefined,
        ...options,
      });
    },
    [service, identifier, connection, lastPacketMs]
  );

  const call = useCallback(
    async (
      request: TReq,
      options?: { timeout?: number }
    ): Promise<TRes | null> => {
      if (!codec) {
        throw new Error(
          `useCustomSubsystem("${identifier}"): call() requires a codec; use callRPC() for raw payloads`
        );
      }
      const payload = await callRPC(codec.encode(request), options);
      return payload === null ? null : codec.decode(payload);
    },
    [callRPC, identifier, codec]
  );

  if (codec) {
    return { subsystem, ready, callRPC, call };
  }
  return { subsystem, ready, callRPC };
}
