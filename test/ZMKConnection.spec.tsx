/**
 * Tests for ZMKConnection component
 */

import React, { useContext } from "react";
import { render, screen } from "@testing-library/react";
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
        renderDisconnected={({ connect, isLoading, error }) => (
          <div>
            <button onClick={() => connect(mockConnectFunction)}>
              Connect
            </button>
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
        deviceInfo: { name: "Test Device", serialNumber: new Uint8Array() },
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
        deviceInfo: { name: "Test", serialNumber: new Uint8Array() },
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

  it("should use external zmkApp prop when provided", () => {
    // Create a minimal mock connection that satisfies the RpcConnection type
    const mockConnection = {
      label: "external",
      current_request: 0,
      request_response_readable: {} as any,
      request_writable: {} as any,
      notification_readable: {
        getReader: jest.fn(),
      } as any,
    };

    const externalZmkApp = {
      state: {
        connection: mockConnection,
        deviceInfo: { name: "External Device", serialNumber: new Uint8Array() },
        customSubsystems: { subsystems: [] },
        isLoading: false,
        error: null,
      },
      connect: jest.fn(),
      disconnect: jest.fn(),
      isConnected: true,
      findSubsystem: jest.fn(),
      onNotification: jest.fn(),
    };

    // useZMKApp should NOT be called when zmkApp prop is provided
    useZMKApp.mockReturnValue({
      state: {
        connection: null,
        deviceInfo: { name: "Internal Device", serialNumber: new Uint8Array() },
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
        zmkApp={externalZmkApp}
        renderDisconnected={() => <div>Disconnected</div>}
        renderConnected={({ deviceName }) => <div>Device: {deviceName}</div>}
      />
    );

    // Should use external zmkApp, not internal
    expect(screen.getByText("Device: External Device")).toBeDefined();
    expect(screen.queryByText("Device: Internal Device")).toBeNull();
  });

  it("should provide ZMKAppContext to children", () => {
    const { ZMKAppContext } = require("../src/ZMKAppContext");

    const mockConnection = {
      label: "test",
      current_request: 0,
      request_response_readable: {} as any,
      request_writable: {} as any,
      notification_readable: {
        getReader: jest.fn(),
      } as any,
    };

    const mockZmkApp = {
      state: {
        connection: mockConnection,
        deviceInfo: { name: "Context Test", serialNumber: new Uint8Array() },
        customSubsystems: { subsystems: [] },
        isLoading: false,
        error: null,
      },
      connect: jest.fn(),
      disconnect: jest.fn(),
      isConnected: true,
      findSubsystem: jest.fn(),
      onNotification: jest.fn(),
    };

    useZMKApp.mockReturnValue(mockZmkApp);

    function ChildComponent() {
      const zmkApp = useContext(ZMKAppContext);
      return (
        <div>
          Child sees: {(zmkApp as any)?.state?.deviceInfo?.name ?? "Nothing"}
        </div>
      );
    }

    render(
      <ZMKConnection
        renderDisconnected={() => <div>Disconnected</div>}
        renderConnected={() => (
          <div>
            <div>Connected</div>
            <ChildComponent />
          </div>
        )}
      />
    );

    expect(screen.getByText("Child sees: Context Test")).toBeDefined();
  });

  it("should use internal zmkApp when zmkApp prop is not provided", () => {
    const mockConnection = {
      label: "internal",
      current_request: 0,
      request_response_readable: {} as any,
      request_writable: {} as any,
      notification_readable: {
        getReader: jest.fn(),
      } as any,
    };

    const internalZmkApp = {
      state: {
        connection: mockConnection,
        deviceInfo: { name: "Internal Device", serialNumber: new Uint8Array() },
        customSubsystems: { subsystems: [] },
        isLoading: false,
        error: null,
      },
      connect: jest.fn(),
      disconnect: jest.fn(),
      isConnected: true,
      findSubsystem: jest.fn(),
      onNotification: jest.fn(),
    };

    useZMKApp.mockReturnValue(internalZmkApp);

    render(
      <ZMKConnection
        renderDisconnected={() => <div>Disconnected</div>}
        renderConnected={({ deviceName }) => <div>Device: {deviceName}</div>}
      />
    );

    expect(screen.getByText("Device: Internal Device")).toBeDefined();
    expect(useZMKApp).toHaveBeenCalled();
  });
});
