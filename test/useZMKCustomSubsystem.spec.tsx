/**
 * Tests for useZMKCustomSubsystem
 */

import type { ReactNode } from "react";
import React from "react";
import { renderHook } from "@testing-library/react";
import { useZMKCustomSubsystem } from "../src/useZMKCustomSubsystem";
import {
  ZMKAppProvider,
  createMockConnection,
  createMockSubsystems,
  createMockZMKApp,
  createMockZMKAppState,
} from "../src/testing";

jest.mock("@zmkfirmware/zmk-studio-ts-client", () => ({
  call_rpc: jest.fn(),
}));

const mockRequestType = {
  encode: jest.fn().mockImplementation((message) => ({
    finish: () => new Uint8Array(message.payload),
  })),
};

const mockResponseType = {
  decode: jest.fn().mockImplementation((payload: Uint8Array) => ({
    decoded: Array.from(payload),
  })),
};

const mockNotificationType = {
  decode: jest.fn().mockImplementation((payload: Uint8Array) => ({
    decoded: Array.from(payload),
  })),
};

describe("useZMKCustomSubsystem", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return unavailable state outside a provider", () => {
    const { result } = renderHook(() => useZMKCustomSubsystem("test-subsystem"));

    expect(result.current.zmkApp).toBeNull();
    expect(result.current.connection).toBeNull();
    expect(result.current.subsystem).toBeNull();
    expect(result.current.subsystemIndex).toBeNull();
    expect(result.current.service).toBeNull();
    expect(result.current.callTyped).toBeInstanceOf(Function);
    expect(result.current.onNotification).toBeInstanceOf(Function);
    expect(result.current.onTypedNotification).toBeInstanceOf(Function);
    expect(result.current.isAvailable).toBe(false);
    expect(result.current.isReady).toBe(false);
  });

  it("should resolve subsystem metadata from context", () => {
    const subsystems = createMockSubsystems([
      "first-subsystem",
      "target-subsystem",
    ]);

    const wrapper = ({ children }: { children: ReactNode }) => (
      <ZMKAppProvider
        value={createMockZMKApp({
          state: createMockZMKAppState({
            customSubsystems: subsystems,
          }),
          findSubsystem: (identifier: string) =>
            subsystems.subsystems.find((item) => item.identifier === identifier) ??
            null,
        })}
      >
        {children}
      </ZMKAppProvider>
    );

    const { result } = renderHook(
      () => useZMKCustomSubsystem("target-subsystem"),
      { wrapper }
    );

    expect(result.current.subsystem).toEqual({
      index: 1,
      identifier: "target-subsystem",
    });
    expect(result.current.subsystemIndex).toBe(1);
    expect(result.current.isAvailable).toBe(true);
    expect(result.current.isReady).toBe(false);
  });

  it("should create a service when subsystem and connection are available", () => {
    const connection = createMockConnection();
    const subsystems = createMockSubsystems(["target-subsystem"]);
    const zmkApp = createMockZMKApp({
      state: createMockZMKAppState({
        connection,
        customSubsystems: subsystems,
      }),
      findSubsystem: (identifier: string) =>
        subsystems.subsystems.find((item) => item.identifier === identifier) ?? null,
    });

    const wrapper = ({ children }: { children: ReactNode }) => (
      <ZMKAppProvider value={zmkApp}>{children}</ZMKAppProvider>
    );

    const { result } = renderHook(
      () => useZMKCustomSubsystem("target-subsystem"),
      { wrapper }
    );

    expect(result.current.connection).toBe(connection);
    expect(result.current.service).not.toBeNull();
    expect(result.current.service?.getConnection()).toBe(connection);
    expect(result.current.service?.getSubsystemIndex()).toBe(0);
    expect(result.current.isAvailable).toBe(true);
    expect(result.current.isReady).toBe(true);
  });

  it("should expose typed calls bound to the resolved service", async () => {
    const { call_rpc } = require("@zmkfirmware/zmk-studio-ts-client");
    const connection = createMockConnection();
    const subsystems = createMockSubsystems(["target-subsystem"]);
    const zmkApp = createMockZMKApp({
      state: createMockZMKAppState({
        connection,
        customSubsystems: subsystems,
      }),
      findSubsystem: (identifier: string) =>
        subsystems.subsystems.find((item) => item.identifier === identifier) ?? null,
    });

    (call_rpc as jest.Mock).mockResolvedValue({
      custom: {
        call: {
          payload: new Uint8Array([9, 8, 7]),
        },
      },
    });

    const wrapper = ({ children }: { children: ReactNode }) => (
      <ZMKAppProvider value={zmkApp}>{children}</ZMKAppProvider>
    );

    const { result } = renderHook(
      () => useZMKCustomSubsystem("target-subsystem"),
      { wrapper }
    );

    const response = await result.current.callTyped(
      mockRequestType,
      mockResponseType,
      { payload: [1, 2, 3] }
    );

    expect(response).toEqual({ decoded: [9, 8, 7] });
    expect(mockRequestType.encode).toHaveBeenCalledWith({ payload: [1, 2, 3] });
    expect(mockResponseType.decode).toHaveBeenCalledWith(
      new Uint8Array([9, 8, 7])
    );
  });

  it("should return null for typed calls when the subsystem is not ready", async () => {
    const { result } = renderHook(() => useZMKCustomSubsystem("test-subsystem"));

    const response = await result.current.callTyped(
      mockRequestType,
      mockResponseType,
      { payload: [1, 2, 3] }
    );

    expect(response).toBeNull();
  });

  it("should subscribe to raw custom notifications for the resolved subsystem", () => {
    const unsubscribe = jest.fn();
    const onNotification = jest.fn().mockReturnValue(unsubscribe);
    const subsystems = createMockSubsystems(["target-subsystem"]);
    const zmkApp = createMockZMKApp({
      state: createMockZMKAppState({
        connection: createMockConnection(),
        customSubsystems: subsystems,
      }),
      findSubsystem: (identifier: string) =>
        subsystems.subsystems.find((item) => item.identifier === identifier) ?? null,
      onNotification,
    });

    const wrapper = ({ children }: { children: ReactNode }) => (
      <ZMKAppProvider value={zmkApp}>{children}</ZMKAppProvider>
    );

    const { result } = renderHook(
      () => useZMKCustomSubsystem("target-subsystem"),
      { wrapper }
    );

    const callback = jest.fn();
    const returnedUnsubscribe = result.current.onNotification(callback);

    expect(onNotification).toHaveBeenCalledWith({
      type: "custom",
      subsystemIndex: 0,
      callback,
    });
    expect(returnedUnsubscribe).toBe(unsubscribe);
  });

  it("should decode typed notifications before invoking the callback", () => {
    const onNotification = jest.fn().mockImplementation(({ callback }) => {
      callback({
        subsystemIndex: 0,
        payload: new Uint8Array([7, 6, 5]),
      });
      return () => {};
    });
    const subsystems = createMockSubsystems(["target-subsystem"]);
    const zmkApp = createMockZMKApp({
      state: createMockZMKAppState({
        connection: createMockConnection(),
        customSubsystems: subsystems,
      }),
      findSubsystem: (identifier: string) =>
        subsystems.subsystems.find((item) => item.identifier === identifier) ?? null,
      onNotification,
    });

    const wrapper = ({ children }: { children: ReactNode }) => (
      <ZMKAppProvider value={zmkApp}>{children}</ZMKAppProvider>
    );

    const { result } = renderHook(
      () => useZMKCustomSubsystem("target-subsystem"),
      { wrapper }
    );

    const callback = jest.fn();
    result.current.onTypedNotification(mockNotificationType, callback);

    expect(mockNotificationType.decode).toHaveBeenCalledWith(
      new Uint8Array([7, 6, 5])
    );
    expect(callback).toHaveBeenCalledWith(
      { decoded: [7, 6, 5] },
      {
        subsystemIndex: 0,
        payload: new Uint8Array([7, 6, 5]),
      }
    );
  });

  it("should return unavailable when the subsystem is missing", () => {
    const subsystems = createMockSubsystems(["first-subsystem"]);
    const zmkApp = createMockZMKApp({
      state: createMockZMKAppState({
        connection: createMockConnection(),
        customSubsystems: subsystems,
      }),
      findSubsystem: (identifier: string) =>
        subsystems.subsystems.find((item) => item.identifier === identifier) ?? null,
    });

    const wrapper = ({ children }: { children: ReactNode }) => (
      <ZMKAppProvider value={zmkApp}>{children}</ZMKAppProvider>
    );

    const { result } = renderHook(
      () => useZMKCustomSubsystem("second-subsystem"),
      { wrapper }
    );

    expect(result.current.subsystem).toBeNull();
    expect(result.current.subsystemIndex).toBeNull();
    expect(result.current.service).toBeNull();
    expect(result.current.isAvailable).toBe(false);
    expect(result.current.isReady).toBe(false);
  });
});
