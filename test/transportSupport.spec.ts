/**
 * Tests for transport feature detection and user-cancel helpers
 */

import {
  isWebSerialSupported,
  isWebBluetoothSupported,
  isUserCancelledError,
} from "../src/transportSupport";

/**
 * Temporarily defines a property on `navigator` (jsdom's navigator has
 * neither `serial` nor `bluetooth`) and returns a cleanup function.
 */
function defineNavigatorProperty(name: string, value: unknown): () => void {
  Object.defineProperty(navigator, name, {
    value,
    configurable: true,
  });
  return () => {
    delete (navigator as unknown as Record<string, unknown>)[name];
  };
}

describe("isWebSerialSupported", () => {
  it("returns false when navigator.serial is absent (jsdom default)", () => {
    expect("serial" in navigator).toBe(false);
    expect(isWebSerialSupported()).toBe(false);
  });

  it("returns true when navigator.serial is present", () => {
    const cleanup = defineNavigatorProperty("serial", {});
    try {
      expect(isWebSerialSupported()).toBe(true);
    } finally {
      cleanup();
    }
  });
});

describe("isWebBluetoothSupported", () => {
  it("returns false when navigator.bluetooth is absent (jsdom default)", () => {
    expect("bluetooth" in navigator).toBe(false);
    expect(isWebBluetoothSupported()).toBe(false);
  });

  it("returns true when navigator.bluetooth is present", () => {
    const cleanup = defineNavigatorProperty("bluetooth", {});
    try {
      expect(isWebBluetoothSupported()).toBe(true);
    } finally {
      cleanup();
    }
  });
});

describe("isUserCancelledError", () => {
  it("returns true for the ts-client's UserCancelledError shape (class that does not set .name)", () => {
    // Mirrors @zmkfirmware/zmk-studio-ts-client/transport/errors, which does
    // NOT set `this.name` -- detection must work via the constructor name.
    class UserCancelledError extends Error {
      constructor(m: string, opts?: ErrorOptions) {
        super(m, opts);
        Object.setPrototypeOf(this, UserCancelledError.prototype);
      }
    }
    const error = new UserCancelledError("User cancelled the connection attempt");
    expect(error.name).toBe("Error"); // sanity: .name alone is not enough
    expect(isUserCancelledError(error)).toBe(true);
  });

  it("returns true for an Error whose name is UserCancelledError", () => {
    const error = new Error("cancelled");
    error.name = "UserCancelledError";
    expect(isUserCancelledError(error)).toBe(true);
  });

  it("returns true for a DOMException named NotFoundError (picker dismissed)", () => {
    const error = new DOMException(
      "No port selected by the user.",
      "NotFoundError"
    );
    expect(isUserCancelledError(error)).toBe(true);
  });

  it("returns false for a DOMException with another name", () => {
    const error = new DOMException("The operation was aborted.", "AbortError");
    expect(isUserCancelledError(error)).toBe(false);
  });

  it("returns false for a generic Error", () => {
    expect(isUserCancelledError(new Error("Connection failed"))).toBe(false);
  });

  it("returns false for non-error values", () => {
    expect(isUserCancelledError("cancelled")).toBe(false);
    expect(isUserCancelledError(null)).toBe(false);
    expect(isUserCancelledError(undefined)).toBe(false);
    expect(isUserCancelledError({ name: "UserCancelledError" })).toBe(false);
  });
});
