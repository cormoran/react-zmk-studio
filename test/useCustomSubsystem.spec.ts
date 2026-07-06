/**
 * Tests for useCustomSubsystem hook
 */

import React from "react";
import { renderHook } from "@testing-library/react";
import { useCustomSubsystem } from "../src/useCustomSubsystem";
import type { Codec } from "../src/useCustomSubsystem";
import { ZMKAppContext } from "../src/ZMKAppContext";
import { createConnectedMockZMKApp, createMockZMKApp } from "../src/testing";
import type { UseZMKAppReturn } from "../src/useZMKApp";

// Mock the zmk-studio-ts-client (used by ZMKCustomSubsystem via call_rpc)
jest.mock("@zmkfirmware/zmk-studio-ts-client", () => ({
  create_rpc_connection: jest.fn(),
  call_rpc: jest.fn(),
}));

const { call_rpc } = jest.requireMock("@zmkfirmware/zmk-studio-ts-client") as {
  call_rpc: jest.Mock;
};

function wrapper(zmkApp: UseZMKAppReturn | null) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(
      ZMKAppContext.Provider,
      { value: zmkApp },
      children
    );
  };
}

describe("useCustomSubsystem", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns ready=false and subsystem=null without a ZMKAppContext provider", () => {
    const { result } = renderHook(() => useCustomSubsystem("my-subsystem"));

    expect(result.current.ready).toBe(false);
    expect(result.current.subsystem).toBeNull();
  });

  it("returns ready=false and subsystem=null when there is no connection", () => {
    const zmkApp = createMockZMKApp(); // disconnected
    const { result } = renderHook(() => useCustomSubsystem("my-subsystem"), {
      wrapper: wrapper(zmkApp),
    });

    expect(result.current.ready).toBe(false);
    expect(result.current.subsystem).toBeNull();
  });

  it("returns ready=false when connected but the subsystem is not found", () => {
    const zmkApp = createConnectedMockZMKApp({
      subsystems: ["other-subsystem"],
    });
    const { result } = renderHook(() => useCustomSubsystem("my-subsystem"), {
      wrapper: wrapper(zmkApp),
    });

    expect(result.current.ready).toBe(false);
    expect(result.current.subsystem).toBeNull();
  });

  it("resolves the subsystem and reports ready when connected and found", () => {
    const zmkApp = createConnectedMockZMKApp({
      subsystems: ["other-subsystem", "my-subsystem"],
    });
    const { result } = renderHook(() => useCustomSubsystem("my-subsystem"), {
      wrapper: wrapper(zmkApp),
    });

    expect(result.current.ready).toBe(true);
    expect(result.current.subsystem).toEqual(
      expect.objectContaining({ index: 1, identifier: "my-subsystem" })
    );
  });

  it("callRPC sends the raw payload to the right subsystem and returns the response payload", async () => {
    const zmkApp = createConnectedMockZMKApp({
      subsystems: ["other-subsystem", "my-subsystem"],
    });
    const requestPayload = new Uint8Array([1, 2, 3]);
    const responsePayload = new Uint8Array([4, 5, 6]);
    call_rpc.mockResolvedValueOnce({
      custom: { call: { payload: responsePayload } },
    });

    const { result } = renderHook(() => useCustomSubsystem("my-subsystem"), {
      wrapper: wrapper(zmkApp),
    });

    const response = await result.current.callRPC(requestPayload);

    expect(call_rpc).toHaveBeenCalledWith(zmkApp.state.connection, {
      custom: {
        call: {
          subsystemIndex: 1,
          payload: requestPayload,
        },
      },
    });
    expect(response).toBe(responsePayload);
  });

  it("callRPC throws a clear error when not ready", async () => {
    const { result } = renderHook(() => useCustomSubsystem("my-subsystem"));

    await expect(result.current.callRPC(new Uint8Array([1]))).rejects.toThrow(
      'Custom subsystem "my-subsystem" is not ready'
    );
    expect(call_rpc).not.toHaveBeenCalled();
  });

  it("callRPC throws a clear error when the subsystem is not found", async () => {
    const zmkApp = createConnectedMockZMKApp({ subsystems: [] });
    const { result } = renderHook(() => useCustomSubsystem("my-subsystem"), {
      wrapper: wrapper(zmkApp),
    });

    await expect(result.current.callRPC(new Uint8Array([1]))).rejects.toThrow(
      /not ready.*not found/
    );
  });

  describe("typed call() with a codec", () => {
    interface Req {
      value: number;
    }
    interface Res {
      doubled: number;
    }
    const codec: Codec<Req, Res> = {
      encode: (request) => new Uint8Array([request.value]),
      decode: (payload) => ({ doubled: payload[0] }),
    };

    it("encodes the request, calls the device, and decodes the response", async () => {
      const zmkApp = createConnectedMockZMKApp({
        subsystems: ["my-subsystem"],
      });
      call_rpc.mockResolvedValueOnce({
        custom: { call: { payload: new Uint8Array([42]) } },
      });

      const { result } = renderHook(
        () => useCustomSubsystem("my-subsystem", codec),
        { wrapper: wrapper(zmkApp) }
      );

      const response = await result.current.call({ value: 21 });

      expect(call_rpc).toHaveBeenCalledWith(zmkApp.state.connection, {
        custom: {
          call: {
            subsystemIndex: 0,
            payload: new Uint8Array([21]),
          },
        },
      });
      expect(response).toEqual({ doubled: 42 });
    });

    it("returns null when the device sends no response payload", async () => {
      const zmkApp = createConnectedMockZMKApp({
        subsystems: ["my-subsystem"],
      });
      call_rpc.mockResolvedValueOnce({ custom: { call: {} } });

      const { result } = renderHook(
        () => useCustomSubsystem("my-subsystem", codec),
        { wrapper: wrapper(zmkApp) }
      );

      await expect(result.current.call({ value: 1 })).resolves.toBeNull();
    });

    it("keeps the raw callRPC available alongside call()", async () => {
      const zmkApp = createConnectedMockZMKApp({
        subsystems: ["my-subsystem"],
      });
      const responsePayload = new Uint8Array([9]);
      call_rpc.mockResolvedValueOnce({
        custom: { call: { payload: responsePayload } },
      });

      const { result } = renderHook(
        () => useCustomSubsystem("my-subsystem", codec),
        { wrapper: wrapper(zmkApp) }
      );

      await expect(result.current.callRPC(new Uint8Array([7]))).resolves.toBe(
        responsePayload
      );
    });

    it("call() throws when not ready", async () => {
      const { result } = renderHook(() =>
        useCustomSubsystem("my-subsystem", codec)
      );

      expect(result.current.ready).toBe(false);
      await expect(result.current.call({ value: 1 })).rejects.toThrow(
        'Custom subsystem "my-subsystem" is not ready'
      );
    });
  });
});
