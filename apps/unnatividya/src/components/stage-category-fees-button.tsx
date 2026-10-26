"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function StageCategoryFeesButton({ courseIds }: { courseIds: string[] }) {
  const router = useRouter();
  const [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function stage() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/category-fee-proposals", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ courseIds, reviewedSources: reviewed }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Fee proposals could not be staged.");
      setMessage(`${result.staged} fee proposals submitted for CMS review. Check the exact revisions above before publishing.`);
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Fee proposals could not be staged."); }
    finally { setBusy(false); }
  }
  return <div className="bulk-publish-action">
    <label className="checkbox-row"><input type="checkbox" checked={reviewed} onChange={event => setReviewed(event.target.checked)} disabled={busy} /> I checked the linked 2026–27 university fee sources, current session and fee exclusions.</label>
    <button type="button" className="btn secondary" disabled={!reviewed || busy || !courseIds.length} onClick={() => void stage()}>{busy ? "Submitting…" : `Submit ${courseIds.length} fee proposal${courseIds.length === 1 ? "" : "s"} for review`}</button>
    {message ? <p role="status">{message}</p> : null}
  </div>;
}
