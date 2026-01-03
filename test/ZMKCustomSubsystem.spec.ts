/**
 * Tests for ZMKCustomSubsystem
 */

import {
  ZMKCustomSubsystem,
  ZMKCustomSubsystemError,
} from "../src/ZMKCustomSubsystem";
import type { RpcConnection } from "@zmkfirmware/zmk-studio-ts-client";

// Mock the call_rpc function
jest.mock("@zmkfirmware/zmk-studio-ts-client", () => ({
  call_rpc: jest.fn(),
}));

describe("ZMKCustomSubsystem", () => {
  let mockConnection: RpcConnection;
  let service: ZMKCustomSubsystem;
  const subsystemIndex = 5;

  beforeEach(() => {
    jest.clearAllMocks();
    mockConnection = {
      label: "test",
      current_request: 0,
    } as unknown as RpcConnection;

    service = new ZMKCustomSubsystem(mockConnection, subsystemIndex);
  });

  describe("constructor", () => {
    it("should initialize with connection and subsystem index", () => {
      expect(service.getConnection()).toBe(mockConnection);
      expect(service.getSubsystemIndex()).toBe(subsystemIndex);
    });
  });

  describe("callRPC", () => {
    it("should make RPC call and return payload", async () => {
      const { call_rpc } = require("@zmkfirmware/zmk-studio-ts-client");
      const testPayload = new Uint8Array([1, 2, 3, 4]);
      const responsePayload = new Uint8Array([5, 6, 7, 8]);

      (call_rpc as jest.Mock).mockResolvedValue({
        custom: {
          call: {
            payload: responsePayload,
          },
        },
      });

      const result = await service.callRPC(testPayload);

      expect(call_rpc).toHaveBeenCalledWith(mockConnection, {
        custom: {
          call: {
            subsystemIndex,
            payload: testPayload,
          },
        },
      });
      expect(result).toBe(responsePayload);
    });

    it("should return null when no payload in response", async () => {
      const { call_rpc } = require("@zmkfirmware/zmk-studio-ts-client");
      (call_rpc as jest.Mock).mockResolvedValue({
        custom: {
          call: {},
        },
      });

      const result = await service.callRPC(new Uint8Array([1, 2, 3]));
      expect(result).toBeNull();
    });

    it("should return null when response is missing custom field", async () => {
      const { call_rpc } = require("@zmkfirmware/zmk-studio-ts-client");
      (call_rpc as jest.Mock).mockResolvedValue({});

      const result = await service.callRPC(new Uint8Array([1, 2, 3]));
      expect(result).toBeNull();
    });

    it("should propagate RPC errors", async () => {
      const { call_rpc } = require("@zmkfirmware/zmk-studio-ts-client");
      const error = new Error("RPC failed");
      (call_rpc as jest.Mock).mockRejectedValue(error);

      await expect(service.callRPC(new Uint8Array([1, 2, 3]))).rejects.toThrow(
        "RPC failed"
      );
    });
  });

  describe("isReady", () => {
    it("should return true when connection exists", () => {
      expect(service.isReady()).toBe(true);
    });

    it("should return false when connection is null", () => {
      const nullService = new ZMKCustomSubsystem(null as any, 0);
      expect(nullService.isReady()).toBe(false);
    });
  });

  describe("getSubsystemIndex", () => {
    it("should return the subsystem index", () => {
      expect(service.getSubsystemIndex()).toBe(subsystemIndex);
    });
  });

  describe("getConnection", () => {
    it("should return the RPC connection", () => {
      expect(service.getConnection()).toBe(mockConnection);
    });
  });
});

describe("ZMKCustomSubsystemError", () => {
  it("should create connection error", () => {
    const error = new ZMKCustomSubsystemError(
      "connection",
      "Failed to connect"
    );
    expect(error.name).toBe("ZMKCustomSubsystemError");
    expect(error.type).toBe("connection");
    expect(error.message).toBe("Failed to connect");
    expect(error.code).toBeUndefined();
  });

  it("should create RPC error with code", () => {
    const error = new ZMKCustomSubsystemError("rpc", "RPC call failed", 404);
    expect(error.name).toBe("ZMKCustomSubsystemError");
    expect(error.type).toBe("rpc");
    expect(error.message).toBe("RPC call failed");
    expect(error.code).toBe(404);
  });

  it("should create validation error", () => {
    const error = new ZMKCustomSubsystemError("validation", "Invalid payload");
    expect(error.name).toBe("ZMKCustomSubsystemError");
    expect(error.type).toBe("validation");
    expect(error.message).toBe("Invalid payload");
  });

  it("should be instanceof Error", () => {
    const error = new ZMKCustomSubsystemError("connection", "Test error");
    expect(error instanceof Error).toBe(true);
    expect(error instanceof ZMKCustomSubsystemError).toBe(true);
  });
});
