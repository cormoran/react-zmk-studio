/**
 * Serial auto-reconnect helpers
 *
 * Web Serial remembers ports the user has previously granted permission for
 * across page loads. `navigator.serial.getPorts()` returns those ports
 * without showing a picker, which lets us reconnect automatically instead of
 * requiring the user to click "Connect" and re-select the device every time.
 *
 * When more than one port is paired (e.g. the user has connected to several
 * ZMK devices in the past), blindly picking `getPorts()[0]` may reconnect to
 * the wrong device. To avoid that, this module remembers which port was last
 * successfully connected to (in `sessionStorage` -- scoped to the current
 * browser tab/session, not persisted indefinitely like `localStorage`) and
 * prefers reconnecting to that one.
 */

import type { RpcTransport } from "@zmkfirmware/zmk-studio-ts-client/transport/index";

const LAST_SERIAL_PORT_STORAGE_KEY = "zmk-studio:last-serial-port";

interface RememberedSerialPortInfo {
  usbVendorId: number;
  usbProductId: number;
  /**
   * Position among currently-paired ports that share the same vendor/product
   * ids, used to disambiguate multiple identical devices. Web Serial does not
   * expose a stable per-device identifier (e.g. a USB serial number), so this
   * is a best-effort heuristic: if ports are unplugged/re-paired in a
   * different order, or a matching port's index shifts, this may pick a
   * different (but same-model) device instead of the exact same physical one.
   */
  matchIndex: number;
}

function getSessionStorage(): Storage | null {
  try {
    if (typeof window === "undefined" || !window.sessionStorage) return null;
    return window.sessionStorage;
  } catch {
    // Some environments (privacy mode, sandboxed iframes) throw on access.
    return null;
  }
}

function sameDevicePorts(ports: SerialPort[], vendorId: number, productId: number): SerialPort[] {
  return ports.filter((p) => {
    const info = p.getInfo();
    return info.usbVendorId === vendorId && info.usbProductId === productId;
  });
}

/**
 * Remembers `port` (among `allPorts`, the full list of currently paired
 * ports) as the last successfully connected serial port, so that a future
 * call to {@link connectToPairedSerial} prefers reconnecting to it.
 *
 * Silently does nothing if `sessionStorage` is unavailable, or if the port
 * doesn't expose USB vendor/product ids (nothing reliable to remember it by).
 *
 * Exported so apps building a custom connection UI (not using
 * {@link connectSerial}) can opt into the same remembering behavior.
 */
export function rememberSerialPort(port: SerialPort, allPorts: SerialPort[]): void {
  const storage = getSessionStorage();
  if (!storage) return;

  const info = port.getInfo();
  if (info.usbVendorId === undefined || info.usbProductId === undefined) return;

  const candidates = sameDevicePorts(allPorts, info.usbVendorId, info.usbProductId);
  const matchIndex = Math.max(0, candidates.indexOf(port));

  const remembered: RememberedSerialPortInfo = {
    usbVendorId: info.usbVendorId,
    usbProductId: info.usbProductId,
    matchIndex,
  };

  try {
    storage.setItem(LAST_SERIAL_PORT_STORAGE_KEY, JSON.stringify(remembered));
  } catch {
    // Storage full/unavailable -- remembering is best-effort only.
  }
}

/**
 * Clears the remembered last-connected serial port, if any.
 *
 * Apps may want to call this from their own "Disconnect" handler so that a
 * deliberate disconnect doesn't cause the next page load's auto-reconnect to
 * immediately reconnect to the same device.
 */
export function forgetRememberedSerialPort(): void {
  getSessionStorage()?.removeItem(LAST_SERIAL_PORT_STORAGE_KEY);
}

/**
 * Finds the remembered last-connected serial port among `ports`, or `null`
 * if nothing is remembered, storage is unavailable, or the remembered device
 * is no longer paired.
 */
export function findRememberedSerialPort(ports: SerialPort[]): SerialPort | null {
  const storage = getSessionStorage();
  if (!storage) return null;

  const raw = storage.getItem(LAST_SERIAL_PORT_STORAGE_KEY);
  if (!raw) return null;

  let remembered: RememberedSerialPortInfo;
  try {
    remembered = JSON.parse(raw);
  } catch {
    return null;
  }

  const candidates = sameDevicePorts(ports, remembered.usbVendorId, remembered.usbProductId);
  return candidates[remembered.matchIndex] ?? candidates[0] ?? null;
}

