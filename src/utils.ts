/**
 * Utility functions for ZMK Studio React Hook
 */

/**
 * Wraps a promise with a timeout
 * @param promise - The promise to wrap
 * @param timeoutMs - Timeout in milliseconds (default: 5000ms)
 * @param errorMessage - Custom error message for timeout (default: "Operation timed out")
 * @returns The result of the promise if it resolves before timeout
 * @throws Error if the promise doesn't resolve within the timeout period
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number = 5000,
  errorMessage: string = "Operation timed out"
): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(errorMessage)), timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]);
}

/**
 * Wraps a promise with a sliding-window timeout that resets whenever the
 * device sends a packet. The timeout only fires if no bytes have been received
 * for `timeoutMs` milliseconds, meaning an actively-responding device will
 * never be cut off mid-transfer.
 *
 * @param promise - The RPC promise to race against the timeout
 * @param lastPacketMs - Function returning the epoch-ms timestamp of the last
 *   received transport byte. The timer compares `Date.now() - lastPacketMs()`
 *   against `timeoutMs` instead of counting from when the call started.
 * @param timeoutMs - Inactivity window in milliseconds (default: 5000ms)
 * @param errorMessage - Error message thrown on timeout
 */
export async function withActivityTimeout<T>(
  promise: Promise<T>,
  lastPacketMs: () => number,
  timeoutMs: number = 5000,
  errorMessage: string = "Operation timed out"
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    let timerHandle: ReturnType<typeof setTimeout> | null = null;

    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      if (timerHandle !== null) {
        clearTimeout(timerHandle);
        timerHandle = null;
      }
      fn();
    };

    const checkTimeout = () => {
      const elapsed = Date.now() - lastPacketMs();
      if (elapsed >= timeoutMs) {
        settle(() => reject(new Error(errorMessage)));
      } else {
        timerHandle = setTimeout(checkTimeout, timeoutMs - elapsed);
      }
    };

    timerHandle = setTimeout(checkTimeout, timeoutMs);

    promise.then(
      (value) => settle(() => resolve(value)),
      (error) => settle(() => reject(error))
    );
  });
}
