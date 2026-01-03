/**
 * Tests for ZMKAppContext
 */

import React, { useContext } from "react";
import { render, screen } from "@testing-library/react";
import { ZMKAppContext } from "../src/ZMKAppContext";

describe("ZMKAppContext", () => {
  const mockZMKApp = {
    state: {
      connection: null,
      deviceInfo: null,
      customSubsystems: null,
      isLoading: false,
      error: null,
    },
    connect: jest.fn(),
    disconnect: jest.fn(),
    findSubsystem: jest.fn(),
    isConnected: false,
    onNotification: jest.fn(),
  };

  it("should provide ZMK app context to children", () => {
    function TestComponent() {
      const zmkApp = useContext(ZMKAppContext);
      return <div>Connected: {zmkApp?.isConnected ? "Yes" : "No"}</div>;
    }

    render(
      <ZMKAppContext.Provider value={mockZMKApp}>
        <TestComponent />
      </ZMKAppContext.Provider>
    );

    expect(screen.getByText("Connected: No")).toBeDefined();
  });

  it("should allow null as context value", () => {
    function TestComponent() {
      const zmkApp = useContext(ZMKAppContext);
      return <div>Has Context: {zmkApp ? "Yes" : "No"}</div>;
    }

    render(
      <ZMKAppContext.Provider value={null}>
        <TestComponent />
      </ZMKAppContext.Provider>
    );

    expect(screen.getByText("Has Context: No")).toBeDefined();
  });

  it("should provide same instance to multiple children", () => {
    const receivedInstances: any[] = [];

    function TestChild1() {
      const zmkApp = useContext(ZMKAppContext);
      receivedInstances.push(zmkApp);
      return <div>Child 1</div>;
    }

    function TestChild2() {
      const zmkApp = useContext(ZMKAppContext);
      receivedInstances.push(zmkApp);
      return <div>Child 2</div>;
    }

    render(
      <ZMKAppContext.Provider value={mockZMKApp}>
        <TestChild1 />
        <TestChild2 />
      </ZMKAppContext.Provider>
    );

    expect(receivedInstances).toHaveLength(2);
    expect(receivedInstances[0]).toBe(receivedInstances[1]);
    expect(receivedInstances[0]).toBe(mockZMKApp);
  });

  it("should return null when used outside provider", () => {
    function TestComponent() {
      const zmkApp = useContext(ZMKAppContext);
      return <div>Context: {zmkApp ? "Exists" : "Null"}</div>;
    }

    render(<TestComponent />);

    expect(screen.getByText("Context: Null")).toBeDefined();
  });

  it("should provide access to all ZMK app methods", () => {
    function TestComponent() {
      const zmkApp = useContext(ZMKAppContext);
      expect(zmkApp?.connect).toBeDefined();
      expect(zmkApp?.disconnect).toBeDefined();
      expect(zmkApp?.findSubsystem).toBeDefined();
      expect(zmkApp?.onNotification).toBeDefined();
      return <div>Test</div>;
    }

    render(
      <ZMKAppContext.Provider value={mockZMKApp}>
        <TestComponent />
      </ZMKAppContext.Provider>
    );
  });

  it("should reflect state changes from the provider", () => {
    const updatedMockZMKApp = {
      ...mockZMKApp,
      state: {
        ...mockZMKApp.state,
        isLoading: true,
      },
    };

    function TestComponent() {
      const zmkApp = useContext(ZMKAppContext);
      return <div>Loading: {zmkApp?.state.isLoading ? "Yes" : "No"}</div>;
    }

    render(
      <ZMKAppContext.Provider value={updatedMockZMKApp}>
        <TestComponent />
      </ZMKAppContext.Provider>
    );

    expect(screen.getByText("Loading: Yes")).toBeDefined();
  });
});
