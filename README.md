# React hooks for ZMK Studio Protocol

Unofficial react hooks and components for ZMK Studio.

The code wraps patched version of official client [@zmkfirmware/zmk-studio-ts-client](https://github.com/zmkfirmware/zmk-studio-ts-client).

**The patch and this library contains custom RPC protocol support to provide access to web to your ZMK module.**

> [!CAUTION]
> This library is built on top of unofficial patch to support custom RPC protocols.
> Compatibility with ZMK upstream is not ensured, although core part should work without the patch.

## Installation

Install from GitHub repository directly:

```bash
npm install "github:cormoran/react-zmk-studio"
```

Note that this library depends on cormoran's [**patched version** of @zmkfirmware/zmk-studio-ts-client](https://github.com/cormoran/zmk-studio-ts-client/tree/custom-studio-protocol), which will be installed automatically.

## Quick Start

### useZMKApp() react hook

`useZMKApp()` maintains connection status and provides useful callback methods.

```typescript
import { useContext } from "react";
import { useZMKApp, ZMKAppContext } from "@cormoran/zmk-studio-react-hook";
import { connect as connect_serial } from "@zmkfirmware/zmk-studio-ts-client/transport/serial";

function App() {
  const zmkApp = useZMKApp();

  return (
    <ZMKAppContext.Provider value={zmkApp}>
      <ConnectionButton />
      <DeviceInfo />
    </ZMKAppContext.Provider>
  );
}

function ConnectionButton() {
  const zmkApp = useContext(ZMKAppContext);
  if (!zmkApp) return null;

  const handleConnect = () => zmkApp.connect(connect_serial);

  return zmkApp.isConnected ? (
    <button onClick={zmkApp.disconnect}>Disconnect</button>
  ) : (
    <button onClick={handleConnect}>Connect</button>
  );
}

function DeviceInfo() {
  const zmkApp = useContext(ZMKAppContext);
  if (!zmkApp?.isConnected) return null;
  return <div>Device: {zmkApp.state.deviceInfo?.name}</div>;
}
```

### Using ZMKConnection Component

`ZMKConnection` component provides common rendering pattern.

`ZMKAppContext` is automatically provided for children.

```typescript
import { ZMKConnection } from "@cormoran/zmk-studio-react-hook";
import { connect as connect_serial } from "@zmkfirmware/zmk-studio-ts-client/transport/serial";

function MyComponent() {
  return (
    <ZMKConnection
      renderDisconnected={({ connect, isLoading }) => (
        <button onClick={() => connect(connect_serial)} disabled={isLoading}>
          {isLoading ? "Connecting..." : "Connect"}
        </button>
      )}
      renderConnected={({ disconnect, deviceName }) => (
        <div>
          <DeviceInfo />
          <button onClick={disconnect}>Disconnect</button>
        </div>
      )}
    />
  );
}

function DeviceInfo() {
  const zmkApp = useContext(ZMKAppContext);
  if (!zmkApp?.isConnected) return null;
  return <div>Device: {zmkApp.state.deviceInfo?.name}</div>;
}
```

### Working with Custom Subsystems

Interact with custom RPC subsystems on your ZMK device:

```typescript
import { useZMKApp, ZMKCustomSubsystem } from "@cormoran/zmk-studio-react-hook";
import { useEffect, useState } from "react";

function MyComponent() {
  const { state, findSubsystem, onNotification } = useZMKApp();
  const [service, setService] = useState<ZMKCustomSubsystem | null>(null);

  useEffect(() => {
    if (!state.connection) return;

    const subsystem = findSubsystem("your_identifier");
    if (subsystem) {
      setService(new ZMKCustomSubsystem(state.connection, subsystem.index));

      // Subscribe to notifications
      return onNotification({
        type: "custom",
        subsystemIndex: subsystem.index,
        callback: (notification) => console.log(notification.payload),
      });
    }
  }, [state.connection, findSubsystem, onNotification]);

  const sendRPC = async () => {
    if (service) {
      const payload = new Uint8Array([1, 2, 3]);
      const response = await service.callRPC(payload);
      console.log("Response:", response);
    }
  };

  return <button onClick={sendRPC}>Send RPC</button>;
}
```

## Testing

This library provides comprehensive test helpers to make testing your ZMK-based applications easier.

### Installation for Testing

The test helpers are available as a separate export:

```typescript
import {
  setupZMKMocks,
  createMockZMKApp,
  createConnectedMockZMKApp,
  ZMKAppProvider,
} from "@cormoran/zmk-studio-react-hook/testing";
```

### Quick Start

#### Testing Components that Use ZMKAppContext

Use `ZMKAppProvider` to provide mock ZMK app state to your components:

```typescript
import { render, screen } from "@testing-library/react";
import { ZMKAppProvider, createMockZMKApp } from "@cormoran/zmk-studio-react-hook/testing";
import { MyComponent } from "./MyComponent";

test("renders device name", () => {
  const mockZMKApp = createMockZMKApp({
    state: {
      deviceInfo: { name: "Test Device", serialNumber: new Uint8Array() },
      isConnected: true,
    },
  });

  render(
    <ZMKAppProvider value={mockZMKApp}>
      <MyComponent />
    </ZMKAppProvider>
  );

  expect(screen.getByText("Test Device")).toBeInTheDocument();
});
```

#### Testing with useZMKApp Hook

Use `setupZMKMocks()` to easily mock the ZMK client:

```typescript
import { renderHook, act } from "@testing-library/react";
import { useZMKApp } from "@cormoran/zmk-studio-react-hook";
import { setupZMKMocks } from "@cormoran/zmk-studio-react-hook/testing";

jest.mock("@zmkfirmware/zmk-studio-ts-client", () => ({
  create_rpc_connection: jest.fn(),
  call_rpc: jest.fn(),
}));

describe("My Hook", () => {
  let mocks: ReturnType<typeof setupZMKMocks>;

  beforeEach(() => {
    mocks = setupZMKMocks();
  });

  test("connects to device", async () => {
    const { result } = renderHook(() => useZMKApp());

    mocks.mockSuccessfulConnection({
      deviceName: "My Device",
      subsystems: ["my-subsystem"],
    });

    const connectFn = jest.fn().mockResolvedValue(mocks.mockTransport);

    await act(async () => {
      await result.current.connect(connectFn);
    });

    expect(result.current.isConnected).toBe(true);
    expect(result.current.state.deviceInfo?.name).toBe("My Device");
  });
});
```

### Test Helper API

#### Mock Factories

- **`createMockTransport()`** - Creates a mock RPC transport
- **`createMockConnection(options?)`** - Creates a mock RPC connection
  - `options.label` - Connection label (default: "test")
  - `options.notifications` - Array of notifications to emit
- **`createMockDeviceInfo(overrides?)`** - Creates mock device info
- **`createMockSubsystems(subsystems?)`** - Creates mock subsystems list
  - Pass array of string identifiers or objects with `{index, identifier, uiUrl?}`
- **`createMockZMKApp(overrides?)`** - Creates a mock ZMK app instance
- **`createConnectedMockZMKApp(options?)`** - Creates a connected mock ZMK app
  - `options.deviceName` - Device name (default: "Test Device")
  - `options.subsystems` - Array of subsystem identifiers
  - `options.notifications` - Array of notifications

#### Test Wrapper Components

- **`ZMKAppProvider`** - Provides ZMKAppContext to children
  ```typescript
  <ZMKAppProvider value={mockZMKApp}>
    <YourComponent />
  </ZMKAppProvider>
  ```

#### Setup Helpers

- **`setupZMKMocks()`** - Sets up common mocks for `@zmkfirmware/zmk-studio-ts-client`
  - Returns object with:
    - `mockTransport` - Mock transport instance
    - `mockConnection` - Mock connection instance
    - `create_rpc_connection` - Mock function reference
    - `call_rpc` - Mock function reference
    - `mockSuccessfulConnection(options)` - Configure successful connection
    - `mockFailedConnection(error)` - Configure failed connection
    - `mockFailedDeviceInfo()` - Configure device info failure

#### Notification Helpers

- **`createCoreNotification(notification)`** - Creates core notification
- **`createKeymapNotification(notification)`** - Creates keymap notification
- **`createCustomNotification(subsystemIndex, payload?)`** - Creates custom notification
- **`waitForNotification(callback, timeout?)`** - Waits for notification callback to be called

### Common Testing Patterns

#### Testing Connected State

```typescript
const mockZMKApp = createConnectedMockZMKApp({
  deviceName: "My Keyboard",
  subsystems: ["led-control", "battery-monitor"],
});

render(
  <ZMKAppProvider value={mockZMKApp}>
    <DeviceStatus />
  </ZMKAppProvider>
);
```

#### Testing Disconnected State

```typescript
const mockZMKApp = createMockZMKApp({
  isConnected: false,
  state: {
    isLoading: false,
    error: null,
  },
});
```

#### Testing Connection Errors

```typescript
test("handles connection errors", async () => {
  const { result } = renderHook(() => useZMKApp());
  
  const error = new Error("Connection failed");
  const connectFn = jest.fn().mockRejectedValue(error);

  await act(async () => {
    await result.current.connect(connectFn);
  });

  expect(result.current.state.error).toBe("Connection failed");
});
```

#### Testing Notifications

```typescript
test("receives custom notifications", async () => {
  const { result } = renderHook(() => useZMKApp());

  const notification = {
    custom: {
      customNotification: {
        subsystemIndex: 0,
        payload: new Uint8Array([1, 2, 3]),
      },
    },
  };

  mocks.mockSuccessfulConnection({
    subsystems: ["my-subsystem"],
    notifications: [notification],
  });

  const callback = jest.fn();
  result.current.onNotification({
    type: "custom",
    subsystemIndex: 0,
    callback,
  });

  await act(async () => {
    await result.current.connect(connectFn);
  });

  await waitFor(() => {
    expect(callback).toHaveBeenCalled();
  });
});
```

#### Testing findSubsystem

```typescript
test("finds subsystem by identifier", async () => {
  const { result } = renderHook(() => useZMKApp());

  mocks.mockSuccessfulConnection({
    subsystems: ["subsystem1", "subsystem2"],
  });

  await act(async () => {
    await result.current.connect(connectFn);
  });

  const found = result.current.findSubsystem("subsystem2");
  expect(found).toMatchObject({
    index: 1,
    identifier: "subsystem2",
  });
});
```

## API Reference For Coding Agent

This section provides comprehensive API documentation for coding agents to use or fix this library.

### Package Exports

The library exports the following from `index.ts`:

**Components and Hooks:**

- `useZMKApp` - Main hook for ZMK device connection management
- `ZMKAppContext` - React Context for sharing ZMK app state across components
- `ZMKConnection` - Headless React component for connection UI
- `ZMKCustomSubsystem` - Service class for custom RPC communication
- `ZMKCustomSubsystemError` - Error class for subsystem operations

**TypeScript Types:**

- `ZMKAppState` - State interface for useZMKApp
- `UseZMKAppReturn` - Return type interface for useZMKApp
- `NotificationSubscription` - Notification subscription type union
- `ZMKConnectionProps` - Props interface for ZMKConnection component

### `ZMKAppContext`

React Context for sharing ZMK app state across multiple components. Use standard React Context patterns with this context.

**Type:**

```typescript
const ZMKAppContext: React.Context<UseZMKAppReturn | null>;
```

**Usage:**

```typescript
import { useContext } from "react";
import { useZMKApp, ZMKAppContext } from "@cormoran/zmk-studio-react-hook";

function App() {
  const zmkApp = useZMKApp();
  return (
    <ZMKAppContext.Provider value={zmkApp}>
      <YourComponents />
    </ZMKAppContext.Provider>
  );
}

function MyComponent() {
  const zmkApp = useContext(ZMKAppContext);
  if (!zmkApp) return null;

  const { state, connect, disconnect } = zmkApp;
  // ... use ZMK app state
}
```

**For Coding Agents:**

- This is a standard React Context, use `useContext(ZMKAppContext)` to access it
- Always check for `null` when consuming the context (defensive programming)
- Create the ZMK app instance with `useZMKApp()` in a parent component
- Provide the instance via `<ZMKAppContext.Provider value={zmkApp}>`
- All child components can access the same ZMK app instance
- Prevents accidental creation of multiple ZMK app instances
- Should be provided high in the component tree, typically at app root
- `ZMKConnection` component automatically provides this context to its children

### `useZMKApp()`

Main hook for managing ZMK device connections. This hook handles the complete lifecycle of device connection, including transport setup, device discovery, subsystem enumeration, and notification handling.

**Signature:**

```typescript
function useZMKApp(): UseZMKAppReturn;
```

**Returns: `UseZMKAppReturn`**

```typescript
interface UseZMKAppReturn {
  state: ZMKAppState;
  connect: (connectFunction: () => Promise<RpcTransport>) => Promise<void>;
  disconnect: () => void;
  findSubsystem: (
    identifier: string
  ) => { index: number; identifier: string } | null;
  isConnected: boolean;
  onNotification: (subscription: NotificationSubscription) => () => void;
}
```

**State Interface: `ZMKAppState`**

```typescript
interface ZMKAppState {
  connection: RpcConnection | null;
  deviceInfo: GetDeviceInfoResponse | null; // Contains name, version, etc.
  customSubsystems: ListCustomSubsystemResponse | null; // Contains subsystems array
  isLoading: boolean;
  error: string | null;
}
```

**Methods:**

1. **`connect(connectFunction: () => Promise<RpcTransport>): Promise<void>`**
   - Establishes connection to a ZMK device
   - Uses AbortController internally for cancellation
   - Automatically fetches device info and custom subsystems after connection
   - Updates state with connection, deviceInfo, and customSubsystems on success
   - Sets state.error on failure (does not throw)
   - Example: `await connect(connect_serial)`

2. **`disconnect(): void`**
   - Disconnects from current device
   - Aborts all ongoing RPC operations via AbortController
   - Clears all notification subscriptions
   - Resets all state to initial values

3. **`findSubsystem(identifier: string): { index: number; identifier: string } | null`**
   - Searches customSubsystems for a subsystem with matching identifier
   - Returns object with `index` and `identifier` or `null` if not found
   - Returns `null` if not connected or no custom subsystems available

4. **`onNotification(subscription: NotificationSubscription): () => void`**
   - Subscribes to device notifications
   - Returns unsubscribe function that removes the callback
   - Multiple subscriptions can be active simultaneously
   - Subscriptions are automatically cleared on disconnect
   - See `NotificationSubscription` type below for details

5. **`isConnected: boolean`**
   - Computed property: `true` when `state.connection` is not null
   - Use this instead of checking `state.connection` directly

**Important Implementation Details for Agents:**

- The hook uses `useRef` for AbortController to manage connection lifecycle
- Notification callbacks are stored in refs to avoid re-renders
- The notification reader runs in a useEffect tied to `state.connection`
- Connection sequence: transport → RPC connection → device info → custom subsystems
- If device info fetch fails, the connection fails completely
- If custom subsystems fetch fails, connection succeeds but `state.customSubsystems` is null
- All RPC calls respect the AbortController signal

### `NotificationSubscription`

Type union for notification subscriptions. Use with `onNotification()` method.

```typescript
type NotificationSubscription =
  | { type: "core"; callback: (notification: CoreNotification) => void }
  | { type: "keymap"; callback: (notification: KeymapNotification) => void }
  | {
      type: "custom";
      subsystemIndex: number;
      callback: (notification: CustomNotification) => void;
    };
```

**Notification Types from @zmkfirmware/zmk-studio-ts-client:**

- `CoreNotification` - Core device notifications (lock state changes, etc.)
- `KeymapNotification` - Keymap-related notifications (unsaved changes, etc.)
- `CustomNotification` - Custom subsystem notifications (contains `subsystemIndex` and `payload: Uint8Array`)

**Usage Pattern:**

```typescript
const unsubscribe = onNotification({
  type: "custom",
  subsystemIndex: 0,
  callback: (notification) => {
    // notification.subsystemIndex: number
    // notification.payload: Uint8Array
  },
});
// Call unsubscribe() when done
```

### `ZMKConnection`

Headless React component for connection management. Provides connection logic without any styling.

**Props Interface: `ZMKConnectionProps`**

```typescript
interface ZMKConnectionProps {
  zmkApp?: UseZMKAppReturn; // Optional: use external ZMK app state
  renderDisconnected: (props: {
    connect: (connectFunction: () => Promise<RpcTransport>) => Promise<void>;
    isLoading: boolean;
    error: string | null;
  }) => React.ReactNode;
  renderConnected: (props: {
    disconnect: () => void;
    deviceName: string | undefined;
    subsystems: Array<{ index: number; identifier: string }>;
    findSubsystem: (
      identifier: string
    ) => { index: number; identifier: string } | null;
  }) => React.ReactNode;
}
```

**Component Behavior:**

- If `zmkApp` prop is provided: Uses that external ZMK app instance (allows parent to control state)
- If `zmkApp` prop is NOT provided: Creates internal `useZMKApp()` instance
- Always provides `ZMKAppContext` to children (accessible via `useZMKAppContext()`)
- Renders `renderDisconnected` when `isConnected === false`
- Renders `renderConnected` when `isConnected === true`
- Transforms `state.customSubsystems.subsystems` into simple `{index, identifier}` array
- Passes through `findSubsystem` function from useZMKApp
- `deviceName` comes from `state.deviceInfo?.name`

**For Coding Agents:**

- This is a render-props pattern component
- Return type must be `React.ReactElement`, not just `React.ReactNode`
- When `zmkApp` prop is provided, the component does not create its own state
- When `zmkApp` prop is NOT provided, it internally calls `useZMKApp()`
- Always wraps content in `ZMKAppContextProvider` for child component access
- The `zmkApp` prop enables two patterns:
  1. **Standalone**: `<ZMKConnection />` (creates own state)
  2. **Controlled**: `<ZMKConnection zmkApp={zmkApp} />` (uses external state)
- Children of rendered content can use `useZMKAppContext()` to access ZMK state

### `ZMKCustomSubsystem`

Service class for RPC communication with custom subsystems on ZMK devices.

**Constructor:**

```typescript
constructor(connection: RpcConnection, subsystemIndex: number)
```

**Methods:**

1. **`callRPC(payload: Uint8Array): Promise<Uint8Array | null>`**
   - Sends RPC request to the subsystem
   - `payload` should be a serialized protobuf message (Uint8Array)
   - Returns response payload as Uint8Array, or null if no response payload
   - Throws error if RPC call fails (does not return ZMKCustomSubsystemError)
   - Internally calls `call_rpc(connection, { custom: { call: { subsystemIndex, payload } } })`
   - Response path: `response.custom?.call?.payload`

2. **`isReady(): boolean`**
   - Returns `true` if connection exists (truthy check on `this.connection`)
   - Simple connection availability check

3. **`getSubsystemIndex(): number`**
   - Returns the subsystem index passed to constructor
   - Useful for debugging or logging

4. **`getConnection(): RpcConnection`**
   - Returns the underlying RPC connection object
   - Useful for advanced use cases or testing

**Implementation Notes for Agents:**

- The class stores connection and subsystemIndex as private properties
- Does NOT validate subsystemIndex against available subsystems
- Does NOT handle AbortController - that's managed by the connection from useZMKApp
- The `callRPC` method propagates any errors from `call_rpc` directly
- Returns `null` when response.custom?.call?.payload is undefined/null

### `ZMKCustomSubsystemError`

Custom error class for subsystem operations. Currently defined but not actively used by ZMKCustomSubsystem.

**Constructor:**

```typescript
constructor(
  type: 'connection' | 'rpc' | 'validation',
  message: string,
  code?: number
)
```

**Properties:**

- `name: string` - Always "ZMKCustomSubsystemError"
- `message: string` - Error description
- `type: 'connection' | 'rpc' | 'validation'` - Error category
- `code?: number` - Optional error code

**For Coding Agents:**

- This class is exported but not currently thrown by ZMKCustomSubsystem
- Can be used in user code for consistent error handling
- Extends native `Error` class

## Code Verification Instructions for Agents

When modifying or using this library, verify your changes with:

### Build and Type Checking

```bash
npm run build        # Compiles TypeScript to lib/ directory
npm run typecheck    # Runs tsc --noEmit to check types without building
```

### Linting

```bash
npm run lint         # Runs eslint with --fix flag
```

### Testing

```bash
npm run test         # Runs jest with coverage
```

### Test File Structure

- All test files are in `test/` directory
- Test files use `.spec.ts` or `.spec.tsx` extension
- Tests use `@testing-library/react` for React components
- Tests mock `@zmkfirmware/zmk-studio-ts-client` module

### Updating Document

Check README.md and ensure the changes are reflected.
The first part of README.md is for human readers. It should be simple and easy to understand.
The latter part from API documentation is for developer and coding agent. It should contain enough information to use this library.

### Error Handling Patterns

- `connect()` catches errors and sets `state.error`, does not throw
- `callRPC()` propagates errors from underlying RPC, does not catch
- `disconnect()` never throws, always succeeds
- Notification reader errors are logged but do not affect state

## License

MIT
