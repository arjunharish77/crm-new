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
  const [tokenQuery, setTokenQuery] = useState("");
  const [copyMessage, setCopyMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [message, setMessage] = useState("");
  const [templateText, setTemplateText] = useState(JSON.stringify(activeMapping?.requestBodyTemplate || defaultTemplate, null, 2));

  async function copyToken(token: string) {
    try {
      if (!navigator.clipboard) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(token);
      setCopyMessage(`Copied ${token}. Paste it into a JSON text value.`);
    } catch { setCopyMessage(`Could not copy ${token}. Select the token text and copy it manually.`); }
  }
  const visibleTokens = tokens.filter(token => token.toLowerCase().includes(tokenQuery.trim().toLowerCase()));
  async function save(formData: FormData) {
    setStatus("saving");
    setMessage("");

    let requestBodyTemplate: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(templateText);
      if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") throw new Error("Object required");
      requestBodyTemplate = parsed as Record<string, unknown>;
    } catch {
      setStatus("error");
      setMessage("Enter a valid JSON object for the request body, not an array or a single value.");
      return;
    }

    try {
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
    setMessage("Mapping saved as the active version. Preview a lead’s payload before queueing delivery.");
    } catch { setStatus("error"); setMessage("Connection interrupted. Your edits are preserved; check the active mapping before retrying."); }
  }

  return (
    <div className="admin-detail-grid crm-mapping-layout">
      <article className="card admin-detail-card">
        <h2>JSON body template</h2>
        <p>Saving replaces the active mapping for future delivery attempts. It does not send a lead or test the CRM connection.</p>
        <form onSubmit={event => { event.preventDefault(); void save(new FormData(event.currentTarget)); }} className="form-grid" aria-busy={status === "saving"}>
          <div className="field">
            <label htmlFor="name">Mapping name</label>
            <input id="name" name="name" required defaultValue={activeMapping?.name || "Default lead handoff"} />
          </div>
          <div className="field">
            <label htmlFor="template">Request body JSON</label>
            <textarea id="template" spellCheck={false} value={templateText} onChange={(event) => setTemplateText(event.target.value)} rows={14} />
          </div>
          <button className="btn primary" type="submit" disabled={status === "saving"}>
            {status === "saving" ? "Saving..." : "Save active mapping"}
          </button>
          {message ? <p role={status === "error" ? "alert" : "status"} className={status === "error" ? "admin-error" : "admin-success"}>{message}</p> : null}
        </form>
      </article>
      <article className="card admin-detail-card">
        <h2>Available merge fields</h2>
        <label htmlFor="token-search">Find a merge field</label>
        <input id="token-search" type="search" value={tokenQuery} onChange={event => setTokenQuery(event.target.value)} placeholder="Try email, course or consent" />
        <p>{visibleTokens.length} of {tokens.length} fields. Copy a token, then paste it inside a JSON string.</p>
        <p role="status">{copyMessage}</p>
        <div className="admin-token-grid">
          {visibleTokens.map((token) => (
            <button type="button" className="admin-token" key={token} onClick={() => void copyToken(token)}>
              {token}
            </button>
          ))}
        </div>
        {!visibleTokens.length && <p>No matching fields. Try another search.</p>}
      </article>
    </div>
  );
}
