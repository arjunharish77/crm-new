"use client";

import { useSyncExternalStore } from "react";
import { getDefaultDisplaySettings, getDisplaySettingsSnapshot, subscribeDisplaySettings } from "@/lib/date-format";

// Re-renders the caller when the workspace display settings (time zone, language, currency)
// change. See the store notes in lib/date-format.ts.
export function useDisplaySettings() {
    return useSyncExternalStore(subscribeDisplaySettings, getDisplaySettingsSnapshot, getDefaultDisplaySettings);
}
