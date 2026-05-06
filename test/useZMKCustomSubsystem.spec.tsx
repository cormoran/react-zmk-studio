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

describe("useZMKCustomSubsystem", () => {
  it("should return unavailable state outside a provider", () => {
    const { result } = renderHook(() => useZMKCustomSubsystem("test-subsystem"));

    expect(result.current.zmkApp).toBeNull();
    expect(result.current.connection).toBeNull();
    expect(result.current.subsystem).toBeNull();
    expect(result.current.subsystemIndex).toBeNull();
    expect(result.current.service).toBeNull();
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
