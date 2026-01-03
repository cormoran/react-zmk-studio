/**
 * ZMKConnection Component
 * A headless component providing connection management UI logic without styling
 */

import React from "react";
import { useZMKApp } from "./useZMKApp";
import type { UseZMKAppReturn } from "./useZMKApp";
import { ZMKAppContext } from "./ZMKAppContext";
import type { RpcTransport } from "@zmkfirmware/zmk-studio-ts-client/transport/index";

export interface ZMKConnectionProps {
  /** Optional external ZMK app state. If provided, ZMKConnection won't create its own useZMKApp instance */
  zmkApp?: UseZMKAppReturn;
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
  renderDisconnected,
  renderConnected,
}: ZMKConnectionProps) {
  // Always call useZMKApp unconditionally (React hooks rule)
  const internalZmkApp = useZMKApp();
  // Use external zmkApp if provided, otherwise use internal instance
  const zmkApp = externalZmkApp ?? internalZmkApp;

  const { state, connect, disconnect, isConnected, findSubsystem } = zmkApp;

  const handleConnect = async (
    connectFunction: () => Promise<RpcTransport>
  ) => {
    await connect(connectFunction);
  };

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
