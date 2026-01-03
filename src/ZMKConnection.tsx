/**
 * ZMKConnection Component
 * A headless component providing connection management UI logic without styling
 */

import React from "react";
import { useZMKApp } from "./useZMKApp";
import type { RpcTransport } from "@zmkfirmware/zmk-studio-ts-client/transport/index";

export interface ZMKConnectionProps {
  /** Function to establish the transport connection */
  connectFunction: () => Promise<RpcTransport>;
  /** Render prop for when disconnected */
  renderDisconnected: (props: {
    connect: () => Promise<void>;
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
 */
export function ZMKConnection({
  connectFunction,
  renderDisconnected,
  renderConnected,
}: ZMKConnectionProps) {
  const { state, connect, disconnect, isConnected, findSubsystem } =
    useZMKApp();

  const handleConnect = async () => {
    await connect(connectFunction);
  };

  // Disconnected state: show connection UI
  if (!isConnected) {
    return renderDisconnected({
      connect: handleConnect,
      isLoading: state.isLoading,
      error: state.error,
    }) as React.ReactElement;
  }

  // Connected state: show device management UI
  const subsystems =
    state.customSubsystems?.subsystems.map((s) => ({
      index: s.index,
      identifier: s.identifier,
    })) ?? [];

  return renderConnected({
    disconnect,
    deviceName: state.deviceInfo?.name,
    subsystems,
    findSubsystem,
  }) as React.ReactElement;
}
