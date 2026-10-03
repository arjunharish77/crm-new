"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function SourceImportItemActions({ itemId, canApply, canReview = false, referenceOnly = false }: { itemId: string; canApply: boolean; canReview?: boolean; referenceOnly?: boolean }) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "saving" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  async function act(action: "MARK_REVIEWED" | "APPLY_TO_CATALOG" | "SKIP") {
    setStatus("saving");
    setMessage("");
    try {
      const response = await fetch(`/api/admin/source-import-items/${encodeURIComponent(itemId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "Could not update this source item. Try again.");
      setStatus("done");
      setMessage(action === "APPLY_TO_CATALOG" ? "Source notes attached. Public course and university facts have not been replaced." : body?.message || "Updated.");
      router.refresh();
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof TypeError ? "Connection interrupted. Check the item status before retrying." : error instanceof Error ? error.message : "Could not update this source item.");
    }
  }

  if (!canReview) return <p className="admin-muted">Read-only access. An editor or administrator can review this item.</p>;
  return (
    <div className="source-action-box" aria-busy={status === "saving"}>
      <div className="source-review-actions">
        <button className="btn ghost" type="button" onClick={() => act("MARK_REVIEWED")} disabled={status === "saving"}>Mark reviewed</button>
        {canApply && <button className="btn primary" type="button" onClick={() => act("APPLY_TO_CATALOG")} disabled={status === "saving"}>Attach source notes</button>}
        <button className="btn ghost" type="button" onClick={() => act("SKIP")} disabled={status === "saving"}>Skip item</button>
      </div>
      <p role={status === "error" ? "alert" : "status"} className={status === "error" ? "admin-error" : "admin-success"}>{status === "saving" ? "Saving review action…" : message}</p>
      {referenceOnly ? <p className="admin-muted">Reference-only item: source notes cannot be attached to catalog records.</p> : !canApply ? <p className="admin-muted">Only administrators can attach source notes to eligible course or university records.</p> : <p className="admin-muted">Attaching notes stores source evidence for review. Publish fact changes separately through catalog revisions.</p>}
    </div>
  );
}
