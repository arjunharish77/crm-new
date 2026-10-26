"use client";

import Script from "next/script";
import { useEffect } from "react";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

/**
 * GA4 only (owner decision, wave 3): GTM used to load as well, which loaded gtag.js a second time
 * and probably double-counted page views.
 *
 * gtag.js loads lazily for performance, so `gtag` is defined up front as the standard queue
 * (`dataLayer.push(arguments)`) with `js`/`config` queued first. Events fired before the
 * library arrives wait in the queue in order instead of being dropped.
 */
function ensureGtag(gaId: string) {
  window.dataLayer = window.dataLayer || [];
  if (typeof window.gtag !== "function") {
    window.gtag = function gtag() {
      // gtag.js reads the Arguments object itself, not an array copy.
      // eslint-disable-next-line prefer-rest-params
      window.dataLayer!.push(arguments);
    };
    // Queued first, so `config` always precedes any event (child effects run before this
    // component's own effect).
    window.gtag("js", new Date());
    window.gtag("config", gaId, { anonymize_ip: true });
  }
  return window.gtag;
}

export function trackEvent(name: string, params: Record<string, unknown> = {}) {
  const gaId = process.env.NEXT_PUBLIC_GA_ID;
  if (typeof window === "undefined" || !gaId) return;
  ensureGtag(gaId)("event", name, params);
}

export function Analytics() {
  const gaId = process.env.NEXT_PUBLIC_GA_ID;

  useEffect(() => {
    if (gaId) ensureGtag(gaId);
    // Delegated so course-card.tsx, course-explorer.tsx, etc. can be tracked via a
    // data-track-event/data-track-params attribute pair without becoming client components --
    // mirrors the existing data-open-lead pattern in lead-wizard-modal.tsx, which fires its own
    // lead_cta_click event separately for anything that opens the lead modal.
    function onClick(event: MouseEvent) {
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-track-event]") : null;
      if (!target) return;
      const name = target.getAttribute("data-track-event");
      if (!name) return;
      const paramsAttr = target.getAttribute("data-track-params");
      let params: Record<string, unknown> = {};
      if (paramsAttr) {
        try {
          params = JSON.parse(paramsAttr);
        } catch {
          // malformed data-track-params -- don't let a tracking bug break the click
        }
      }
      trackEvent(name, params);
    }

    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [gaId]);

  return gaId ? <Script src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`} strategy="lazyOnload" /> : null;
}
