"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

export function CompareGate({ children, selectedCount }: { children: ReactNode; selectedCount: number }) {
  const [unlocked, setUnlocked] = useState(false);

  useEffect(() => {
    function checkUnlock() {
      try {
        setUnlocked(window.localStorage.getItem("uv_lead_unlocked") === "1");
      } catch {
        setUnlocked(false);
      }
    }
    checkUnlock();
    window.addEventListener("uv-lead-unlocked", checkUnlock);
    window.addEventListener("storage", checkUnlock);
    return () => {
      window.removeEventListener("uv-lead-unlocked", checkUnlock);
      window.removeEventListener("storage", checkUnlock);
    };
  }, []);

  if (!selectedCount) {
    return (
      <div className="compare-empty">
        Select at least one program above to start comparing.
      </div>
    );
  }

  return (
    <div style={{ position: "relative" }}>
      <div style={{ filter: unlocked ? "none" : "blur(5px)" }}>{children}</div>
      {!unlocked ? (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(247,248,249,0.55)" }}>
          <div style={{ background: "#fff", border: "1px solid #CFDAE6", borderRadius: 8, padding: 28, boxShadow: "var(--uv-shadow-lg)", textAlign: "center", maxWidth: 380 }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: "#363634" }}>Unlock the full comparison</div>
            <div style={{ fontSize: 13, color: "#696868", margin: "8px 0 16px", lineHeight: 1.5 }}>
              Verify your number once and every comparison on UnnatiVidya unlocks — plus a counsellor&rsquo;s honest take, free.
            </div>
            <Link href="/lead?intent=compare-unlock" data-open-lead className="btn primary" style={{ width: "100%", height: 44, fontSize: 15 }}>
              Unlock with OTP
            </Link>
          </div>
        </div>
      ) : (
        <div style={{ marginTop: 14, fontSize: 13, color: "#2E7D32", background: "rgba(46,125,50,0.10)", borderRadius: 4, padding: "10px 14px", display: "inline-block" }}>
          Compare access unlocked · a counsellor will call you to walk you through this table
        </div>
      )}
    </div>
  );
}
