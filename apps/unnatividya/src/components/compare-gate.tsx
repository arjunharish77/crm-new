"use client";

import Link from "next/link";
import Image from "next/image";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Lock } from "lucide-react";
import { universityMedia } from "@/data/media";

// Server-checked compare access (form + email OTP). Re-checks after the lead flow unlocks, when
// another tab changes storage, and when the window regains focus.
export function useCompareAccess() {
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
  return unlocked;
}

type PreviewColumn = { id: string; universityId: string; name: string; universityName: string };

// The interactive comparison stays behind the form and email OTP (owner rule C3). The locked
// state shows only a decorative skeleton (program names, feature labels and grey bars): no
// program values are ever rendered before access is confirmed, so nothing can be read, selected
// or focused behind the lock card.
export function CompareGate({ children, selectedCount, unlocked, preview }: { children: ReactNode; selectedCount: number; unlocked: boolean; preview: { columns: PreviewColumn[]; labels: string[] } }) {
  if (selectedCount < 2) return <div className="uv-cmp-need-two"><p>Select at least two programs above to start comparing.</p></div>;

  if (unlocked) return <>{children}<p className="uv-cmp-access-note">Comparison access unlocked.</p></>;

  return <div className="uv-cmp-locked">
    <div className="uv-cmp-skeleton" aria-hidden="true" inert data-cols={preview.columns.length}>
      <div className="uv-cmp-skeleton-row is-head">
        <span className="uv-cmp-skeleton-label">Features</span>
        {preview.columns.map(column => <span key={column.id} className="uv-cmp-skeleton-col">
          <span className="uv-cmp-logo"><Image src={universityMedia[column.universityId]?.logo || "/brand/favicon-32x32.png"} alt="" width={30} height={30} /></span>
          <span><strong>{column.universityName}</strong><small>{column.name}</small></span>
        </span>)}
      </div>
      {preview.labels.map(label => <div key={label} className="uv-cmp-skeleton-row">
        <span className="uv-cmp-skeleton-label">{label}</span>
        {preview.columns.map(column => <span key={column.id}><i /></span>)}
      </div>)}
    </div>
    <div className="uv-cmp-lock-card">
      <span className="uv-cmp-lock-icon" aria-hidden="true"><Lock size={26} /></span>
      <h3>Unlock the full comparison</h3>
      <p>Submit your contact details and course preferences, then verify your email to unlock the comparison.</p>
      <ol className="uv-cmp-lock-steps" aria-label="How to unlock">
        <li><span aria-hidden="true">1</span>Your contact details</li>
        <li><span aria-hidden="true">2</span>Course preference</li>
        <li><span aria-hidden="true">3</span>Email verification code</li>
      </ol>
      <Link href="/lead?intent=compare-unlock" rel="nofollow" data-open-lead className="btn primary large">Apply now</Link>
      <p className="uv-cmp-access-note">Email verification required. Your selection stays on this page.</p>
    </div>
  </div>;
}
