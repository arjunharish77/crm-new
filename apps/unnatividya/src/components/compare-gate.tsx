"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

export function CompareGate({ children, selectedCount }: { children: ReactNode; selectedCount: number }) {
  const [unlocked, setUnlocked] = useState(false);

  useEffect(() => {
    let active = true;
    async function checkUnlock() {
      try {
        const response = await fetch("/api/compare-access", { cache: "no-store" });
        const result = response.ok ? await response.json() : { unlocked: false };
        if (active) setUnlocked(result.unlocked === true);
      } catch { if (active) setUnlocked(false); }
    }
    checkUnlock();
    window.addEventListener("uv-lead-unlocked", checkUnlock);
    window.addEventListener("storage", checkUnlock);
    window.addEventListener("focus", checkUnlock);
    return () => {
      active = false;
      window.removeEventListener("uv-lead-unlocked", checkUnlock);
      window.removeEventListener("storage", checkUnlock);
      window.removeEventListener("focus", checkUnlock);
    };
  }, []);

  if (selectedCount < 2) return <p className="compare-empty">Select at least two programs above to start comparing.</p>;

  if (unlocked) return <>{children}<p className="comparison-access-note">Comparison access unlocked.</p></>;

  return <div className="comparison-access-card">
    <h3>Unlock the full comparison</h3>
    <p>Submit your contact details and course preferences, then verify your email to unlock the comparison.</p>
    <Link href="/lead?intent=compare-unlock" data-open-lead className="btn primary">Apply now</Link>
    <p className="comparison-access-note">Email verification required. Your selection stays on this page.</p>
  </div>;
}
