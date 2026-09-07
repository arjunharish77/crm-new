"use client";

import { useCallback, useEffect, useRef } from "react";

// Gap checklist Module 10's "performance UX polish" item, "request cancellation on tab/filter
// changes" -- a real, confirmed race condition: no list page guarded against a stale, older
// fetch response resolving AFTER (and overwriting) a newer one, since `apiFetch` had no way for
// a caller to actually cancel an in-flight request (see the fix in `src/lib/api.ts`). Call
// `nextSignal()` right before each fetch to get a fresh `AbortSignal` -- any previous in-flight
// request from the SAME hook instance is aborted automatically, so an old response can never
// land after a newer one. Also aborts on unmount, so a fetch never tries to update state on an
// unmounted component.
export function useAbortableRequest() {
  const controllerRef = useRef<AbortController | null>(null);

  const nextSignal = useCallback(() => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    return controller.signal;
  }, []);

  useEffect(() => {
    return () => controllerRef.current?.abort();
  }, []);

  return nextSignal;
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}
