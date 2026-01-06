/**
 * Tests for test helpers
 * This file validates that the testing utilities work correctly
 */

import React, { useContext } from "react";
import { render, screen } from "@testing-library/react";
import {
  createMockTransport,
  createMockConnection,
  createMockDeviceInfo,
  createMockSubsystems,
  createCoreNotification,
  createKeymapNotification,
  createCustomNotification,
  createMockZMKAppState,
  createMockZMKApp,
  createConnectedMockZMKApp,
  ZMKAppProvider,
  setupZMKMocks,
  waitForNotification,
  createMockNotificationReader,
} from "../src/testing";
import { ZMKAppContext } from "../src/ZMKAppContext";

// Mock the zmk-studio-ts-client
jest.mock("@zmkfirmware/zmk-studio-ts-client", () => ({
  create_rpc_connection: jest.fn(),
  call_rpc: jest.fn(),
}));

describe("Test Helpers", () => {
  describe("createMockTransport", () => {
    it("should create a mock transport with required properties", () => {
      const transport = createMockTransport();

      expect(transport.label).toBeDefined();
      expect(transport.abortController).toBeDefined();
      expect(transport.readable).toBeDefined();
      expect(transport.writable).toBeDefined();
    });
  });

  describe("createMockNotificationReader", () => {
    it("should create a reader that emits notifications in order", async () => {
      const notifications = [
        { custom: { customNotification: { subsystemIndex: 0, payload: new Uint8Array([1]) } } },
        { core: { lockStateChanged: { locked: true } } },
      ];
      const reader = createMockNotificationReader(notifications);

      const result1 = await reader.read();
      expect(result1.done).toBe(false);
      expect(result1.value).toEqual(notifications[0]);

      const result2 = await reader.read();
      expect(result2.done).toBe(false);
      expect(result2.value).toEqual(notifications[1]);
    });

    it("should never resolve after all notifications are emitted", async () => {
      const reader = createMockNotificationReader([]);
      
      let resolved = false;
      reader.read().then(() => { resolved = true; });
      
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(resolved).toBe(false);
    });

    it("should have releaseLock function", () => {
      const reader = createMockNotificationReader();
      expect(reader.releaseLock).toBeDefined();
      expect(jest.isMockFunction(reader.releaseLock)).toBe(true);
    });
  });

  describe("createMockConnection", () => {
    it("should create a connection with default values", () => {
      const connection = createMockConnection();

      expect(connection.label).toBe("test");
      expect(connection.current_request).toBe(0);
      expect(connection.notification_readable).toBeDefined();
    });

    it("should create a connection with custom label", () => {
      const connection = createMockConnection({ label: "custom" });

      expect(connection.label).toBe("custom");
    });

    it("should create a connection with notifications", () => {
      const notifications = [{ test: "notification" }];
      const connection = createMockConnection({ notifications });

      const reader = connection.notification_readable.getReader();
      expect(reader).toBeDefined();
    });
  });

  describe("createMockDeviceInfo", () => {
    it("should create device info with default values", () => {
      const deviceInfo = createMockDeviceInfo();

      expect(deviceInfo.name).toBe("Test Device");
      expect(deviceInfo.serialNumber).toBeInstanceOf(Uint8Array);
    });

    it("should override default values", () => {
      const deviceInfo = createMockDeviceInfo({
        name: "Custom Device",
        serialNumber: new Uint8Array([5, 6, 7, 8]),
      });

      expect(deviceInfo.name).toBe("Custom Device");
      expect(deviceInfo.serialNumber).toEqual(new Uint8Array([5, 6, 7, 8]));
    });
  });

  describe("createMockSubsystems", () => {
    it("should create empty subsystems list", () => {
      const subsystems = createMockSubsystems();

      expect(subsystems.subsystems).toEqual([]);
    });

    it("should create subsystems from string identifiers", () => {
      const subsystems = createMockSubsystems(["subsystem1", "subsystem2"]);

      expect(subsystems.subsystems).toEqual([
        { index: 0, identifier: "subsystem1", uiUrl: [] },
        { index: 1, identifier: "subsystem2", uiUrl: [] },
      ]);
    });

    it("should create subsystems from objects", () => {
      const subsystems = createMockSubsystems([
        { index: 5, identifier: "custom1" },
        { index: 10, identifier: "custom2", uiUrl: ["http://example.com"] },
      ]);

      expect(subsystems.subsystems).toEqual([
        { index: 5, identifier: "custom1", uiUrl: [] },
        { index: 10, identifier: "custom2", uiUrl: ["http://example.com"] },
      ]);
    });

    it("should mix strings and objects", () => {
      const subsystems = createMockSubsystems([
        "string-subsystem",
        { index: 99, identifier: "object-subsystem" },
      ]);

      expect(subsystems.subsystems).toHaveLength(2);
      expect(subsystems.subsystems[0]).toEqual({
        index: 0,
        identifier: "string-subsystem",
        uiUrl: [],
      });
      expect(subsystems.subsystems[1]).toEqual({
        index: 99,
        identifier: "object-subsystem",
        uiUrl: [],
      });
    });
  });

  describe("createCoreNotification", () => {
    it("should create a core notification", () => {
      const notification = createCoreNotification({
        lockStateChanged: 0, // ZMK_STUDIO_CORE_LOCK_STATE_LOCKED
      });

      expect(notification.lockStateChanged).toEqual(0);
    });
  });

  describe("createKeymapNotification", () => {
    it("should create a keymap notification", () => {
      const notification = createKeymapNotification({
        unsavedChangesStatusChanged: true,
      });

      expect(notification.unsavedChangesStatusChanged).toBe(true);
    });
  });

  describe("createCustomNotification", () => {
    it("should create a custom notification", () => {
      const payload = new Uint8Array([1, 2, 3]);
      const notification = createCustomNotification(5, payload);

      expect(notification.subsystemIndex).toBe(5);
      expect(notification.payload).toEqual(payload);
    });

    it("should create a custom notification with empty payload by default", () => {
      const notification = createCustomNotification(0);

      expect(notification.subsystemIndex).toBe(0);
      expect(notification.payload).toBeInstanceOf(Uint8Array);
      expect(notification.payload.length).toBe(0);
    });
  });

  describe("createMockZMKAppState", () => {
    it("should create state with default values", () => {
      const state = createMockZMKAppState();

      expect(state.connection).toBeNull();
      expect(state.deviceInfo).toBeNull();
      expect(state.customSubsystems).toBeNull();
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
    });

    it("should override default values", () => {
      const connection = createMockConnection();
      const state = createMockZMKAppState({
        connection,
        isLoading: true,
        error: "Test error",
      });

      expect(state.connection).toBe(connection);
      expect(state.isLoading).toBe(true);
      expect(state.error).toBe("Test error");
    });
  });

  describe("createMockZMKApp", () => {
    it("should create a mock ZMK app with default values", () => {
      const zmkApp = createMockZMKApp();

      expect(zmkApp.state.connection).toBeNull();
      expect(zmkApp.isConnected).toBe(false);
      expect(jest.isMockFunction(zmkApp.connect)).toBe(true);
      expect(jest.isMockFunction(zmkApp.disconnect)).toBe(true);
      expect(jest.isMockFunction(zmkApp.findSubsystem)).toBe(true);
      expect(jest.isMockFunction(zmkApp.onNotification)).toBe(true);
    });

    it("should sync isConnected with state.connection", () => {
      const connection = createMockConnection();
      const zmkApp = createMockZMKApp({
        state: { connection } as any,
      });

      expect(zmkApp.isConnected).toBe(true);
    });

    it("should allow overriding methods", () => {
      const customConnect = jest.fn();
      const zmkApp = createMockZMKApp({
        connect: customConnect,
      });

      expect(zmkApp.connect).toBe(customConnect);
    });
  });

  describe("createConnectedMockZMKApp", () => {
    it("should create a connected ZMK app with default device", () => {
      const zmkApp = createConnectedMockZMKApp();

      expect(zmkApp.isConnected).toBe(true);
      expect(zmkApp.state.connection).not.toBeNull();
      expect(zmkApp.state.deviceInfo?.name).toBe("Test Device");
      expect(zmkApp.state.customSubsystems?.subsystems).toEqual([]);
    });

    it("should create a connected ZMK app with custom device name", () => {
      const zmkApp = createConnectedMockZMKApp({
        deviceName: "My Custom Device",
      });

      expect(zmkApp.state.deviceInfo?.name).toBe("My Custom Device");
    });

    it("should create a connected ZMK app with subsystems", () => {
      const zmkApp = createConnectedMockZMKApp({
        subsystems: ["subsystem1", "subsystem2"],
      });

      expect(zmkApp.state.customSubsystems?.subsystems).toHaveLength(2);
      expect(zmkApp.state.customSubsystems?.subsystems[0]).toMatchObject({
        index: 0,
        identifier: "subsystem1",
      });
    });

    it("should have working findSubsystem function", () => {
      const zmkApp = createConnectedMockZMKApp({
        subsystems: ["test-subsystem", "another-subsystem"],
      });

      const found = zmkApp.findSubsystem("another-subsystem");
      expect(found).toMatchObject({
        index: 1,
        identifier: "another-subsystem",
      });

      const notFound = zmkApp.findSubsystem("non-existent");
      expect(notFound).toBeNull();
    });
  });

  describe("ZMKAppProvider", () => {
    it("should provide ZMKAppContext to children", () => {
      const mockZMKApp = createMockZMKApp();

      function TestComponent() {
        const zmkApp = useContext(ZMKAppContext);
        return <div>{zmkApp ? "Has context" : "No context"}</div>;
      }

      render(
        <ZMKAppProvider value={mockZMKApp}>
          <TestComponent />
        </ZMKAppProvider>
      );

      expect(screen.getByText("Has context")).toBeDefined();
    });

    it("should provide null context when value is null", () => {
      function TestComponent() {
        const zmkApp = useContext(ZMKAppContext);
        return <div>{zmkApp ? "Has context" : "No context"}</div>;
      }

      render(
        <ZMKAppProvider value={null}>
          <TestComponent />
        </ZMKAppProvider>
      );

      expect(screen.getByText("No context")).toBeDefined();
    });

    it("should allow children to access provided ZMK app state", () => {
      const mockZMKApp = createConnectedMockZMKApp({
        deviceName: "Provider Test Device",
      });

      function TestComponent() {
        const zmkApp = useContext(ZMKAppContext);
        return <div>Device: {zmkApp?.state.deviceInfo?.name}</div>;
      }

      render(
        <ZMKAppProvider value={mockZMKApp}>
          <TestComponent />
        </ZMKAppProvider>
      );

      expect(screen.getByText("Device: Provider Test Device")).toBeDefined();
    });
  });

  describe("setupZMKMocks", () => {
    let mocks: ReturnType<typeof setupZMKMocks>;

    beforeEach(() => {
      mocks = setupZMKMocks();
    });

    it("should create mock transport and connection", () => {
      expect(mocks.mockTransport).toBeDefined();
      expect(mocks.mockConnection).toBeDefined();
    });

    it("should expose create_rpc_connection and call_rpc mocks", () => {
      expect(mocks.create_rpc_connection).toBeDefined();
      expect(mocks.call_rpc).toBeDefined();
      expect(jest.isMockFunction(mocks.create_rpc_connection)).toBe(true);
      expect(jest.isMockFunction(mocks.call_rpc)).toBe(true);
    });

    it("should mock successful connection", () => {
      const result = mocks.mockSuccessfulConnection({
        deviceName: "Mock Device",
        subsystems: ["subsystem1"],
      });

      expect(result.deviceInfo.name).toBe("Mock Device");
      expect(result.subsystems.subsystems).toHaveLength(1);
      
      // Verify mocks are configured correctly
      expect(mocks.create_rpc_connection).toBeDefined();
      expect(mocks.call_rpc).toBeDefined();
    });

    it("should mock failed connection", () => {
      mocks.mockFailedConnection("Test error");

      expect(() => mocks.create_rpc_connection()).toThrow("Test error");
    });

    it("should mock failed connection with Error object", () => {
      const error = new Error("Custom error");
      mocks.mockFailedConnection(error);

      expect(() => mocks.create_rpc_connection()).toThrow(error);
    });

    it("should mock failed device info", () => {
      mocks.mockFailedDeviceInfo();

      // Verify mocks are configured correctly
      expect(mocks.create_rpc_connection).toBeDefined();
      expect(mocks.call_rpc).toBeDefined();
    });

    it("should allow custom device info in successful connection", () => {
      const result = mocks.mockSuccessfulConnection({
        deviceName: "Test",
        deviceInfo: {
          serialNumber: new Uint8Array([9, 9, 9]),
        },
      });

      expect(result.deviceInfo.name).toBe("Test");
      expect(result.deviceInfo.serialNumber).toEqual(new Uint8Array([9, 9, 9]));
    });
  });

  describe("waitForNotification", () => {
    it("should resolve when callback is called", async () => {
      const callback = jest.fn();
      
      setTimeout(() => callback({ test: "data" }), 10);
      
      await expect(waitForNotification(callback)).resolves.toBeUndefined();
      expect(callback).toHaveBeenCalled();
    });

    it("should timeout if callback is not called", async () => {
      const callback = jest.fn();
      
      await expect(waitForNotification(callback, 50)).rejects.toThrow(
        "Timeout waiting for notification"
      );
    });

    it("should use custom timeout", async () => {
      const callback = jest.fn();
      const startTime = Date.now();
      
      try {
        await waitForNotification(callback, 100);
      } catch (e) {
        const elapsed = Date.now() - startTime;
        expect(elapsed).toBeGreaterThanOrEqual(100);
        expect(elapsed).toBeLessThan(200);
      }
    });

    it("should resolve immediately if callback already called", async () => {
      const callback = jest.fn();
      callback({ test: "data" });
      
      const startTime = Date.now();
      await waitForNotification(callback);
      const elapsed = Date.now() - startTime;
      
      expect(elapsed).toBeLessThan(100);
    });
  });
});
