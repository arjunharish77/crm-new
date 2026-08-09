"use client";

import { useCallback, useEffect, useState } from "react";
import { trackEvent } from "@/components/analytics";

const STORAGE_KEY = "uv_shortlist";
const EVENT_NAME = "uv-shortlist-changed";

function readIds(): string[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function writeIds(ids: string[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
    window.dispatchEvent(new CustomEvent(EVENT_NAME));
  } catch {
    // Shortlist is a convenience feature, not core functionality -- fail silently if storage is unavailable.
  }
}

// Mirrors the uv_lead_unlocked / uv-lead-unlocked pattern in lead-form.tsx + compare-gate.tsx:
// a localStorage key paired with a custom window event so every mounted useShortlist() instance
// (header pill, save buttons, the /shortlist page) stays in sync without a shared state library.
export function useShortlist() {
  const [ids, setIds] = useState<string[]>([]);

  useEffect(() => {
    function sync() {
      setIds(readIds());
    }
    sync();
    window.addEventListener(EVENT_NAME, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT_NAME, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const isSaved = useCallback((courseId: string) => ids.includes(courseId), [ids]);

  const toggle = useCallback((courseId: string) => {
    const current = readIds();
    const alreadySaved = current.includes(courseId);
    const next = alreadySaved ? current.filter((id) => id !== courseId) : [...current, courseId];
    writeIds(next);
    trackEvent(alreadySaved ? "shortlist_remove" : "shortlist_add", { course_id: courseId });
  }, []);

  return { ids, count: ids.length, isSaved, toggle };
}
