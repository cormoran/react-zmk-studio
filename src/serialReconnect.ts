/**
 * Serial auto-reconnect helpers
 *
 * Web Serial remembers ports the user has previously granted permission for
 * across page loads. `navigator.serial.getPorts()` returns those ports
 * without showing a picker, which lets us reconnect automatically instead of
 * requiring the user to click "Connect" and re-select the device every time.
 */

import type { RpcTransport } from "@zmkfirmware/zmk-studio-ts-client/transport/index";

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
 * Attempts to reconnect to the first previously-paired serial port, without
 * ever showing the browser's device picker.
 *
 * Returns `null` (never throws) when there are no paired ports -- callers
 * should treat that as "stay disconnected, wait for the user to click
 * Connect". Errors while opening a paired port (e.g. device unplugged) are
 * still thrown, since that's an actionable failure distinct from "nothing to
 * reconnect to".
 */
export async function connectToPairedSerial(): Promise<RpcTransport | null> {
  const ports = await getPairedSerialPorts();
  const port = ports[0];
  if (!port) return null;
  return connectToSerialPort(port);
}
