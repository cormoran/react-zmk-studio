/**
 * Tests for utility functions
 */

import { withTimeout } from "../src/utils";

describe("withTimeout", () => {
  it("should resolve when promise completes before timeout", async () => {
    const promise = Promise.resolve("success");
    const result = await withTimeout(promise, 1000);
    expect(result).toBe("success");
  });

  it("should reject when promise takes longer than timeout", async () => {
    const promise = new Promise((resolve) => setTimeout(resolve, 2000));
    await expect(withTimeout(promise, 100)).rejects.toThrow(
      "Operation timed out"
    );
  });

  it("should use custom error message", async () => {
    const promise = new Promise((resolve) => setTimeout(resolve, 2000));
    await expect(
      withTimeout(promise, 100, "Custom timeout error")
    ).rejects.toThrow("Custom timeout error");
  });

  it("should use default timeout of 5000ms", async () => {
    const promise = new Promise((resolve) => setTimeout(resolve, 6000));
    const startTime = Date.now();

    await expect(withTimeout(promise)).rejects.toThrow("Operation timed out");

    const elapsed = Date.now() - startTime;
    expect(elapsed).toBeGreaterThanOrEqual(5000);
    expect(elapsed).toBeLessThan(6000);
  }, 6000);

  it("should propagate promise rejection", async () => {
    const promise = Promise.reject(new Error("Promise error"));
    await expect(withTimeout(promise, 1000)).rejects.toThrow("Promise error");
  });

  it("should handle promise that resolves with undefined", async () => {
    const promise = Promise.resolve(undefined);
    const result = await withTimeout(promise, 1000);
    expect(result).toBeUndefined();
  });

  it("should handle promise that resolves with null", async () => {
    const promise = Promise.resolve(null);
    const result = await withTimeout(promise, 1000);
    expect(result).toBeNull();
  });

  it("should handle promise that resolves with complex objects", async () => {
    const complexObject = { data: [1, 2, 3], nested: { value: "test" } };
    const promise = Promise.resolve(complexObject);
    const result = await withTimeout(promise, 1000);
    expect(result).toEqual(complexObject);
  });
});
