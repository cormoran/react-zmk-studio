/**
 * Tests for serial auto-reconnect helpers
 */

import {
  getPairedSerialPorts,
  connectToSerialPort,
  connectSerial,
  connectToPairedSerial,
  rememberSerialPort,
  forgetRememberedSerialPort,
  findRememberedSerialPort,
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

function createMockPortWithIds(
  usbVendorId: number,
  usbProductId: number
): SerialPort {
  return createMockPort({
    getInfo: jest.fn().mockReturnValue({ usbVendorId, usbProductId }),
  } as Partial<SerialPort>);
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

describe("remembered serial port (rememberSerialPort / findRememberedSerialPort / forgetRememberedSerialPort)", () => {
  afterEach(() => {
    window.sessionStorage.clear();
  });

  it("returns null when nothing is remembered", () => {
    expect(findRememberedSerialPort([createMockPort()])).toBeNull();
  });

  it("remembers a port and finds it again among the same ports", () => {
    const portA = createMockPortWithIds(0x1111, 0x2222);
    const portB = createMockPortWithIds(0x3333, 0x4444);

    rememberSerialPort(portB, [portA, portB]);

    expect(findRememberedSerialPort([portA, portB])).toBe(portB);
  });

  it("disambiguates multiple ports sharing the same vendor/product ids by position", () => {
    const portA = createMockPortWithIds(0x1234, 0x5678);
    const portB = createMockPortWithIds(0x1234, 0x5678);
    const ports = [portA, portB];

    rememberSerialPort(portB, ports);

    expect(findRememberedSerialPort(ports)).toBe(portB);
  });

  it("does not remember a port with no usb vendor/product ids", () => {
    const port = createMockPort({
      getInfo: jest.fn().mockReturnValue({}),
    } as Partial<SerialPort>);

    rememberSerialPort(port, [port]);

    expect(findRememberedSerialPort([port])).toBeNull();
  });

  it("falls back to null when the remembered device is no longer paired", () => {
    const portA = createMockPortWithIds(0x1111, 0x2222);
    const portB = createMockPortWithIds(0x3333, 0x4444);

    rememberSerialPort(portB, [portA, portB]);

    expect(findRememberedSerialPort([portA])).toBeNull();
  });

  it("forgetRememberedSerialPort clears the remembered entry", () => {
    const port = createMockPort();
    rememberSerialPort(port, [port]);
    expect(findRememberedSerialPort([port])).toBe(port);

    forgetRememberedSerialPort();

    expect(findRememberedSerialPort([port])).toBeNull();
  });

  it("survives corrupted storage content", () => {
    window.sessionStorage.setItem("zmk-studio:last-serial-port", "not json");

    expect(findRememberedSerialPort([createMockPort()])).toBeNull();
  });
});

describe("connectSerial", () => {
  const originalNavigator = global.navigator;

  afterEach(() => {
    Object.defineProperty(global, "navigator", {
      value: originalNavigator,
      writable: true,
      configurable: true,
    });
    window.sessionStorage.clear();
  });

  it("throws when navigator.serial is unavailable", async () => {
    Object.defineProperty(global, "navigator", {
      value: {},
      writable: true,
      configurable: true,
    });

    await expect(connectSerial()).rejects.toThrow(/Web Serial/);
  });

  it("requests a port, opens it, and remembers it", async () => {
    const port = createMockPort();
    const requestPort = jest.fn().mockResolvedValue(port);
    const getPorts = jest.fn().mockResolvedValue([port]);
    Object.defineProperty(global, "navigator", {
      value: { serial: { requestPort, getPorts } },
      writable: true,
      configurable: true,
    });

    const transport = await connectSerial();

    expect(requestPort).toHaveBeenCalled();
    expect(transport.label).toBe(
      `${(0x1234).toLocaleString()}:${(0x5678).toLocaleString()}`
    );
    expect(findRememberedSerialPort([port])).toBe(port);
  });

  it("propagates a user-cancelled picker rejection", async () => {
    const requestPort = jest
      .fn()
      .mockRejectedValue(new DOMException("cancelled", "NotFoundError"));
    Object.defineProperty(global, "navigator", {
      value: { serial: { requestPort } },
      writable: true,
      configurable: true,
    });

    await expect(connectSerial()).rejects.toThrow(DOMException);
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
    window.sessionStorage.clear();
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

  it("connects to the first paired port when nothing is remembered", async () => {
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

  it("prefers the remembered port over the first paired port", async () => {
    const portA = createMockPortWithIds(0x1111, 0x2222);
    const portB = createMockPortWithIds(0x3333, 0x4444);
    rememberSerialPort(portB, [portA, portB]);

    Object.defineProperty(global, "navigator", {
      value: {
        serial: { getPorts: jest.fn().mockResolvedValue([portA, portB]) },
      },
      writable: true,
      configurable: true,
    });

    await connectToPairedSerial();

    expect(portB.open).toHaveBeenCalledWith({ baudRate: 12500 });
    expect(portA.open).not.toHaveBeenCalled();
  });

  it("falls back to the first port when the remembered device is no longer paired", async () => {
    const portA = createMockPortWithIds(0x1111, 0x2222);
    const portB = createMockPortWithIds(0x3333, 0x4444);
    rememberSerialPort(portB, [portA, portB]);

    Object.defineProperty(global, "navigator", {
      value: { serial: { getPorts: jest.fn().mockResolvedValue([portA]) } },
      writable: true,
      configurable: true,
    });

    await connectToPairedSerial();

    expect(portA.open).toHaveBeenCalledWith({ baudRate: 12500 });
  });
});
