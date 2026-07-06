/**
 * @zmkfirmware/zmk-studio-react-hook
 * React hooks wrapper for ZMK Studio TypeScript client
 */

export { useZMKApp } from "./useZMKApp";
export {
  ZMKCustomSubsystem,
  ZMKCustomSubsystemError,
} from "./ZMKCustomSubsystem";
export { ZMKConnection } from "./ZMKConnection";
export { ZMKAppContext } from "./ZMKAppContext";
export { withTimeout } from "./utils";
export { useStudioLockState, isUnlockRequiredError } from "./useStudioLockState";
export {
  getPairedSerialPorts,
  connectToSerialPort,
  connectSerial,
  connectToPairedSerial,
  rememberSerialPort,
  forgetRememberedSerialPort,
  findRememberedSerialPort,
} from "./serialReconnect";
export {
  isWebSerialSupported,
  isWebBluetoothSupported,
  isUserCancelledError,
} from "./transportSupport";
export { useCustomSubsystem } from "./useCustomSubsystem";

export type {
  ZMKAppState,
  UseZMKAppReturn,
  NotificationSubscription,
} from "./useZMKApp";
export type { ZMKConnectionProps } from "./ZMKConnection";
export type {
  StudioLockState,
  UseStudioLockStateReturn,
} from "./useStudioLockState";
export type {
  Codec,
  UseCustomSubsystemReturn,
  UseCustomSubsystemTypedReturn,
} from "./useCustomSubsystem";
