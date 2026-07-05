/**
 * Tests for useStudioLockState hook and isUnlockRequiredError helper
 */

import { act, renderHook, waitFor } from "@testing-library/react";
import React from "react";
import {
  useStudioLockState,
  isUnlockRequiredError,
} from "../src/useStudioLockState";
import { ZMKAppContext } from "../src/ZMKAppContext";
import { createMockConnection, createMockZMKApp } from "../src/testing";
import type { UseZMKAppReturn } from "../src/useZMKApp";

// Mock the zmk-studio-ts-client and its submodules. The real package ships
// untranspiled ESM in node_modules, so we avoid needing Jest to transform it
// by mocking the exact runtime values (enums, MetaError) our hook imports.
jest.mock("@zmkfirmware/zmk-studio-ts-client", () => {
  class MetaError extends Error {
    condition: number;
    constructor(condition: number) {
      super("MetaError");
      this.condition = condition;
    }
  }
  return {
    call_rpc: jest.fn(),
    MetaError,
  };
});

jest.mock("@zmkfirmware/zmk-studio-ts-client/meta", () => ({
  ErrorConditions: {
    GENERIC: 0,
    UNLOCK_REQUIRED: 1,
    RPC_NOT_FOUND: 2,
    MSG_DECODE_FAILED: 3,
    MSG_ENCODE_FAILED: 4,
  },
}));

jest.mock("@zmkfirmware/zmk-studio-ts-client/core", () => ({
  LockState: {
    ZMK_STUDIO_CORE_LOCK_STATE_LOCKED: 0,
    ZMK_STUDIO_CORE_LOCK_STATE_UNLOCKED: 1,
  },
}));

const { call_rpc, MetaError } = jest.requireMock(
  "@zmkfirmware/zmk-studio-ts-client"
) as {
  call_rpc: jest.Mock;
  MetaError: new (condition: number) => Error & { condition: number };
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

describe("useStudioLockState", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns unknown lockState and locked=false when there is no ZMKAppContext", () => {
    const { result } = renderHook(() => useStudioLockState(), {
      wrapper: wrapper(null),
    });

    expect(result.current.lockState).toBe("unknown");
    expect(result.current.locked).toBe(false);
  });

  it("returns unknown before the connection exists", () => {
    const zmkApp = createMockZMKApp();
    const { result } = renderHook(() => useStudioLockState(), {
      wrapper: wrapper(zmkApp),
    });

    expect(result.current.lockState).toBe("unknown");
    expect(result.current.locked).toBe(false);
    expect(call_rpc).not.toHaveBeenCalled();
  });

  it("queries the initial lock state and reflects 'locked'", async () => {
    const connection = createMockConnection();
    call_rpc.mockResolvedValueOnce({ core: { getLockState: 0 } }); // LOCKED = 0

    const zmkApp = createMockZMKApp({
      state: { connection } as any,
    });

    const { result } = renderHook(() => useStudioLockState(), {
      wrapper: wrapper(zmkApp),
    });

    expect(call_rpc).toHaveBeenCalledWith(connection, {
      core: { getLockState: true },
    });

    await waitFor(() => {
      expect(result.current.lockState).toBe("locked");
    });
    expect(result.current.locked).toBe(true);
  });

  it("queries the initial lock state and reflects 'unlocked'", async () => {
    const connection = createMockConnection();
    call_rpc.mockResolvedValueOnce({ core: { getLockState: 1 } }); // UNLOCKED = 1

    const zmkApp = createMockZMKApp({
      state: { connection } as any,
    });

    const { result } = renderHook(() => useStudioLockState(), {
      wrapper: wrapper(zmkApp),
    });

    await waitFor(() => {
      expect(result.current.lockState).toBe("unlocked");
    });
    expect(result.current.locked).toBe(false);
  });

  it("stays 'unknown' while the initial query is pending", async () => {
    const connection = createMockConnection();
    let resolveCall: (value: unknown) => void = () => {};
    call_rpc.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveCall = resolve;
      })
    );

    const zmkApp = createMockZMKApp({
      state: { connection } as any,
    });

    const { result } = renderHook(() => useStudioLockState(), {
      wrapper: wrapper(zmkApp),
    });

    expect(result.current.lockState).toBe("unknown");

    resolveCall({ core: { getLockState: 0 } });

    await waitFor(() => {
      expect(result.current.lockState).toBe("locked");
    });
  });

  it("updates lockState when a lockStateChanged notification is received", async () => {
    const connection = createMockConnection();
    call_rpc.mockResolvedValueOnce({ core: { getLockState: 1 } }); // starts unlocked

    let coreCallback: ((notification: unknown) => void) | undefined;
    const onNotification = jest.fn().mockImplementation((subscription) => {
      if (subscription.type === "core") {
        coreCallback = subscription.callback;
      }
      return () => {};
    });

    const zmkApp = createMockZMKApp({
      state: { connection } as any,
      onNotification,
    });

    const { result } = renderHook(() => useStudioLockState(), {
      wrapper: wrapper(zmkApp),
    });

    await waitFor(() => {
      expect(result.current.lockState).toBe("unlocked");
    });

    expect(coreCallback).toBeDefined();
    act(() => {
      coreCallback!({ lockStateChanged: 0 }); // LOCKED
    });

    await waitFor(() => {
      expect(result.current.lockState).toBe("locked");
    });
    expect(result.current.locked).toBe(true);
  });

  it("resets to 'unknown' when the connection changes", async () => {
    const connection1 = createMockConnection();
    call_rpc.mockResolvedValueOnce({ core: { getLockState: 0 } }); // locked

    let currentZmkApp: UseZMKAppReturn = createMockZMKApp({
      state: { connection: connection1 } as any,
    });

    function DynamicWrapper({ children }: { children: React.ReactNode }) {
      return React.createElement(
        ZMKAppContext.Provider,
        { value: currentZmkApp },
        children
      );
    }

    const { result, rerender } = renderHook(() => useStudioLockState(), {
      wrapper: DynamicWrapper,
    });

    await waitFor(() => {
      expect(result.current.lockState).toBe("locked");
    });

    // Simulate reconnecting to a different device: new connection object.
    const connection2 = createMockConnection();
    let resolveSecondCall: (value: unknown) => void = () => {};
    call_rpc.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSecondCall = resolve;
      })
    );

    currentZmkApp = {
      ...currentZmkApp,
      state: { ...currentZmkApp.state, connection: connection2 } as any,
    };
    rerender();

    expect(result.current.lockState).toBe("unknown");

    resolveSecondCall({ core: { getLockState: 1 } });
    await waitFor(() => {
      expect(result.current.lockState).toBe("unlocked");
    });
  });
});

describe("isUnlockRequiredError", () => {
  it("returns true for a MetaError with UNLOCK_REQUIRED (1)", () => {
    const error = new MetaError(1);
    expect(isUnlockRequiredError(error)).toBe(true);
  });

  it("returns false for a MetaError with a different condition", () => {
    const error = new MetaError(0); // GENERIC
    expect(isUnlockRequiredError(error)).toBe(false);
  });

  it("returns false for a plain Error", () => {
    expect(isUnlockRequiredError(new Error("oops"))).toBe(false);
  });

  it("returns false for non-error values", () => {
    expect(isUnlockRequiredError("string error")).toBe(false);
    expect(isUnlockRequiredError(null)).toBe(false);
    expect(isUnlockRequiredError(undefined)).toBe(false);
  });
});
