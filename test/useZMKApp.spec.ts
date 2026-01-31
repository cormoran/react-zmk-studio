/**
 * Tests for useZMKApp hook
 */

import { renderHook, waitFor, act } from "@testing-library/react";
import { useZMKApp } from "../src/useZMKApp";
import { 
  setupZMKMocks, 
  createMockTransport,
  createMockConnection,
  createMockNotificationReader,
} from "../src/testing";

// Mock the zmk-studio-ts-client
jest.mock("@zmkfirmware/zmk-studio-ts-client", () => ({
  create_rpc_connection: jest.fn(),
  call_rpc: jest.fn(),
}));

describe("useZMKApp", () => {
  let mocks: ReturnType<typeof setupZMKMocks>;

  beforeEach(() => {
    mocks = setupZMKMocks();
  });

  it("should initialize with default state", () => {
    const { result } = renderHook(() => useZMKApp());

    expect(result.current.state.connection).toBeNull();
    expect(result.current.state.deviceInfo).toBeNull();
    expect(result.current.state.customSubsystems).toBeNull();
    expect(result.current.state.isLoading).toBe(false);
    expect(result.current.state.error).toBeNull();
    expect(result.current.isConnected).toBe(false);
  });

  it("should set loading state when connecting", async () => {
    const { result } = renderHook(() => useZMKApp());

    mocks.mockSuccessfulConnection({
      deviceName: "Test Device",
      subsystems: [],
    });

    const connectFunction = jest.fn().mockResolvedValue(mocks.mockTransport);

    await act(async () => {
      await result.current.connect(connectFunction);
    });

    expect(connectFunction).toHaveBeenCalled();
  });

  it("should successfully connect to a device", async () => {
    const { result } = renderHook(() => useZMKApp());

    const { deviceInfo, subsystems } = mocks.mockSuccessfulConnection({
      deviceName: "Test Device",
      subsystems: ["test-subsystem", "another-subsystem"],
    });

    const connectFunction = jest.fn().mockResolvedValue(mocks.mockTransport);

    await act(async () => {
      await result.current.connect(connectFunction);
    });

    expect(result.current.state.connection).not.toBeNull();
    expect(result.current.state.deviceInfo).toEqual(deviceInfo);
    expect(result.current.state.customSubsystems).toEqual(subsystems);
    expect(result.current.state.isLoading).toBe(false);
    expect(result.current.state.error).toBeNull();
    expect(result.current.isConnected).toBe(true);
  });

  it("should handle connection errors", async () => {
    const { result } = renderHook(() => useZMKApp());
    const error = new Error("Connection failed");
    const connectFunction = jest.fn().mockRejectedValue(error);

    await act(async () => {
      const spy = jest.spyOn(console, "error").mockImplementation(() => {});
      await result.current.connect(connectFunction);
      expect(spy).toHaveBeenCalledWith("Connection failed:", error);
      spy.mockRestore();
    });

    expect(result.current.state.connection).toBeNull();
    expect(result.current.state.isLoading).toBe(false);
    expect(result.current.state.error).toBe("Connection failed");
    expect(result.current.isConnected).toBe(false);
  });

  it("should handle device info retrieval failure", async () => {
    const { result } = renderHook(() => useZMKApp());

    mocks.mockFailedDeviceInfo();

    const connectFunction = jest.fn().mockResolvedValue(mocks.mockTransport);

    await act(async () => {
      const spy = jest.spyOn(console, "error").mockImplementation(() => {});
      await result.current.connect(connectFunction);
      expect(spy).toHaveBeenCalledWith("Connection failed:", expect.any(Error));
      spy.mockRestore();
    });

    expect(result.current.state.error).toBe("Failed to get device information");
    expect(result.current.isConnected).toBe(false);
  });

  it("should disconnect from device", async () => {
    const { result } = renderHook(() => useZMKApp());

    mocks.mockSuccessfulConnection({ deviceName: "Test" });

    const connectFunction = jest.fn().mockResolvedValue(mocks.mockTransport);

    await act(async () => {
      await result.current.connect(connectFunction);
    });

    expect(result.current.isConnected).toBe(true);

    // Then disconnect
    act(() => {
      result.current.disconnect();
    });

    expect(result.current.state.connection).toBeNull();
    expect(result.current.state.deviceInfo).toBeNull();
    expect(result.current.state.customSubsystems).toBeNull();
    expect(result.current.isConnected).toBe(false);
  });

  it("should find subsystem by identifier", async () => {
    const { result } = renderHook(() => useZMKApp());

    mocks.mockSuccessfulConnection({
      deviceName: "Test",
      subsystems: ["test-subsystem", "another-subsystem"],
    });

    const connectFunction = jest.fn().mockResolvedValue(mocks.mockTransport);

    await act(async () => {
      await result.current.connect(connectFunction);
    });

    expect(result.current.isConnected).toBe(true);

    const found = result.current.findSubsystem("another-subsystem");
    expect(found).toMatchObject({ index: 1, identifier: "another-subsystem" });

    const notFound = result.current.findSubsystem("non-existent");
    expect(notFound).toBeNull();
  });

  it("should return null when finding subsystem without connection", () => {
    const { result } = renderHook(() => useZMKApp());

    const found = result.current.findSubsystem("any-subsystem");
    expect(found).toBeNull();
  });

  it("should handle notification subscriptions", async () => {
    const { result } = renderHook(() => useZMKApp());

    const customNotification = {
      custom: {
        customNotification: {
          subsystemIndex: 0,
          payload: new Uint8Array([1, 2, 3]),
        },
      },
    };

    mocks.mockSuccessfulConnection({
      deviceName: "Test",
      subsystems: [],
      notifications: [customNotification],
    });

    const connectFunction = jest.fn().mockResolvedValue(mocks.mockTransport);
    const notificationCallback = jest.fn();

    // Subscribe to custom notifications before connecting
    const unsubscribe = result.current.onNotification({
      type: "custom",
      subsystemIndex: 0,
      callback: notificationCallback,
    });

    await act(async () => {
      await result.current.connect(connectFunction);
    });

    expect(result.current.isConnected).toBe(true);

    // Wait for notification to be processed
    await waitFor(() => {
      expect(notificationCallback).toHaveBeenCalledWith({
        subsystemIndex: 0,
        payload: expect.any(Uint8Array),
      });
    });

    // Unsubscribe
    unsubscribe();
  });

  it("should pass AbortSignal to create_rpc_connection", async () => {
    const { result } = renderHook(() => useZMKApp());

    mocks.mockSuccessfulConnection({ deviceName: "Test" });

    const connectFunction = jest.fn().mockResolvedValue(mocks.mockTransport);

    await act(async () => {
      await result.current.connect(connectFunction);
    });

    await waitFor(() => {
      expect(result.current.isConnected).toBe(true);
    });

    expect(mocks.create_rpc_connection).toHaveBeenCalledWith(
      mocks.mockTransport,
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      })
    );
  });

  it("should abort connection on disconnect", async () => {
    const { result } = renderHook(() => useZMKApp());

    mocks.mockSuccessfulConnection({ deviceName: "Test" });

    const connectFunction = jest.fn().mockResolvedValue(mocks.mockTransport);

    await act(async () => {
      await result.current.connect(connectFunction);
    });

    expect(result.current.isConnected).toBe(true);

    // Get the AbortSignal that was passed
    const callArgs = mocks.create_rpc_connection.mock.calls[0];
    const abortSignal = callArgs[1]?.signal;

    expect(abortSignal.aborted).toBe(false);

    // Disconnect
    act(() => {
      result.current.disconnect();
    });

    expect(result.current.isConnected).toBe(false);

    // AbortSignal should now be aborted
    expect(abortSignal.aborted).toBe(true);
  });

  it("should handle core notifications", async () => {
    const { result } = renderHook(() => useZMKApp());

    // LockState enum: 0 = ZMK_STUDIO_CORE_LOCK_STATE_LOCKED
    const coreNotification = {
      core: {
        lockStateChanged: 0,
      },
    };

    mocks.mockSuccessfulConnection({
      deviceName: "Test",
      subsystems: [],
      notifications: [coreNotification],
    });

    const connectFunction = jest.fn().mockResolvedValue(mocks.mockTransport);
    const notificationCallback = jest.fn();

    // Subscribe to core notifications before connecting
    const unsubscribe = result.current.onNotification({
      type: "core",
      callback: notificationCallback,
    });

    await act(async () => {
      await result.current.connect(connectFunction);
    });

    expect(result.current.isConnected).toBe(true);

    // Wait for notification to be processed
    await waitFor(() => {
      // LockState enum: 0 = ZMK_STUDIO_CORE_LOCK_STATE_LOCKED
      expect(notificationCallback).toHaveBeenCalledWith({
        lockStateChanged: 0,
      });
    });

    // Unsubscribe
    unsubscribe();
  });

  it("should handle keymap notifications", async () => {
    const { result } = renderHook(() => useZMKApp());

    const keymapNotification = {
      keymap: {
        unsavedChangesStatusChanged: true,
      },
    };

    mocks.mockSuccessfulConnection({
      deviceName: "Test",
      subsystems: [],
      notifications: [keymapNotification],
    });

    const connectFunction = jest.fn().mockResolvedValue(mocks.mockTransport);
    const notificationCallback = jest.fn();

    // Subscribe to keymap notifications before connecting
    const unsubscribe = result.current.onNotification({
      type: "keymap",
      callback: notificationCallback,
    });

    await act(async () => {
      await result.current.connect(connectFunction);
    });

    expect(result.current.isConnected).toBe(true);

    // Wait for notification to be processed
    await waitFor(() => {
      expect(notificationCallback).toHaveBeenCalledWith({
        unsavedChangesStatusChanged: true,
      });
    });

    // Unsubscribe
    unsubscribe();
  });

  it("should disconnect when notification reading fails", async () => {
    const { result } = renderHook(() => useZMKApp());

    // Create a mock reader that will throw an error
    const mockReader = {
      read: jest.fn().mockRejectedValue(new Error("Notification read failed")),
      releaseLock: jest.fn(),
    };

    // Create a connection manually and override getReader BEFORE setting up mocks
    const connection = createMockConnection({ notifications: [] });
    connection.notification_readable.getReader = jest.fn().mockReturnValue(mockReader);

    // Mock create_rpc_connection to return our custom connection
    mocks.create_rpc_connection.mockReturnValue(connection);

    // Mock call_rpc similar to mockSuccessfulConnection
    mocks.call_rpc
      .mockResolvedValueOnce({
        core: {
          getDeviceInfo: {
            name: "Test Device",
            serialNumber: new Uint8Array([1, 2, 3, 4]),
          },
        },
      })
      .mockResolvedValueOnce({
        custom: {
          listCustomSubsystems: {
            subsystems: [],
          },
        },
      });

    const connectFunction = jest.fn().mockResolvedValue(mocks.mockTransport);
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    await act(async () => {
      await result.current.connect(connectFunction);
    });

    // The connection should have been established and then immediately disconnected
    // due to the notification reading error
    await waitFor(() => {
      expect(result.current.isConnected).toBe(false);
    });

    // Verify error was logged
    expect(consoleSpy).toHaveBeenCalledWith(
      "Error reading notifications:",
      expect.any(Error)
    );

    // Verify reader was released
    expect(mockReader.releaseLock).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });
});
