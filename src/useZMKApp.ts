/**
 * useZMKApp Hook
 * Generic hook for managing ZMK device connection and subsystem discovery
 */

import { useState, useCallback, useEffect, useRef } from "react";
import {
  create_rpc_connection,
  call_rpc,
} from "@zmkfirmware/zmk-studio-ts-client";
import type { RpcTransport } from "@zmkfirmware/zmk-studio-ts-client/transport/index";
import type { RpcConnection } from "@zmkfirmware/zmk-studio-ts-client";
import type { GetDeviceInfoResponse } from "@zmkfirmware/zmk-studio-ts-client/core";
import type { Notification as CoreNotification } from "@zmkfirmware/zmk-studio-ts-client/core";
import type { Notification as KeymapNotification } from "@zmkfirmware/zmk-studio-ts-client/keymap";
import type {
  ListCustomSubsystemResponse,
  CustomNotification,
} from "@zmkfirmware/zmk-studio-ts-client/custom";
import { isUserCancelledError } from "./transportSupport";

/**
 * Default time to wait for the device to complete the RPC handshake
 * (`getDeviceInfo` + `listCustomSubsystems`) before giving up. See
 * {@link UseZMKAppOptions.connectTimeoutMs}.
 */
export const DEFAULT_CONNECT_TIMEOUT_MS = 5000;

/** Error message surfaced (via `state.error`) when a connect times out. */
export const CONNECT_TIMEOUT_ERROR =
  "Connection timed out: the device did not respond.";

export interface UseZMKAppOptions {
  /**
   * Inactivity timeout (ms) for the initial device handshake
   * (`getDeviceInfo` + `listCustomSubsystems`) before the connect attempt is
   * aborted. Defaults to {@link DEFAULT_CONNECT_TIMEOUT_MS}.
   *
   * The timer is *activity-based*: every byte that arrives from the transport
   * pushes the deadline out, so a slow-but-responsive device is never cut off
   * mid-handshake -- only genuine silence for this many ms triggers the abort.
   *
   * This matters for auto-reconnect and for devices that are paired/open but
   * unresponsive (e.g. sitting in the bootloader, or advertising Studio while
   * not actually answering): `call_rpc` holds a process-wide mutex while
   * awaiting a response, so without a timeout a silent device hangs the
   * connect forever *and* wedges every later RPC behind the never-released
   * mutex. On timeout we abort the connection, which errors the RPC streams,
   * releases that mutex, and closes the underlying transport (serial port),
   * leaving the app free to retry.
   */
  connectTimeoutMs?: number;
}

/**
 * Notification subscription types
 */
export type NotificationSubscription =
  | { type: "core"; callback: (notification: CoreNotification) => void }
  | { type: "keymap"; callback: (notification: KeymapNotification) => void }
  | {
      type: "custom";
      subsystemIndex: number;
      callback: (notification: CustomNotification) => void;
    };

export interface ZMKAppState {
  /** RPC connection to the device */
  connection: RpcConnection | null;
  /** Device information */
  deviceInfo: GetDeviceInfoResponse | null;
  /** Available custom subsystems */
  customSubsystems: ListCustomSubsystemResponse | null;
  /** Whether the app is currently loading */
  isLoading: boolean;
  /** Any error that occurred */
  error: string | null;
}

export interface UseZMKAppReturn {
  /** Current app state */
  state: ZMKAppState;
  /** Connect to a device */
  connect: (connectFunction: () => Promise<RpcTransport>) => Promise<void>;
  /** Disconnect from the device */
  disconnect: () => void;
  /** Find a specific subsystem by identifier */
  findSubsystem: (
    identifier: string
  ) => { index: number; identifier: string } | null;
  /** Whether we're currently connected */
  isConnected: boolean;
  /** Subscribe to notifications */
  onNotification: (subscription: NotificationSubscription) => () => void;
  /**
   * Returns the epoch-ms timestamp of the last byte received from the
   * connected transport. Used by callRPC to implement a sliding-window
   * inactivity timeout: the timeout only fires if the device has been silent
   * for `timeoutMs` ms, so an actively-responding device is never cut off.
   * Returns `null` when no transport is active.
   */
  lastPacketMs: (() => number) | null;
}

