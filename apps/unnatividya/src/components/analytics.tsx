"use client";

import Script from "next/script";
import { useEffect } from "react";

declare global {
  interface Window {
    dataLayer?: unknown[];
  }
}

/**
 * GTM/GA4 load via `strategy="lazyOnload"` below (deferred for performance --
 * 22_UNNATIVIDYA_PLATFORM_ENHANCEMENTS_PLAN.md §6), so their own inline script -- the one that
 * normally runs `window.dataLayer = window.dataLayer || []` -- may not have executed yet when an
 * early interaction fires. Initialize it ourselves rather than assuming GTM already did.
 */
export function trackEvent(name: string, params: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return;
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ event: name, ...params });
}

export function Analytics() {
  const gaId = process.env.NEXT_PUBLIC_GA_ID;
  const gtmId = process.env.NEXT_PUBLIC_GTM_ID;

  useEffect(() => {
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
  }, []);

  return (
    <>
      {gtmId ? (
        <Script id="gtm" strategy="lazyOnload">
          {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${gtmId}');`}
        </Script>
      ) : null}
      {gaId ? (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`} strategy="lazyOnload" />
          <Script id="ga4" strategy="lazyOnload">
            {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${gaId}', { anonymize_ip: true });`}
          </Script>
        </>
      ) : null}
    </>
  );
}