/**
 * Returns the list of serial ports the user has previously granted
 * permission for (via `navigator.serial.requestPort()`).
 *
 * Resolves to `[]` when the Web Serial API is unavailable (e.g. unsupported
 * browser, non-secure context) instead of throwing.
 */
export async function getPairedSerialPorts(): Promise<SerialPort[]> {
  if (typeof navigator === "undefined" || !("serial" in navigator)) {
    return [];
  }
  const serial = (navigator as Navigator & { serial?: Serial }).serial;
  if (!serial) return [];
  return serial.getPorts();
}

/**
 * Opens the given (already-paired) `SerialPort` and builds an `RpcTransport`
 * identical in shape to the one produced by
 * `@zmkfirmware/zmk-studio-ts-client/transport/serial`'s `connect()`.
 *
 * This is dependency-light on purpose: it only imports the `RpcTransport`
 * type from the ts-client, so it can be reused without pulling in the
 * `navigator.serial.requestPort()` picker flow.
 *
 * This is a low-level primitive: it does not remember the port for future
 * auto-reconnect. Use {@link connectSerial} or {@link connectToPairedSerial}
 * (or call {@link rememberSerialPort} yourself) if you want that.
 */
export async function connectToSerialPort(
  port: SerialPort
): Promise<RpcTransport> {
  const abortController = new AbortController();

  await port.open({ baudRate: 12500 }).catch((e: unknown) => {
    if (e instanceof DOMException && e.name === "NetworkError") {
      throw new Error(
        "Failed to open the serial port. Check the permissions of the device and verify it is not in use by another process.",
        { cause: e }
      );
    }
    throw e;
  });

  const info = port.getInfo();
  const label =
    (info.usbVendorId?.toLocaleString() || "") +
    ":" +
    (info.usbProductId?.toLocaleString() || "");

  const sig = abortController.signal;
  const abortCb = async () => {
    sig.removeEventListener("abort", abortCb);
    await port.writable?.close();
    await port.readable?.cancel();
    await port.close();
  };
  sig.addEventListener("abort", abortCb);

  return {
    label,
    abortController,
    readable: port.readable,
    writable: port.writable,
  } as RpcTransport;
}

/**
 * Requests a new serial port via the browser's device picker
 * (`navigator.serial.requestPort()`), opens it, and remembers it as the last
 * connected port for future {@link connectToPairedSerial} calls.
 *
 * Prefer this over importing `connect` directly from
 * `@zmkfirmware/zmk-studio-ts-client/transport/serial` when you also use
 * `ZMKConnection`'s `autoReconnect` prop (or `connectToPairedSerial`)
 * elsewhere in your app -- otherwise nothing ever records which of several
 * paired devices the user actually picked.
 *
 * Rejects with whatever `requestPort()` rejects with, including the
 * `DOMException` named `"NotFoundError"` thrown when the user dismisses the
 * picker (see `isUserCancelledError`).
 */
export async function connectSerial(): Promise<RpcTransport> {
  if (typeof navigator === "undefined" || !("serial" in navigator)) {
    throw new Error("Web Serial API is not available in this browser.");
  }
  const serial = (navigator as Navigator & { serial?: Serial }).serial;
  if (!serial) {
    throw new Error("Web Serial API is not available in this browser.");
  }

  const port = await serial.requestPort();
  const transport = await connectToSerialPort(port);

  const allPorts = await getPairedSerialPorts();
  rememberSerialPort(port, allPorts);

  return transport;
}

/**
 * Attempts to reconnect to a previously-paired serial port, without ever
 * showing the browser's device picker.
 *
 * If a port was remembered via {@link connectSerial} (or a manual
 * {@link rememberSerialPort} call) and is still paired, reconnects to that
 * one. Otherwise falls back to the first paired port, matching the previous
 * (pre-memory) behavior.
 *
 * Returns `null` (never throws) when there are no paired ports at all --
 * callers should treat that as "stay disconnected, wait for the user to
 * click Connect". Errors while opening a port (e.g. device unplugged) are
 * still thrown, since that's an actionable failure distinct from "nothing to
 * reconnect to".
 */
export async function connectToPairedSerial(): Promise<RpcTransport | null> {
  const ports = await getPairedSerialPorts();
  if (ports.length === 0) return null;

  const port = findRememberedSerialPort(ports) ?? ports[0];
  const transport = await connectToSerialPort(port);
  rememberSerialPort(port, ports);
  return transport;
}
