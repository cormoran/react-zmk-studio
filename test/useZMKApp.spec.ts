/**
 * Tests for useZMKApp hook
 */

import { renderHook, waitFor, act } from "@testing-library/react";
import { useZMKApp } from "../src/useZMKApp";
import type { RpcTransport } from "@zmkfirmware/zmk-studio-ts-client/transport/index";
import type { RpcConnection } from "@zmkfirmware/zmk-studio-ts-client";

// Mock the zmk-studio-ts-client
jest.mock("@zmkfirmware/zmk-studio-ts-client", () => ({
  create_rpc_connection: jest.fn(),
  call_rpc: jest.fn(),
}));

describe("useZMKApp", () => {
  let mockTransport: RpcTransport;
  let mockConnection: RpcConnection;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock transport
    mockTransport = {
      close: jest.fn(),
      send: jest.fn(),
    } as unknown as RpcTransport;

    // Create mock notification reader that never resolves (simulates waiting)
    const mockNotificationReader = {
      read: jest.fn().mockReturnValue(new Promise(() => {})), // Never resolves
      releaseLock: jest.fn(),
    };

    // Create mock connection with notification stream
    mockConnection = {
      label: "test",
      current_request: 0,
      notification_readable: {
        getReader: jest.fn().mockReturnValue(mockNotificationReader),
      },
    } as unknown as RpcConnection;
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
    const {
      create_rpc_connection,
      call_rpc,
    } = require("@zmkfirmware/zmk-studio-ts-client");

    // Setup mocks
    create_rpc_connection.mockReturnValue(mockConnection);
    (call_rpc as jest.Mock)
      .mockResolvedValueOnce({
        core: {
          getDeviceInfo: {
            name: "Test Device",
            version: "1.0.0",
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

    const connectFunction = jest.fn().mockResolvedValue(mockTransport);

    await act(async () => {
      await result.current.connect(connectFunction);
    });

    expect(connectFunction).toHaveBeenCalled();
  });

  it("should successfully connect to a device", async () => {
    const { result } = renderHook(() => useZMKApp());
    const {
      create_rpc_connection,
      call_rpc,
    } = require("@zmkfirmware/zmk-studio-ts-client");

    const mockDeviceInfo = {
      name: "Test Device",
      version: "1.0.0",
    };

    const mockSubsystems = {
      subsystems: [
        { index: 0, identifier: "test-subsystem" },
        { index: 1, identifier: "another-subsystem" },
      ],
    };

    // Setup mocks
    create_rpc_connection.mockReturnValue(mockConnection);
    (call_rpc as jest.Mock)
      .mockResolvedValueOnce({
        core: {
          getDeviceInfo: mockDeviceInfo,
        },
      })
      .mockResolvedValueOnce({
        custom: {
          listCustomSubsystems: mockSubsystems,
        },
      });

    const connectFunction = jest.fn().mockResolvedValue(mockTransport);

    await act(async () => {
      await result.current.connect(connectFunction);
    });

    expect(result.current.state.connection).toBe(mockConnection);
    expect(result.current.state.deviceInfo).toEqual(mockDeviceInfo);
    expect(result.current.state.customSubsystems).toEqual(mockSubsystems);
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
    const {
      create_rpc_connection,
      call_rpc,
    } = require("@zmkfirmware/zmk-studio-ts-client");

    create_rpc_connection.mockReturnValue(mockConnection);
    (call_rpc as jest.Mock).mockResolvedValueOnce({
      core: {
        getDeviceInfo: null,
      },
    });

    const connectFunction = jest.fn().mockResolvedValue(mockTransport);

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
    const {
      create_rpc_connection,
      call_rpc,
    } = require("@zmkfirmware/zmk-studio-ts-client");

    // First, connect
    create_rpc_connection.mockReturnValue(mockConnection);
    (call_rpc as jest.Mock)
      .mockResolvedValueOnce({
        core: {
          getDeviceInfo: { name: "Test" },
        },
      })
      .mockResolvedValueOnce({
        custom: {
          listCustomSubsystems: { subsystems: [] },
        },
      });

    const connectFunction = jest.fn().mockResolvedValue(mockTransport);

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
    const {
      create_rpc_connection,
      call_rpc,
    } = require("@zmkfirmware/zmk-studio-ts-client");

    const mockSubsystems = {
      subsystems: [
        { index: 0, identifier: "test-subsystem" },
        { index: 1, identifier: "another-subsystem" },
      ],
    };

    create_rpc_connection.mockReturnValue(mockConnection);
    (call_rpc as jest.Mock)
      .mockResolvedValueOnce({
        core: {
          getDeviceInfo: { name: "Test" },
        },
      })
      .mockResolvedValueOnce({
        custom: {
          listCustomSubsystems: mockSubsystems,
        },
      });

    const connectFunction = jest.fn().mockResolvedValue(mockTransport);

    await act(async () => {
      await result.current.connect(connectFunction);
    });

    expect(result.current.isConnected).toBe(true);

    const found = result.current.findSubsystem("another-subsystem");
    expect(found).toEqual({ index: 1, identifier: "another-subsystem" });

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
    const {
      create_rpc_connection,
      call_rpc,
    } = require("@zmkfirmware/zmk-studio-ts-client");

    // Create a mock readable stream for notifications
    const mockNotificationStream = {
      getReader: jest.fn().mockReturnValue({
        read: jest
          .fn()
          .mockResolvedValueOnce({
            done: false,
            value: {
              custom: {
                customNotification: {
                  subsystemIndex: 0,
                  payload: new Uint8Array([1, 2, 3]),
                },
              },
            },
          })
          .mockResolvedValue({ done: true }),
        releaseLock: jest.fn(),
      }),
    };

    const connectionWithNotifications = {
      ...mockConnection,
      notification_readable: mockNotificationStream,
    };

    create_rpc_connection.mockReturnValue(connectionWithNotifications);
    (call_rpc as jest.Mock)
      .mockResolvedValueOnce({
        core: { getDeviceInfo: { name: "Test" } },
      })
      .mockResolvedValueOnce({
        custom: { listCustomSubsystems: { subsystems: [] } },
      });

    const connectFunction = jest.fn().mockResolvedValue(mockTransport);
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
    const {
      create_rpc_connection,
      call_rpc,
    } = require("@zmkfirmware/zmk-studio-ts-client");

    create_rpc_connection.mockReturnValue(mockConnection);
    (call_rpc as jest.Mock)
      .mockResolvedValueOnce({
        core: { getDeviceInfo: { name: "Test" } },
      })
      .mockResolvedValueOnce({
        custom: { listCustomSubsystems: { subsystems: [] } },
      });

    const connectFunction = jest.fn().mockResolvedValue(mockTransport);

    await act(async () => {
      await result.current.connect(connectFunction);
    });

    await waitFor(() => {
      expect(result.current.isConnected).toBe(true);
    });

    expect(create_rpc_connection).toHaveBeenCalledWith(
      mockTransport,
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      })
    );
  });

  it("should abort connection on disconnect", async () => {
    const { result } = renderHook(() => useZMKApp());
    const {
      create_rpc_connection,
      call_rpc,
    } = require("@zmkfirmware/zmk-studio-ts-client");

    create_rpc_connection.mockReturnValue(mockConnection);
    (call_rpc as jest.Mock)
      .mockResolvedValueOnce({
        core: { getDeviceInfo: { name: "Test" } },
      })
      .mockResolvedValueOnce({
        custom: { listCustomSubsystems: { subsystems: [] } },
      });

    const connectFunction = jest.fn().mockResolvedValue(mockTransport);

    await act(async () => {
      await result.current.connect(connectFunction);
    });

    expect(result.current.isConnected).toBe(true);

    // Get the AbortSignal that was passed
    const callArgs = create_rpc_connection.mock.calls[0];
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
    const {
      create_rpc_connection,
      call_rpc,
    } = require("@zmkfirmware/zmk-studio-ts-client");

    // Create a mock readable stream for notifications
    const mockNotificationStream = {
      getReader: jest.fn().mockReturnValue({
        read: jest
          .fn()
          .mockResolvedValueOnce({
            done: false,
            value: {
              core: {
                lockStateChanged: { locked: true },
              },
            },
          })
          .mockResolvedValue({ done: true }),
        releaseLock: jest.fn(),
      }),
    };

    const connectionWithNotifications = {
      ...mockConnection,
      notification_readable: mockNotificationStream,
    };

    create_rpc_connection.mockReturnValue(connectionWithNotifications);
    (call_rpc as jest.Mock)
      .mockResolvedValueOnce({
        core: { getDeviceInfo: { name: "Test" } },
      })
      .mockResolvedValueOnce({
        custom: { listCustomSubsystems: { subsystems: [] } },
      });

    const connectFunction = jest.fn().mockResolvedValue(mockTransport);
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
      expect(notificationCallback).toHaveBeenCalledWith({
        lockStateChanged: { locked: true },
      });
    });

    // Unsubscribe
    unsubscribe();
  });

  it("should handle keymap notifications", async () => {
    const { result } = renderHook(() => useZMKApp());
    const {
      create_rpc_connection,
      call_rpc,
    } = require("@zmkfirmware/zmk-studio-ts-client");

    // Create a mock readable stream for notifications
    const mockNotificationStream = {
      getReader: jest.fn().mockReturnValue({
        read: jest
          .fn()
          .mockResolvedValueOnce({
            done: false,
            value: {
              keymap: {
                unsavedChangesStatusChanged: true,
              },
            },
          })
          .mockResolvedValue({ done: true }),
        releaseLock: jest.fn(),
      }),
    };

    const connectionWithNotifications = {
      ...mockConnection,
      notification_readable: mockNotificationStream,
    };

    create_rpc_connection.mockReturnValue(connectionWithNotifications);
    (call_rpc as jest.Mock)
      .mockResolvedValueOnce({
        core: { getDeviceInfo: { name: "Test" } },
      })
      .mockResolvedValueOnce({
        custom: { listCustomSubsystems: { subsystems: [] } },
      });

    const connectFunction = jest.fn().mockResolvedValue(mockTransport);
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
});
