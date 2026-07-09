/**
 * ZMKConnection Component
 * A headless component providing connection management UI logic without styling
 */

import React, { useEffect, useRef } from "react";
import { useZMKApp } from "./useZMKApp";
import type { UseZMKAppReturn } from "./useZMKApp";
import { ZMKAppContext } from "./ZMKAppContext";
import type { RpcTransport } from "@zmkfirmware/zmk-studio-ts-client/transport/index";
import { connectToPairedSerial } from "./serialReconnect";

export interface ZMKConnectionProps {
  /** Optional external ZMK app state. If provided, ZMKConnection won't create its own useZMKApp instance */
  zmkApp?: UseZMKAppReturn;
  /**
   * When `true`, attempt to reconnect (once, on mount) to a previously
   * paired serial port via `navigator.serial.getPorts()` -- no device picker
   * is shown. If there is no paired port, or the attempt fails, the
   * component silently stays disconnected (a `console.warn` is emitted at
   * most; `state.error` is not set).
   *
   * Defaults to `false`.
   */
  autoReconnect?: boolean;
  /**
   * How long (ms) to wait for the device to answer the initial RPC handshake
   * before giving up on a connect attempt. Forwarded to the internally
   * created `useZMKApp` -- ignored when an external `zmkApp` is supplied (pass
   * the option to your own `useZMKApp(...)` call instead). Defaults to 5000.
   *
   * Without this, reconnecting to a paired-but-unresponsive device (e.g. one
   * sitting in the bootloader) would hang forever waiting for a response.
   */
  connectTimeoutMs?: number;
  /** Render prop for when disconnected */
  renderDisconnected: (props: {
    connect: (connectFunction: () => Promise<RpcTransport>) => Promise<void>;
    isLoading: boolean;
    error: string | null;
  }) => React.ReactNode;
  /** Render prop for when connected */
  renderConnected: (props: {
    disconnect: () => void;
    deviceName: string | undefined;
    subsystems: Array<{ index: number; identifier: string }>;
    findSubsystem: (identifier: string) => {
      index: number;
      identifier: string;
    } | null;
  }) => React.ReactNode;
}

/**
 * Headless connection management component
 * Provides connection state management without any styling
 *
 * - If zmkApp prop is provided, uses that instance (allows parent to manage state)
 * - If zmkApp prop is not provided, creates its own instance internally
 * - Always provides ZMKAppContext to children for easy access via useZMKAppContext
 */
export function ZMKConnection({
  zmkApp: externalZmkApp,
  autoReconnect = false,
  connectTimeoutMs,
  renderDisconnected,
  renderConnected,
}: ZMKConnectionProps) {
  // Always call useZMKApp unconditionally (React hooks rule)
  const internalZmkApp = useZMKApp({ connectTimeoutMs });
  // Use external zmkApp if provided, otherwise use internal instance
  const zmkApp = externalZmkApp ?? internalZmkApp;

  const { state, connect, disconnect, isConnected, findSubsystem } = zmkApp;

  const handleConnect = async (
    connectFunction: () => Promise<RpcTransport>
  ) => {
    await connect(connectFunction);
  };

  // Attempt a silent, one-shot reconnect to a previously paired serial port
  // on mount. Guarded by a ref so React StrictMode's double-invoke of
  // effects (and unmount races) don't trigger it twice or act on a stale
  // component instance.
  const autoReconnectAttemptedRef = useRef(false);
  useEffect(() => {
    if (!autoReconnect || autoReconnectAttemptedRef.current) return;
    autoReconnectAttemptedRef.current = true;

    let cancelled = false;

    (async () => {
      try {
        const transport = await connectToPairedSerial();
        if (!transport || cancelled) return;
        await connect(() => Promise.resolve(transport));
      } catch (error) {
        if (!cancelled) {
          console.warn("Auto-reconnect to paired serial port failed:", error);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoReconnect]);

  // Prepare render content
  let content: React.ReactElement;

  // Disconnected state: show connection UI
  if (!isConnected) {
    content = renderDisconnected({
      connect: handleConnect,
      isLoading: state.isLoading,
      error: state.error,
    }) as React.ReactElement;
  } else {
    // Connected state: show device management UI
    const subsystems =
      state.customSubsystems?.subsystems.map((s) => ({
        index: s.index,
        identifier: s.identifier,
      })) ?? [];

    content = renderConnected({
      disconnect,
      deviceName: state.deviceInfo?.name,
      subsystems,
      findSubsystem,
    }) as React.ReactElement;
  }

  // Provide context to children
  return (
    <ZMKAppContext.Provider value={zmkApp}>{content}</ZMKAppContext.Provider>
  );
}
