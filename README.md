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

### Using ZMKConnection Component

The library provides a headless `ZMKConnection` component that renders component based on connection status.

```typescript
import { ZMKConnection } from "@cormoran/zmk-studio-react-hook";
import { connect as connect_serial } from "@zmkfirmware/zmk-studio-ts-client/transport/serial";

function MyComponent() {
  return (
    <ZMKConnection
      connectFunction={connect_serial}
      renderDisconnected={({ connect, isLoading, error }) => (
        <div>
          {isLoading && <div>Connecting...</div>}
          {error && <div>Error: {error}</div>}
          {!isLoading && <button onClick={connect}>Connect to Device</button>}
        </div>
      )}
      renderConnected={({ disconnect, deviceName, subsystems }) => (
        <div>
          <h2>Connected to: {deviceName}</h2>
          <button onClick={disconnect}>Disconnect</button>
          <div>
            {subsystems.map((sub) => (
              <div key={sub.index}>
                {sub.identifier} (Index: {sub.index})
              </div>
            ))}
          </div>
        </div>
      )}
    />
  );
}
```

### Using useZMKApp Hook Directly

For more control, use the `useZMKApp` hook directly:

```typescript
import { useZMKApp } from "@cormoran/zmk-studio-react-hook";
import { connect as connect_serial } from "@zmkfirmware/zmk-studio-ts-client/transport/serial";

function MyComponent() {
  const { state, connect, disconnect, isConnected } = useZMKApp();

  const handleConnect = async () => {
    await connect(connect_serial);
  };

  if (state.isLoading) {
    return <div>Connecting...</div>;
  }

  if (state.error) {
    return <div>Error: {state.error}</div>;
  }

  if (!isConnected) {
    return <button onClick={handleConnect}>Connect to Device</button>;
  }

  return (
    <div>
      <h2>Connected to: {state.deviceInfo?.name}</h2>
      <button onClick={disconnect}>Disconnect</button>

      {state.customSubsystems?.subsystems.map((sub) => (
        <div key={sub.index}>
          {sub.identifier} (Index: {sub.index})
        </div>
      ))}
    </div>
  );
}
```

### Using ZMKCustomSubsystem to interact with your ZMK module

Custom subsystem is unofficial patch being developed in [cormoran/zmk#v0.3+custom-studio-protocol](https://github.com/cormoran/zmk/tree/v0.3%2Bcustom-studio-protocol).

Below code provides interaction with ZMK module which implements the unofficial custom subsystem.

```typescript
import {
  useZMKApp,
  ZMKCustomSubsystem,
} from "@cormoran/zmk-studio-react-hook";
import { useEffect, useState } from "react";

function MyComponent() {
  const { state, connect, isConnected, findSubsystem } = useZMKApp();
  const [service, setService] = useState<ZMKCustomSubsystem | null>(null);

  useEffect(() => {
    if (state.connection && state.customSubsystems) {
      // Replace 'your_identifier' with the actual identifier string for your subsystem
      const found = findSubsystem("your_identifier");
      if (found) {
        setService(new ZMKCustomSubsystem(state.connection, found.index));
      }
    }
  }, [state.connection, state.customSubsystems, findSubsystem]);

  const sendRPC = async () => {
    if (service) {
      const payload = new Uint8Array([1, 2, 3]); // Your protobuf payload
      const response = await service.callRPC(payload);
      console.log("Response:", response);
    }
  };

  return (
    <div>
      {isConnected && service && <button onClick={sendRPC}>Send RPC</button>}
    </div>
  );
}
```

### Handling Custom Notifications from your ZMK module

```typescript
import { useZMKApp } from "@cormoran/zmk-studio-react-hook";
import { useEffect } from "react";

function MyComponent() {
  const { findSubsystem, onNotification, isConnected } = useZMKApp();

  useEffect(() => {
    if (!isConnected) return;

    // Replace 'your_identifier' with the actual identifier string for your subsystem
    const found = findSubsystem("your_identifier");
    if (!found) return;

    // Subscribe to custom notifications from the found subsystem
    const unsubscribe = onNotification({
      type: "custom",
      subsystemIndex: found.index,
      callback: (notification) => {
        console.log("Received custom notification:", notification);
        console.log("Payload:", notification.payload);
      },
    });

    // Cleanup subscription on unmount
    return unsubscribe;
  }, [isConnected, findSubsystem, onNotification]);

  return <div>...</div>;
}
```

## API Reference For Coding Agent

This section provides comprehensive API documentation for coding agents to use or fix this library.

### Package Exports

The library exports the following from `index.ts`:

**Components and Hooks:**

- `useZMKApp` - Main hook for ZMK device connection management
- `ZMKConnection` - Headless React component for connection UI
- `ZMKCustomSubsystem` - Service class for custom RPC communication
- `ZMKCustomSubsystemError` - Error class for subsystem operations

**TypeScript Types:**

- `ZMKAppState` - State interface for useZMKApp
- `UseZMKAppReturn` - Return type interface for useZMKApp
- `NotificationSubscription` - Notification subscription type union
- `ZMKConnectionProps` - Props interface for ZMKConnection component

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
  connectFunction: () => Promise<RpcTransport>;
  renderDisconnected: (props: {
    connect: () => Promise<void>;
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

- Internally uses `useZMKApp()` hook
- Renders `renderDisconnected` when `isConnected === false`
- Renders `renderConnected` when `isConnected === true`
- Transforms `state.customSubsystems.subsystems` into simple `{index, identifier}` array
- Passes through `findSubsystem` function from useZMKApp
- `deviceName` comes from `state.deviceInfo?.name`

**For Coding Agents:**

- This is a render-props pattern component
- Return type must be `React.ReactElement`, not just `React.ReactNode`
- The component does not manage any state itself, just wraps useZMKApp

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
