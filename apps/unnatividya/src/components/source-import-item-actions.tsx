"use client";

import { useState } from "react";

export function SourceImportItemActions({ itemId, canApply }: { itemId: string; canApply: boolean }) {
  const [status, setStatus] = useState<"idle" | "saving" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  async function act(action: "MARK_REVIEWED" | "APPLY_TO_CATALOG" | "SKIP") {
    setStatus("saving");
    setMessage("");
    const response = await fetch(`/api/admin/source-import-items/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      setStatus("error");
      setMessage(body?.error || "Could not update import item.");
      return;
    }
    setStatus("done");
    setMessage(body?.message || "Updated.");
  }

  return (
    <div className="source-action-box">
      <div className="course-actions" style={{ marginTop: 0 }}>
        <button className="btn ghost" type="button" onClick={() => act("MARK_REVIEWED")} disabled={status === "saving"}>
          Reviewed
        </button>
        <button className="btn primary" type="button" onClick={() => act("APPLY_TO_CATALOG")} disabled={!canApply || status === "saving"}>
          Apply facts
        </button>
        <button className="btn ghost" type="button" onClick={() => act("SKIP")} disabled={status === "saving"}>
          Skip
        </button>
      </div>
      {message ? <p className={status === "error" ? "admin-error" : "admin-success"}>{message}</p> : null}
      {!canApply ? <p className="admin-muted">Reference-only rows cannot auto-apply to catalog.</p> : null}
    </div>
  );
}
