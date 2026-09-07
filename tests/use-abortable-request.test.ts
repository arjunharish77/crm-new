import { describe, expect, it } from "vitest";
import { isAbortError } from "@/hooks/use-abortable-request";

describe("isAbortError", () => {
  it("returns true for a real AbortError", () => {
    const error = new Error("aborted");
    error.name = "AbortError";
    expect(isAbortError(error)).toBe(true);
  });

  it("returns false for an unrelated error", () => {
    expect(isAbortError(new Error("network error"))).toBe(false);
  });

  it("returns false for a non-Error value", () => {
    expect(isAbortError("aborted")).toBe(false);
    expect(isAbortError(null)).toBe(false);
    expect(isAbortError(undefined)).toBe(false);
  });
});
