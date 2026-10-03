"use client";

import { useState } from "react";

export function ManualCrmPushButton({ leadId }: { leadId: string }) {
  const [status, setStatus] = useState<"idle" | "previewing" | "queueing" | "done" | "error">("idle");
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState<Record<string, unknown> | null>(null);

  async function previewPayload() {
    setStatus("previewing");
    setMessage("");
    try {
    const response = await fetch("/api/admin/crm-sync/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadId }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      setStatus("error");
      setMessage(body?.error || "Could not build preview.");
      return;
    }
    setPreview(body.payload);
    setStatus("idle");
    } catch { setStatus("error"); setMessage("Connection interrupted. Try previewing again."); }
  }

  async function queuePush() {
    setStatus("queueing");
    setMessage("");
    try {
    const response = await fetch("/api/admin/crm-sync/queue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadId }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      setStatus("error");
      setMessage(body?.error || "Could not queue push.");
      return;
    }
    setPreview(body.payload);
    setStatus("done");
    setMessage("CRM delivery queued. This does not confirm delivery; refresh the lead to check its status.");
    } catch { setStatus("error"); setMessage("Connection interrupted. Refresh the lead and check delivery status before retrying; the request may have been queued."); }
  }

  return (
    <div className="manual-push-box" aria-busy={status === "previewing" || status === "queueing"}>
      <p>Preview the mapped data or queue a delivery attempt to the configured CRM.</p>
      <div className="course-actions" style={{ marginTop: 0 }}>
        <button className="btn ghost" type="button" onClick={previewPayload} disabled={status === "previewing" || status === "queueing"}>
          {status === "previewing" ? "Previewing..." : "Preview payload"}
        </button>
        <button className="btn primary" type="button" onClick={queuePush} disabled={status === "previewing" || status === "queueing"}>
          {status === "queueing" ? "Queueing..." : "Queue manual push"}
        </button>
      </div>
      {message ? <p role={status === "error" ? "alert" : "status"} className={status === "error" ? "admin-error" : "admin-success"}>{message}</p> : null}
      {preview ? <details open><summary>CRM payload preview</summary><pre className="admin-json">{JSON.stringify(preview, null, 2)}</pre></details> : null}
    </div>
  );
}
