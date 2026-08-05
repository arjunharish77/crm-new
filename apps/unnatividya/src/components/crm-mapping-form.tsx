"use client";

import { useState } from "react";

type Mapping = {
  name: string;
  requestBodyTemplate: Record<string, unknown>;
} | null;

const defaultTemplate = {
  name: "{{lead.name}}",
  email: "{{lead.email}}",
  phone: "{{lead.phone}}",
  city: "{{lead.city}}",
  courseInterested: "{{course.name}}",
  universityInterested: "{{university.name}}",
  utmCampaign: "{{lead.utmCampaign}}",
};

export function CrmMappingForm({ tokens, activeMapping }: { tokens: string[]; activeMapping: Mapping }) {
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [message, setMessage] = useState("");
  const [templateText, setTemplateText] = useState(JSON.stringify(activeMapping?.requestBodyTemplate || defaultTemplate, null, 2));

  async function save(formData: FormData) {
    setStatus("saving");
    setMessage("");

    let requestBodyTemplate: Record<string, unknown>;
    try {
      requestBodyTemplate = JSON.parse(templateText) as Record<string, unknown>;
    } catch {
      setStatus("error");
      setMessage("JSON body template is invalid.");
      return;
    }

    const response = await fetch("/api/admin/crm-sync/mapping", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: String(formData.get("name") || "Default lead handoff"),
        requestBodyTemplate,
      }),
    });

    if (!response.ok) {
      const error = (await response.json().catch(() => null)) as { error?: string } | null;
      setStatus("error");
      setMessage(error?.error || "Could not save mapping.");
      return;
    }

    setStatus("saved");
    setMessage("Mapping saved as active version.");
  }

  return (
    <div className="admin-detail-grid">
      <article className="card admin-detail-card">
        <h2>Available merge fields</h2>
        <div className="admin-token-grid">
          {tokens.map((token) => (
            <button type="button" className="admin-token" key={token} onClick={() => navigator.clipboard?.writeText(token)}>
              {token}
            </button>
          ))}
        </div>
      </article>
      <article className="card admin-detail-card">
        <h2>JSON body template</h2>
        <form action={save} className="form-grid">
          <div className="field">
            <label htmlFor="name">Mapping name</label>
            <input id="name" name="name" defaultValue={activeMapping?.name || "Default lead handoff"} />
          </div>
          <div className="field">
            <label htmlFor="template">Request body JSON</label>
            <textarea id="template" value={templateText} onChange={(event) => setTemplateText(event.target.value)} rows={14} />
          </div>
          <button className="btn primary" type="submit" disabled={status === "saving"}>
            {status === "saving" ? "Saving..." : "Save active mapping"}
          </button>
          {message ? <p className={status === "error" ? "admin-error" : "admin-success"}>{message}</p> : null}
        </form>
      </article>
    </div>
  );
}
