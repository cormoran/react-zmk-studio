/**
 * ZMK Service
 * Generic service for RPC communication with ZMK custom subsystems
 */

import type { RpcConnection } from "@zmkfirmware/zmk-studio-ts-client";
import { call_rpc } from "@zmkfirmware/zmk-studio-ts-client";
import { withTimeout } from "./utils";

export interface ProtobufEncoder<T> {
  encode(message: T): { finish(): Uint8Array };
}

export interface ProtobufDecoder<T> {
  decode(payload: Uint8Array): T;
}

/**
 * Service class for communicating with ZMK custom subsystems via RPC
 *
 * This class provides a simple interface for making RPC calls to custom
 * subsystems on a connected ZMK device. Each subsystem has a unique index
 * and can process custom protobuf payloads.
 *
 * @example
 * const service = new ZMKCustomSubsystem(connection, subsystemIndex);
 * const payload = new Uint8Array([1, 2, 3]); // Your protobuf payload
 * const response = await service.callRPC(payload);
 */
export class ZMKCustomSubsystem {
  private connection: RpcConnection;
  private subsystemIndex: number;

  /**
   * Create a new subsystem service instance
   * @param connection - Active RPC connection to the device
   * @param subsystemIndex - Index of the subsystem to communicate with
   */
  constructor(connection: RpcConnection, subsystemIndex: number) {
    this.connection = connection;
    this.subsystemIndex = subsystemIndex;
  }

  /**
   * Send an RPC request to this subsystem
   * @param payload - Serialized protobuf payload to send
   * @param options - Optional configuration
   * @param options.timeout - Timeout in milliseconds (default: 5000ms)
   * @returns The response payload from the device, or null if no response
   * @throws Error if the RPC call fails or times out
   */
  async callRPC(
    payload: Uint8Array,
    options?: { timeout?: number }
  ): Promise<Uint8Array | null> {
    const timeout = options?.timeout ?? 5000;
    const response = await withTimeout(
      call_rpc(this.connection, {
        custom: {
          call: {
            subsystemIndex: this.subsystemIndex,
            payload,
          },
        },
      }),
      timeout
    );
    return response.custom?.call?.payload || null;
  }

  /**
   * Send an encoded protobuf request and decode the protobuf response.
   */
  async callTyped<TRequest, TResponse>(
    requestType: ProtobufEncoder<TRequest>,
    responseType: ProtobufDecoder<TResponse>,
    request: TRequest,
    options?: { timeout?: number }
  ): Promise<TResponse | null> {
    const payload = requestType.encode(request).finish();
    const responsePayload = await this.callRPC(payload, options);

    if (!responsePayload) {
      return null;
    }

    return responseType.decode(responsePayload);
  }

  /**
   * Decode a custom subsystem payload into a protobuf message.
   */
  decodePayload<T>(
    responseType: ProtobufDecoder<T>,
    payload: Uint8Array
  ): T {
    return responseType.decode(payload);
  }

  /**
   * Check if the subsystem is ready to receive RPC calls
   * @returns true if the connection is active
   */
  isReady(): boolean {
    return !!this.connection;
  }

  /**
   * Get the index of this subsystem
   * @returns The subsystem index
   */
  getSubsystemIndex(): number {
    return this.subsystemIndex;
  }

  /**
   * Get the underlying RPC connection
   * @returns The RPC connection object
   */
  getConnection(): RpcConnection {
    return this.connection;
  }
}

/**
 * Error types for ZMK service operations
 */
export class ZMKCustomSubsystemError extends Error {
  public type: "connection" | "rpc" | "validation";
  public code?: number;

  constructor(
    type: "connection" | "rpc" | "validation",
    message: string,
    code?: number
  ) {
    super(message);
    this.name = "ZMKCustomSubsystemError";
    this.type = type;
    this.code = code;
  }
}
