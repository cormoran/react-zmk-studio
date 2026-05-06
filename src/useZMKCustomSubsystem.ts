/**
 * useZMKCustomSubsystem Hook
 * Resolves a custom subsystem from the current app context.
 */

import { useCallback, useMemo } from "react";
import type { RpcConnection } from "@zmkfirmware/zmk-studio-ts-client";
import type { CustomNotification } from "@zmkfirmware/zmk-studio-ts-client/custom";
import {
  ZMKCustomSubsystem,
  type ProtobufDecoder,
  type ProtobufEncoder,
} from "./ZMKCustomSubsystem";
import { useZMKAppContext } from "./ZMKAppContext";

export interface ZMKCustomSubsystemMatch {
  index: number;
  identifier: string;
}

export interface UseZMKCustomSubsystemReturn {
  /**
   * Current app context value.
   */
  zmkApp: ReturnType<typeof useZMKAppContext>;
  /**
   * Active RPC connection, if present.
   */
  connection: RpcConnection | null;
  /**
   * Resolved subsystem metadata, if present.
   */
  subsystem: ZMKCustomSubsystemMatch | null;
  /**
   * Convenience alias for subsystem?.index.
   */
  subsystemIndex: number | null;
  /**
   * Reusable RPC helper for this subsystem.
   */
  service: ZMKCustomSubsystem | null;
  /**
   * Make a typed request against this subsystem when available.
   */
  callTyped: <TRequest, TResponse>(
    requestType: ProtobufEncoder<TRequest>,
    responseType: ProtobufDecoder<TResponse>,
    request: TRequest,
    options?: { timeout?: number }
  ) => Promise<TResponse | null>;
  /**
   * Subscribe to raw custom notifications for this subsystem.
   */
  onNotification: (
    callback: (notification: CustomNotification) => void
  ) => () => void;
  /**
   * Subscribe to decoded custom notifications for this subsystem.
   */
  onTypedNotification: <TNotification>(
    notificationType: ProtobufDecoder<TNotification>,
    callback: (
      notification: TNotification,
      rawNotification: CustomNotification
    ) => void
  ) => () => void;
  /**
   * Whether the subsystem exists on the connected device.
   */
  isAvailable: boolean;
  /**
   * Whether both the subsystem and connection are ready for RPC calls.
   */
  isReady: boolean;
}

/**
 * Resolve a custom subsystem from the current ZMK app context and provide a
 * memoized service instance for it when a connection is available.
 */
export function useZMKCustomSubsystem(
  identifier: string
): UseZMKCustomSubsystemReturn {
  const zmkApp = useZMKAppContext();
  const connection = zmkApp?.state.connection ?? null;
  const customSubsystems = zmkApp?.state.customSubsystems;

  const subsystem = useMemo<ZMKCustomSubsystemMatch | null>(() => {
    if (!zmkApp) {
      return null;
    }

    const match = zmkApp.findSubsystem(identifier);
    return match
      ? { index: match.index, identifier: match.identifier }
      : null;
  }, [identifier, zmkApp, customSubsystems]);

  const service = useMemo(() => {
    if (!connection || !subsystem) {
      return null;
    }

    return new ZMKCustomSubsystem(connection, subsystem.index);
  }, [connection, subsystem]);

  const subsystemIndex = subsystem?.index ?? null;
  const onNotification = useCallback(
    (callback: (notification: CustomNotification) => void) => {
      if (!zmkApp || subsystemIndex === null) {
        return () => {};
      }

      return zmkApp.onNotification({
        type: "custom",
        subsystemIndex,
        callback,
      });
    },
    [subsystemIndex, zmkApp]
  );

  const onTypedNotification = useCallback(
    <TNotification,>(
      notificationType: ProtobufDecoder<TNotification>,
      callback: (
        notification: TNotification,
        rawNotification: CustomNotification
      ) => void
    ) =>
      onNotification((notification) =>
        callback(
          notificationType.decode(notification.payload),
          notification
        )
      ),
    [onNotification]
  );

  const callTyped = useCallback(
    async <TRequest, TResponse>(
      requestType: ProtobufEncoder<TRequest>,
      responseType: ProtobufDecoder<TResponse>,
      request: TRequest,
      options?: { timeout?: number }
    ) => {
      if (!service) {
        return null;
      }

      return service.callTyped(requestType, responseType, request, options);
    },
    [service]
  );

  return {
    zmkApp,
    connection,
    subsystem,
    subsystemIndex,
    service,
    callTyped,
    onNotification,
    onTypedNotification,
    isAvailable: subsystem !== null,
    isReady: service !== null,
  };
}
