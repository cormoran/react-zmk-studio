/**
 * Tests for ZMKConnection component
 */

import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { ZMKConnection } from "../src/ZMKConnection";
import type { RpcTransport } from "@zmkfirmware/zmk-studio-ts-client/transport/index";

// Mock the useZMKApp hook
jest.mock("../src/useZMKApp", () => ({
  useZMKApp: jest.fn(),
}));

describe("ZMKConnection", () => {
  let mockConnectFunction: jest.Mock;
  const { useZMKApp } = require("../src/useZMKApp");

  beforeEach(() => {
    jest.clearAllMocks();
    mockConnectFunction = jest.fn().mockResolvedValue({} as RpcTransport);
  });

  it("should render disconnected state", () => {
    useZMKApp.mockReturnValue({
      state: {
        connection: null,
        deviceInfo: null,
        customSubsystems: null,
        isLoading: false,
        error: null,
      },
      connect: jest.fn(),
      disconnect: jest.fn(),
      isConnected: false,
      findSubsystem: jest.fn(),
      onNotification: jest.fn(),
    });

    render(
      <ZMKConnection
        connectFunction={mockConnectFunction}
        renderDisconnected={({ connect, isLoading, error }) => (
          <div>
            <button onClick={connect}>Connect</button>
            {isLoading && <div>Loading...</div>}
            {error && <div>Error: {error}</div>}
          </div>
        )}
        renderConnected={() => <div>Connected</div>}
      />
    );

    expect(screen.getByText("Connect")).toBeDefined();
    expect(screen.queryByText("Connected")).toBeNull();
  });

  it("should render connected state", () => {
    useZMKApp.mockReturnValue({
      state: {
        connection: { label: "test" },
        deviceInfo: { name: "Test Device" },
        customSubsystems: {
          subsystems: [
            { index: 0, identifier: "test-subsystem" },
            { index: 1, identifier: "another-subsystem" },
          ],
        },
        isLoading: false,
        error: null,
      },
      connect: jest.fn(),
      disconnect: jest.fn(),
      isConnected: true,
      findSubsystem: jest.fn(),
      onNotification: jest.fn(),
    });

    render(
      <ZMKConnection
        connectFunction={mockConnectFunction}
        renderDisconnected={() => <div>Disconnected</div>}
        renderConnected={({ deviceName, subsystems, disconnect }) => (
          <div>
            <div>Device: {deviceName}</div>
            <div>Subsystems: {subsystems.length}</div>
            <button onClick={disconnect}>Disconnect</button>
          </div>
        )}
      />
    );

    expect(screen.getByText("Device: Test Device")).toBeDefined();
    expect(screen.getByText("Subsystems: 2")).toBeDefined();
    expect(screen.getByText("Disconnect")).toBeDefined();
    expect(screen.queryByText("Disconnected")).toBeNull();
  });

  it("should show loading state", () => {
    useZMKApp.mockReturnValue({
      state: {
        connection: null,
        deviceInfo: null,
        customSubsystems: null,
        isLoading: true,
        error: null,
      },
      connect: jest.fn(),
      disconnect: jest.fn(),
      isConnected: false,
      findSubsystem: jest.fn(),
      onNotification: jest.fn(),
    });

    render(
      <ZMKConnection
        connectFunction={mockConnectFunction}
        renderDisconnected={({ isLoading }) => (
          <div>{isLoading ? "Connecting..." : "Not connected"}</div>
        )}
        renderConnected={() => <div>Connected</div>}
      />
    );

    expect(screen.getByText("Connecting...")).toBeDefined();
  });

  it("should show error state", () => {
    useZMKApp.mockReturnValue({
      state: {
        connection: null,
        deviceInfo: null,
        customSubsystems: null,
        isLoading: false,
        error: "Connection failed",
      },
      connect: jest.fn(),
      disconnect: jest.fn(),
      isConnected: false,
      findSubsystem: jest.fn(),
      onNotification: jest.fn(),
    });

    render(
      <ZMKConnection
        connectFunction={mockConnectFunction}
        renderDisconnected={({ error }) => (
          <div>{error ? `Error: ${error}` : "No error"}</div>
        )}
        renderConnected={() => <div>Connected</div>}
      />
    );

    expect(screen.getByText("Error: Connection failed")).toBeDefined();
  });

  it("should provide findSubsystem function to connected render", () => {
    const mockFindSubsystem = jest
      .fn()
      .mockReturnValue({ index: 1, identifier: "test" });

    useZMKApp.mockReturnValue({
      state: {
        connection: { label: "test" },
        deviceInfo: { name: "Test" },
        customSubsystems: { subsystems: [] },
        isLoading: false,
        error: null,
      },
      connect: jest.fn(),
      disconnect: jest.fn(),
      isConnected: true,
      findSubsystem: mockFindSubsystem,
      onNotification: jest.fn(),
    });

    render(
      <ZMKConnection
        connectFunction={mockConnectFunction}
        renderDisconnected={() => <div>Disconnected</div>}
        renderConnected={({ findSubsystem }) => {
          const subsystem = findSubsystem("test");
          return <div>Found: {subsystem?.identifier}</div>;
        }}
      />
    );

    expect(screen.getByText("Found: test")).toBeDefined();
    expect(mockFindSubsystem).toHaveBeenCalledWith("test");
  });
});