/**
 * Hook for managing ZMK application state
 * Handles connection lifecycle, device discovery, and subsystem enumeration
 */
export function useZMKApp(options: UseZMKAppOptions = {}): UseZMKAppReturn {
  const connectTimeoutMs =
    options.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS;

  const [state, setState] = useState<ZMKAppState>({
    connection: null,
    deviceInfo: null,
    customSubsystems: null,
    isLoading: false,
    error: null,
  });

  const abortControllerRef = useRef<AbortController | null>(null);
  const lastPacketMsRef = useRef<number>(Date.now());
  const lastPacketMsFnRef = useRef<(() => number) | null>(null);

  // Consolidated callbacks for official notification types
  const notificationCallbacksRef = useRef<{
    core: Set<(notification: CoreNotification) => void>;
    keymap: Set<(notification: KeymapNotification) => void>;
  }>({
    core: new Set(),
    keymap: new Set(),
  });

  // Custom notifications need a Map since they're indexed by subsystem
  const customNotificationCallbacksRef = useRef<
    Map<number, Set<(notification: CustomNotification) => void>>
  >(new Map());

  /**
   * Connect to a ZMK device
   *
   * If the user dismisses the browser's device picker (see
   * {@link isUserCancelledError}), the attempt is abandoned silently:
   * `isLoading` resets to `false` and `state.error` stays `null`, since
   * cancelling a picker is a normal user action, not a failure. All other
   * errors are logged and surfaced via `state.error`.
   *
   * @param connectFunction - Function that creates and returns the transport connection
   */
  const connect = useCallback(
    async (connectFunction: () => Promise<RpcTransport>) => {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      // Clear last-packet tracking; a new connection starts fresh.
      lastPacketMsRef.current = Date.now();
      lastPacketMsFnRef.current = null;

      // Create new AbortController for this connection
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      // Set once the handshake watchdog fires, so the catch/guard below can
      // report the timeout rather than the generic abort/`null` symptom it
      // triggers downstream.
      let timedOut = false;
      let timeoutId: ReturnType<typeof setTimeout> | undefined;

      let transport: RpcTransport | null = null;
      try {
        // Step 1: Establish transport and wrap its readable stream with an
        // activity tracker so any incoming byte updates the last-packet
        // timestamp. This drives both the handshake watchdog below and the
        // sliding-window inactivity timeout used by callRPC.
        transport = await connectFunction();

        const lastPacketRef = { current: Date.now() };
        const trackedReadable = transport.readable.pipeThrough(
          new TransformStream<Uint8Array, Uint8Array>({
            transform(chunk, controller) {
              lastPacketRef.current = Date.now();
              controller.enqueue(chunk);
            },
          })
        );
        lastPacketMsRef.current = lastPacketRef.current;
        const lastPacketMs = () => lastPacketRef.current;
        lastPacketMsFnRef.current = lastPacketMs;

        const trackedTransport: RpcTransport = {
          ...transport,
          readable: trackedReadable,
        };

        const connection = create_rpc_connection(trackedTransport, {
          signal: abortController.signal,
        });

        // Step 2: Arm the handshake watchdog. Aborting (rather than just
        // racing a timer) is essential: `call_rpc` holds a process-wide mutex
        // while awaiting its response, so a silent device would otherwise
        // deadlock this connect *and* every future RPC. Aborting errors the
        // response stream, which rejects the pending read, releases the mutex,
        // and tears down the transport (closing the serial port).
        //
        // The watchdog is activity-based: rather than a single fixed deadline
        // from connect-start, it re-checks against the last-packet timestamp
        // and only aborts once the device has been silent for
        // `connectTimeoutMs`. A slow-but-responsive device that keeps sending
        // bytes therefore keeps pushing the deadline out and is never cut off
        // mid-handshake.
        const armWatchdog = () => {
          const remaining = connectTimeoutMs - (Date.now() - lastPacketRef.current);
          if (remaining <= 0) {
            timedOut = true;
            abortController.abort(new Error(CONNECT_TIMEOUT_ERROR));
          } else {
            timeoutId = setTimeout(armWatchdog, remaining);
          }
        };
        timeoutId = setTimeout(armWatchdog, connectTimeoutMs);

        // Step 3: Fetch device information
        const deviceInfo = await fetchDeviceInfo(connection);
        if (!deviceInfo) {
          throw new Error(
            timedOut ? CONNECT_TIMEOUT_ERROR : "Failed to get device information"
          );
        }

        // Step 4: Fetch custom subsystems (optional - won't fail connection)
        const customSubsystems = await fetchCustomSubsystems(connection);

        // A timeout during subsystem discovery still aborts the connection, so
        // don't present it as connected even though that step swallows errors.
        if (timedOut) {
          throw new Error(CONNECT_TIMEOUT_ERROR);
        }

        // Step 5: Update state with successful connection
        setState({
          connection,
          deviceInfo,
          customSubsystems,
          isLoading: false,
          error: null,
        });
      } catch (error) {
        // Properly close the transport so we don't leave a dangling connection.
        transport?.abortController.abort(error);
        lastPacketMsFnRef.current = null;

        // User dismissed the device picker: not a failure, just stop loading.
        if (isUserCancelledError(error)) {
          setState((prev) => ({ ...prev, isLoading: false }));
          return;
        }

        const errorMessage = timedOut
          ? CONNECT_TIMEOUT_ERROR
          : error instanceof Error
            ? error.message
            : "Unknown connection error";

        console.error("Connection failed:", error);

        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: errorMessage,
        }));
      } finally {
        if (timeoutId !== undefined) {
          clearTimeout(timeoutId);
        }
      }
    },
    [connectTimeoutMs]
  );

  /**
   * Fetch device information from the connected device
   */
  const fetchDeviceInfo = async (
    connection: RpcConnection
  ): Promise<GetDeviceInfoResponse | null> => {
    try {
      const response = await call_rpc(connection, {
        core: { getDeviceInfo: true },
      });
      return response.core?.getDeviceInfo || null;
    } catch (error) {
      console.error("Failed to get device info", error);
      return null;
    }
  };

  /**
   * Fetch available custom subsystems from the device
   */
  const fetchCustomSubsystems = async (
    connection: RpcConnection
  ): Promise<ListCustomSubsystemResponse | null> => {
    try {
      const response = await call_rpc(connection, {
        custom: { listCustomSubsystems: {} },
      });
      return response.custom?.listCustomSubsystems || null;
    } catch (error) {
      console.error("Failed to get custom subsystems", error);
      return null;
    }
  };

  /**
   * Disconnect from the current device
   * Aborts any ongoing operations and clears all state
   */
  const disconnect = useCallback(() => {
    // Abort any ongoing connection and RPC calls
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    lastPacketMsFnRef.current = null;

    // Clear all notification subscriptions
    notificationCallbacksRef.current.core.clear();
    notificationCallbacksRef.current.keymap.clear();
    customNotificationCallbacksRef.current.clear();

    // Reset state to initial values
    setState({
      connection: null,
      deviceInfo: null,
      customSubsystems: null,
      isLoading: false,
      error: null,
    });
  }, []);

  /**
   * Find a subsystem by its identifier string
   * @param identifier - The unique identifier of the subsystem to find
   * @returns The subsystem with its index and identifier, or null if not found
   */
  const findSubsystem = useCallback(
    (identifier: string) => {
      if (!state.customSubsystems) return null;

      const subsystem = state.customSubsystems.subsystems.find(
        (s) => s.identifier === identifier
      );

      return subsystem
        ? { index: subsystem.index, identifier: subsystem.identifier }
        : null;
    },
    [state.customSubsystems]
  );

  /**
   * Effect: Listen for incoming notifications from the device
   * Automatically starts/stops when connection changes
   */
  useEffect(() => {
    if (!state.connection) return;

    const reader = state.connection.notification_readable.getReader();
    const abortController = new AbortController();

    /**
     * Continuously read notifications from the stream and dispatch to subscribers
     */
    const processNotifications = async () => {
      try {
        while (!abortController.signal.aborted) {
          const { done, value } = await reader.read();
          if (done) break;

          // Dispatch notifications based on type
          if (value.core) {
            dispatchNotification("core", value.core);
          } else if (value.keymap) {
            dispatchNotification("keymap", value.keymap);
          } else if (value.custom?.customNotification) {
            dispatchCustomNotification(value.custom.customNotification);
          }
        }
      } catch (error) {
        // Only log errors if we weren't intentionally aborted
        if (!abortController.signal.aborted) {
          console.error("Error reading notifications:", error);
          disconnect();
        }
      } finally {
        reader.releaseLock();
      }
    };

    processNotifications();

    return () => {
      abortController.abort();
    };
  }, [state.connection, disconnect]);

  /**
   * Dispatch notification to all registered callbacks for a given type
   */
  const dispatchNotification = <T extends "core" | "keymap">(
    type: T,
    notification: T extends "core" ? CoreNotification : KeymapNotification
  ) => {
    notificationCallbacksRef.current[type].forEach((callback) =>
      callback(
        notification as T extends "core" ? CoreNotification : KeymapNotification
      )
    );
  };

  /**
   * Dispatch custom notification to all registered callbacks for a subsystem
   */
  const dispatchCustomNotification = (notification: CustomNotification) => {
    const callbacks = customNotificationCallbacksRef.current.get(
      notification.subsystemIndex
    );
    if (callbacks) {
      callbacks.forEach((callback) => callback(notification));
    }
  };

  /**
   * Subscribe to notifications
   * @param subscription - Notification subscription configuration
   * @returns Unsubscribe function to stop receiving notifications
   *
   * @example Core notifications
   * const unsubscribe = onNotification({
   *   type: 'core',
   *   callback: (notification) => {
   *     console.log('Lock state:', notification.lockStateChanged);
   *   }
   * });
   *
   * @example Keymap notifications
   * const unsubscribe = onNotification({
   *   type: 'keymap',
   *   callback: (notification) => {
   *     console.log('Unsaved changes:', notification.unsavedChangesStatusChanged);
   *   }
   * });
   *
   * @example Custom notifications
   * const unsubscribe = onNotification({
   *   type: 'custom',
   *   subsystemIndex: 0,
   *   callback: (notification) => {
   *     console.log('Custom payload:', notification.payload);
   *   }
   * });
   */
  const onNotification = useCallback(
    (subscription: NotificationSubscription) => {
      if (subscription.type === "core") {
        // Subscribe to core notifications
        notificationCallbacksRef.current.core.add(subscription.callback);
        return () => {
          notificationCallbacksRef.current.core.delete(subscription.callback);
        };
      } else if (subscription.type === "keymap") {
        // Subscribe to keymap notifications
        notificationCallbacksRef.current.keymap.add(subscription.callback);
        return () => {
          notificationCallbacksRef.current.keymap.delete(subscription.callback);
        };
      } else {
        // Subscribe to custom notifications for a specific subsystem
        const { subsystemIndex, callback } = subscription;
        let callbacks =
          customNotificationCallbacksRef.current.get(subsystemIndex);
        if (!callbacks) {
          callbacks = new Set();
          customNotificationCallbacksRef.current.set(subsystemIndex, callbacks);
        }
        callbacks.add(callback);

        return () => {
          const callbacks =
            customNotificationCallbacksRef.current.get(subsystemIndex);
          if (callbacks) {
            callbacks.delete(callback);
            // Clean up empty sets to prevent memory leaks
            if (callbacks.size === 0) {
              customNotificationCallbacksRef.current.delete(subsystemIndex);
            }
          }
        };
      }
    },
    []
  );

  const isConnected = !!state.connection;
  const lastPacketMs = lastPacketMsFnRef.current;

  return {
    state,
    connect,
    disconnect,
    findSubsystem,
    isConnected,
    onNotification,
    lastPacketMs,
  };
}
