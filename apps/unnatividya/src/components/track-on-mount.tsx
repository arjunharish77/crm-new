"use client";

import { useEffect } from "react";
import { trackEvent } from "@/components/analytics";

// Fires once per page load for events a server component can't fire itself (trackEvent needs
// `window`). Deliberately an empty deps array -- this is a page-view-style event, meant to fire
// once on mount, not re-fire if the parent re-renders with a new params object.
export function TrackOnMount({ event, params }: { event: string; params?: Record<string, unknown> }) {
  useEffect(() => {
    trackEvent(event, params);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
