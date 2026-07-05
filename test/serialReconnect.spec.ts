/**
 * Tests for serial auto-reconnect helpers
 */

import {
  getPairedSerialPorts,
  connectToSerialPort,
  connectToPairedSerial,
} from "../src/serialReconnect";

function createMockPort(overrides: Partial<SerialPort> = {}): SerialPort {
  const readable = {} as ReadableStream<Uint8Array>;
  const writable = {
    close: jest.fn().mockResolvedValue(undefined),
  } as unknown as WritableStream<Uint8Array>;

  return {
    open: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined),
    getInfo: jest.fn().mockReturnValue({
      usbVendorId: 0x1234,
      usbProductId: 0x5678,
    }),
    readable: { ...readable, cancel: jest.fn().mockResolvedValue(undefined) },
    writable,
    ...overrides,
  } as unknown as SerialPort;
}

describe("getPairedSerialPorts", () => {
  const originalNavigator = global.navigator;

  afterEach(() => {
    Object.defineProperty(global, "navigator", {
      value: originalNavigator,
      writable: true,
      configurable: true,
    });
  });

  it("returns [] when navigator.serial is unavailable", async () => {
    Object.defineProperty(global, "navigator", {
      value: {},
      writable: true,
      configurable: true,
    });

    await expect(getPairedSerialPorts()).resolves.toEqual([]);
  });

  it("returns the ports from navigator.serial.getPorts()", async () => {
    const port = createMockPort();
    const getPorts = jest.fn().mockResolvedValue([port]);
    Object.defineProperty(global, "navigator", {
      value: { serial: { getPorts } },
      writable: true,
      configurable: true,
    });

    const ports = await getPairedSerialPorts();
    expect(ports).toEqual([port]);
    expect(getPorts).toHaveBeenCalled();
  });
});

describe("connectToSerialPort", () => {
  it("opens the port at baudRate 12500 and returns an RpcTransport", async () => {
    const port = createMockPort();

    const transport = await connectToSerialPort(port);

    expect(port.open).toHaveBeenCalledWith({ baudRate: 12500 });
    expect(transport.label).toBe(
      `${(0x1234).toLocaleString()}:${(0x5678).toLocaleString()}`
    );
    expect(transport.readable).toBe(port.readable);
    expect(transport.writable).toBe(port.writable);
    expect(transport.abortController).toBeInstanceOf(AbortController);
  });

  it("closes the port when the abort controller is aborted", async () => {
    const port = createMockPort();
    const transport = await connectToSerialPort(port);

    transport.abortController.abort();
    // abort listener runs asynchronously as a microtask
    await Promise.resolve();
    await Promise.resolve();

    expect(port.writable?.close).toHaveBeenCalled();
    expect(port.readable?.cancel).toHaveBeenCalled();
    expect(port.close).toHaveBeenCalled();
  });

  it("produces an empty label when usb ids are missing", async () => {
    const port = createMockPort({
      getInfo: jest.fn().mockReturnValue({}),
    } as any);

    const transport = await connectToSerialPort(port);
    expect(transport.label).toBe(":");
  });
});

describe("connectToPairedSerial", () => {
  const originalNavigator = global.navigator;

  afterEach(() => {
    Object.defineProperty(global, "navigator", {
      value: originalNavigator,
      writable: true,
      configurable: true,
    });
  });

  it("returns null when there are no paired ports", async () => {
    Object.defineProperty(global, "navigator", {
      value: { serial: { getPorts: jest.fn().mockResolvedValue([]) } },
      writable: true,
      configurable: true,
    });

    await expect(connectToPairedSerial()).resolves.toBeNull();
  });

  it("returns null when navigator.serial is unavailable", async () => {
    Object.defineProperty(global, "navigator", {
      value: {},
      writable: true,
      configurable: true,
    });

    await expect(connectToPairedSerial()).resolves.toBeNull();
  });

  it("connects to the first paired port", async () => {
    const port = createMockPort();
    Object.defineProperty(global, "navigator", {
      value: { serial: { getPorts: jest.fn().mockResolvedValue([port]) } },
      writable: true,
      configurable: true,
    });

    const transport = await connectToPairedSerial();
    expect(transport).not.toBeNull();
    expect(port.open).toHaveBeenCalledWith({ baudRate: 12500 });
  });
});
