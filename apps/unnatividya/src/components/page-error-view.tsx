"use client";

import { useEffect, useRef } from "react";
import "@/styles/page-recovery.css";

export default function PageErrorView({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => { heading.current?.focus(); }, []);

  return (
    <section className="container page-recovery" aria-labelledby="page-recovery-title">
      <p className="page-recovery-label">Page unavailable</p>
      <h1 id="page-recovery-title" ref={heading} tabIndex={-1}>We couldn’t load this page</h1>
      <p>A temporary problem interrupted loading. Try again, or return to the homepage to continue browsing.</p>
      <div className="page-recovery-actions">
        <button type="button" className="btn primary" onClick={reset}>Try again</button>
        {/* A full navigation also clears failed client state when leaving the error screen. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/" className="btn">Go to homepage</a>
      </div>
      <p className="page-recovery-help">If this keeps happening, please try again later.</p>
    </section>
  );
}
