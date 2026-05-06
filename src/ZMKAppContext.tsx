/**
 * ZMKAppContext
 * React Context for sharing ZMK app state across components
 */

import type { ReactNode, ReactElement } from "react";
import React from "react";
import { createContext, useContext } from "react";
import type { UseZMKAppReturn } from "./useZMKApp";

/**
 * Context for ZMK app state
 * Provides connection state and methods to child components
 *
 * @example
 * import { useZMKApp, ZMKAppContext } from "@cormoran/zmk-studio-react-hook";
 *
 * function App() {
 *   const zmkApp = useZMKApp();
 *   return (
 *     <ZMKAppContext.Provider value={zmkApp}>
 *       <ConnectionButton />
 *       <DeviceStatus />
 *     </ZMKAppContext.Provider>
 *   );
 * }
 *
 * function ConnectionButton() {
 *   const zmkApp = useContext(ZMKAppContext);
 *   // ... use ZMK app state
 * }
 */
export const ZMKAppContext = createContext<UseZMKAppReturn | null>(null);

export interface ZMKAppProviderProps {
  children: ReactNode;
  value: UseZMKAppReturn | null;
}

/**
 * Convenience provider for supplying ZMK app state to descendants.
 */
export function ZMKAppProvider({
  children,
  value,
}: ZMKAppProviderProps): ReactElement {
  return (
    <ZMKAppContext.Provider value={value}>{children}</ZMKAppContext.Provider>
  );
}

/**
 * Read the current ZMK app context value.
 */
export function useZMKAppContext(): UseZMKAppReturn | null {
  return useContext(ZMKAppContext);
}

/**
 * Read the current ZMK app context value and fail fast when no provider exists.
 */
export function useRequiredZMKAppContext(): UseZMKAppReturn {
  const value = useZMKAppContext();

  if (!value) {
    throw new Error(
      "ZMKAppContext is not available. Wrap this component in ZMKAppProvider or ZMKAppContext.Provider."
    );
  }

  return value;
}
