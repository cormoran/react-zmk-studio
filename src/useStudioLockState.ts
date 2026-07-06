/**
 * useStudioLockState Hook
 * Tracks ZMK Studio's core lock state for the connected device
 */

import { useContext, useEffect, useState } from "react";
import { call_rpc, MetaError } from "@zmkfirmware/zmk-studio-ts-client";
import { ErrorConditions } from "@zmkfirmware/zmk-studio-ts-client/meta";
import { LockState } from "@zmkfirmware/zmk-studio-ts-client/core";
import { ZMKAppContext } from "./ZMKAppContext";
import { withTimeout } from "./utils";

/**
 * Lock state as tracked by {@link useStudioLockState}.
 *
 * - `"unknown"`: the initial `getLockState` query has not resolved yet (or
 *   there is no connection). This is the state right after connecting.
 * - `"locked"` / `"unlocked"`: the last known state, either from the initial
 *   query or from a `lockStateChanged` notification.
 */
export type StudioLockState = "locked" | "unlocked" | "unknown";

export interface UseStudioLockStateReturn {
  /**
   * Whether ZMK Studio is currently locked.
   *
   * Treats `"unknown"` as `false` (optimistic) so simple UIs can just check
   * this boolean without handling a third state. Use `lockState` if you need
   * to distinguish "not yet known" from "confirmed unlocked".
   */
  locked: boolean;
  /** The precise lock state, including `"unknown"` before the initial query resolves. */
  lockState: StudioLockState;
}

/**
 * Tracks ZMK Studio's core lock state for the connected device.
 *
 * On connect (and whenever the connection changes), this hook queries the
 * initial lock state via `core.getLockState` RPC, then subscribes to core
 * `lockStateChanged` notifications to stay in sync afterwards.
 *
 * Many custom subsystems (and the settings subsystem) reject RPC calls with
 * an `UNLOCK_REQUIRED` meta error while Studio is locked -- see
 * {@link isUnlockRequiredError}. This hook lets the UI show a banner and
 * disable controls proactively, without waiting for a call to fail first.
 */
export function useStudioLockState(): UseStudioLockStateReturn {
  const zmkApp = useContext(ZMKAppContext);
  const [lockState, setLockState] = useState<StudioLockState>("unknown");

  useEffect(() => {
    if (!zmkApp) return;
    const connection = zmkApp.state.connection;

    // Reset to "unknown" whenever the connection changes (e.g. reconnecting
    // to a different device should not keep a stale lock state around). This
    // mirrors an external system (the connection) rather than deriving from
    // props/state, so a direct setState here is intentional -- see
    // react-hooks/set-state-in-effect's rationale.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLockState("unknown");

    if (!connection) return;

    let cancelled = false;

    withTimeout(call_rpc(connection, { core: { getLockState: true } }))
      .then((response) => {
        if (cancelled) return;
        const state = response.core?.getLockState;
        if (state === undefined) return;
        setLockState(
          state === LockState.ZMK_STUDIO_CORE_LOCK_STATE_LOCKED
            ? "locked"
            : "unlocked"
        );
      })
      .catch((error) => {
        console.error("Failed to get initial lock state", error);
      });

    const unsubscribe = zmkApp.onNotification({
      type: "core",
      callback: (notification) => {
        if (notification.lockStateChanged !== undefined) {
          setLockState(
            notification.lockStateChanged ===
              LockState.ZMK_STUDIO_CORE_LOCK_STATE_LOCKED
              ? "locked"
              : "unlocked"
          );
        }
      },
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [zmkApp, zmkApp?.state.connection]);

  return { locked: lockState === "locked", lockState };
}

/**
 * True if `error` is the {@link MetaError} raised by `call_rpc()` for a
 * secured RPC call made while ZMK Studio is locked
 * (`zmk.meta.ErrorConditions.UNLOCK_REQUIRED`).
 */
export function isUnlockRequiredError(error: unknown): boolean {
  return (
    error instanceof MetaError && error.condition === ErrorConditions.UNLOCK_REQUIRED
  );
}
