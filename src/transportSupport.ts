/**
 * Transport feature detection and picker-cancel helpers
 *
 * ZMK Studio devices are reached over Web Serial or Web Bluetooth. Both APIs
 * are currently Chromium-only (Chrome, Edge, Opera, ...) and are only exposed
 * in a secure context (HTTPS or localhost). These helpers let apps detect
 * support up front -- e.g. render a "please use Chrome/Edge over HTTPS"
 * message when both return `false` -- and distinguish a user dismissing the
 * device picker from a real connection failure.
 */

/**
 * Whether the Web Serial API (`navigator.serial`) is available.
 *
 * Web Serial is Chromium-only (Chrome, Edge, Opera, ...) and requires a
 * secure context (HTTPS or localhost); this returns `false` in Firefox,
 * Safari, non-secure contexts, and non-browser environments (SSR, tests).
 *
 * @example
 * {isWebSerialSupported() && <button onClick={connectSerial}>USB</button>}
 * {!isWebSerialSupported() && !isWebBluetoothSupported() && (
 *   <p>Please use Chrome or Edge over HTTPS to connect.</p>
 * )}
 */
export function isWebSerialSupported(): boolean {
  return typeof navigator !== "undefined" && "serial" in navigator;
}

/**
 * Whether the Web Bluetooth API (`navigator.bluetooth`) is available.
 *
 * Web Bluetooth is Chromium-only (Chrome, Edge, Opera, ...) and requires a
 * secure context (HTTPS or localhost); this returns `false` in Firefox,
 * Safari, non-secure contexts, and non-browser environments (SSR, tests).
 */
export function isWebBluetoothSupported(): boolean {
  return typeof navigator !== "undefined" && "bluetooth" in navigator;
}

/**
 * True if `error` means the user dismissed the browser's device picker
 * (a normal user action, not a failure worth surfacing in the UI).
 *
 * Detects:
 * - the ts-client GATT transport's `UserCancelledError` (thrown by
 *   `@zmkfirmware/zmk-studio-ts-client/transport/gatt`'s `connect()` when the
 *   Bluetooth picker is cancelled), matched by name. The check is name-based
 *   (`.name` or a constructor name in the prototype chain) rather than
 *   `instanceof` because importing the transport module at runtime would pull
 *   untranspiled ESM into consumers' test setups. Note the ts-client class
 *   does not set `.name`, hence the constructor-name walk;
 * - a `DOMException` named `"NotFoundError"`, which is what
 *   `navigator.serial.requestPort()` and `navigator.bluetooth.requestDevice()`
 *   reject with when the user closes the picker without selecting a device.
 *
 * `useZMKApp`'s `connect()` uses this to swallow picker cancellations
 * silently instead of setting `state.error`.
 */
export function isUserCancelledError(error: unknown): boolean {
  if (error instanceof DOMException) {
    return error.name === "NotFoundError";
  }
  if (!(error instanceof Error)) {
    return false;
  }
  if (error.name === "UserCancelledError") {
    return true;
  }
  // The ts-client's UserCancelledError does not set `.name` (so it reads
  // "Error"); detect it by constructor name anywhere in the prototype chain.
  for (
    let proto = Object.getPrototypeOf(error);
    proto !== null;
    proto = Object.getPrototypeOf(proto)
  ) {
    if (proto.constructor?.name === "UserCancelledError") {
      return true;
    }
  }
  return false;
}
