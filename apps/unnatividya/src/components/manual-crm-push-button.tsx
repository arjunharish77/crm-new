"use client";

import { useState } from "react";

export function ManualCrmPushButton({ leadId }: { leadId: string }) {
  const [status, setStatus] = useState<"idle" | "previewing" | "queueing" | "done" | "error">("idle");
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState<Record<string, unknown> | null>(null);

  async function previewPayload() {
    setStatus("previewing");
    setMessage("");
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
  }

  async function queuePush() {
    setStatus("queueing");
    setMessage("");
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
    setMessage(`Queued CRM push attempt ${body.attemptId}.`);
  }

  return (
    <div className="manual-push-box">
      <div className="course-actions" style={{ marginTop: 0 }}>
        <button className="btn ghost" type="button" onClick={previewPayload} disabled={status === "previewing" || status === "queueing"}>
          {status === "previewing" ? "Previewing..." : "Preview payload"}
        </button>
        <button className="btn primary" type="button" onClick={queuePush} disabled={status === "previewing" || status === "queueing"}>
          {status === "queueing" ? "Queueing..." : "Queue manual push"}
        </button>
      </div>
      {message ? <p className={status === "error" ? "admin-error" : "admin-success"}>{message}</p> : null}
      {preview ? <pre className="admin-json">{JSON.stringify(preview, null, 2)}</pre> : null}
    </div>
  );
}
