"use client";

import { useCallback, useEffect, useState } from "react";
import { trackEvent } from "@/components/analytics";

// The compare selection that follows the learner across pages (UI redesign Q6). It only chooses
// which courses open in /compare?add=…; the comparison itself stays behind the form and email
// OTP gate. Starts empty, holds at most three, and never drops a course silently.
const STORAGE_KEY = "uv_compare";
const EVENT_NAME = "uv-compare-changed";
export const COMPARE_LIMIT = 3;

function readIds(): string[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? [...new Set(parsed.filter((id): id is string => typeof id === "string" && id.length > 0))].slice(0, COMPARE_LIMIT) : [];
  } catch {
    return [];
  }
}

function writeIds(ids: string[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
    window.dispatchEvent(new CustomEvent(EVENT_NAME));
  } catch {
    // A convenience feature: fail silently if storage is unavailable.
  }
}

export function compareHref(ids: string[]) {
  return ids.length ? `/compare?add=${ids.map(encodeURIComponent).join(",")}` : "/compare";
}

export function useCompareList() {
  const [ids, setIds] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const sync = () => { setIds(readIds()); setReady(true); };
    sync();
    window.addEventListener(EVENT_NAME, sync);
    window.addEventListener("storage", sync);
    return () => { window.removeEventListener(EVENT_NAME, sync); window.removeEventListener("storage", sync); };
  }, []);

  const has = useCallback((id: string) => ids.includes(id), [ids]);
  // Returns what happened so the caller can announce a full list.
  const toggle = useCallback((id: string): "added" | "removed" | "full" => {
    const current = readIds();
    if (current.includes(id)) { writeIds(current.filter(item => item !== id)); trackEvent("compare_course_removed", { course_id: id }); return "removed"; }
    if (current.length >= COMPARE_LIMIT) return "full";
    writeIds([...current, id]);
    trackEvent("compare_course_added", { course_id: id, source: "compare_list" });
    return "added";
  }, []);
  const remove = useCallback((id: string) => writeIds(readIds().filter(item => item !== id)), []);
  const clear = useCallback(() => writeIds([]), []);
  // Sets the whole list at once (the /compare page mirroring its own selection); the page tracks
  // its own selection events, so this sends none.
  const replace = useCallback((next: string[]) => writeIds([...new Set(next)].slice(0, COMPARE_LIMIT)), []);
  return { ids, ready, count: ids.length, has, toggle, remove, clear, replace };
}
