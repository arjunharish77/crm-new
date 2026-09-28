import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("js-cookie", () => ({ default: { get: () => undefined, remove: () => undefined } }));

import { apiFetch } from "@/lib/api";

function makeAbortError() {
  const error = new Error("The operation was aborted");
  error.name = "AbortError";
  return error;
}

// A fetch stub that actually respects the `signal` it's given (rejects when the signal aborts),
// so these tests exercise apiFetch's real forwarding logic rather than a mock that ignores it.
function respondingToSignal() {
  return vi.fn((_url: string, init?: RequestInit) => {
    return new Promise((_resolve, reject) => {
      const signal = init?.signal;
      if (signal?.aborted) {
        reject(makeAbortError());
        return;
      }
      signal?.addEventListener("abort", () => reject(makeAbortError()));
    });
  });
}

// Gap checklist Module 10's "performance UX polish" item, "request cancellation on tab/filter
// changes" -- previously `options.signal` was silently clobbered by spread order, so a caller
// had no way to actually cancel an in-flight apiFetch call.
describe("apiFetch request cancellation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("resolves normally when a signal is provided but never aborted", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } })),
    );
    const controller = new AbortController();
    const result = await apiFetch("/leads", { signal: controller.signal });
    expect(result).toEqual({ ok: true });
  });

  it("returns a successful null strategy instead of throwing while building debug metadata", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("null", {
      status: 200, headers: { "content-type": "application/json" },
    })));
    await expect(apiFetch("/next-best-action/strategies/LEAD")).resolves.toBeNull();
  });

  it("forwards a caller-supplied AbortSignal to fetch's own signal", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();
    await apiFetch("/leads", { signal: controller.signal });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects with a real AbortError (not a timeout error) when the caller cancels", async () => {
    vi.stubGlobal("fetch", respondingToSignal());
    const controller = new AbortController();

    const promise = apiFetch("/leads", { signal: controller.signal });
    controller.abort();

    await expect(promise).rejects.toMatchObject({ name: "AbortError" });
    await expect(promise).rejects.not.toMatchObject({ message: "Request timed out. Please try again." });
  });

  it("does not throw a 408/timeout status for a caller-initiated cancellation", async () => {
    vi.stubGlobal("fetch", respondingToSignal());
    const controller = new AbortController();

    const promise = apiFetch("/leads", { signal: controller.signal });
    controller.abort();

    try {
      await promise;
      throw new Error("expected apiFetch to reject");
    } catch (error: any) {
      expect(error.status).not.toBe(408);
    }
  });

  it("still produces a 'Request timed out' error after 30s when no caller signal ever fires", async () => {
    vi.stubGlobal("fetch", respondingToSignal());

    const promise = apiFetch("/leads");
    const assertion = expect(promise).rejects.toMatchObject({ message: "Request timed out. Please try again.", status: 408 });
    await vi.advanceTimersByTimeAsync(30000);
    await assertion;
  });

  it("immediately cancels the fetch if the caller's signal is already aborted before the call", async () => {
    vi.stubGlobal("fetch", respondingToSignal());
    const controller = new AbortController();
    controller.abort();

    await expect(apiFetch("/leads", { signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
  });

  // F22 fix (WP12): clearTimeout previously only ran on the SUCCESS path, so any REJECTION (a
  // real network failure, or the caller's own cancellation) left the 30s timeout timer running
  // uncleared -- harmless for the timeout's own abort (the timer already fired), but a real,
  // accumulating leak for every other failure. `finally` now clears it unconditionally.
  it("clears the 30s timeout timer on a real network-error rejection, not just on success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    await expect(apiFetch("/leads")).rejects.toThrow();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("clears the 30s timeout timer when the caller cancels via an external signal", async () => {
    vi.stubGlobal("fetch", respondingToSignal());
    const controller = new AbortController();

    const promise = apiFetch("/leads", { signal: controller.signal });
    controller.abort();

    await expect(promise).rejects.toMatchObject({ name: "AbortError" });
    expect(vi.getTimerCount()).toBe(0);
  });
});
