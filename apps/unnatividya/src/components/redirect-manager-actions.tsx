"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type RedirectRow = {
  id: string;
  is_active: boolean;
};

export function RedirectCreateForm() {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [tone, setTone] = useState<"success" | "error">("success");
  const [busy, setBusy] = useState(false);

  async function save(formData: FormData) {
    setBusy(true);
    setMessage("");
    try {
    const response = await fetch("/api/admin/seo/redirects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fromPath: String(formData.get("fromPath") || ""),
        toPath: String(formData.get("toPath") || ""),
        statusCode: Number(formData.get("statusCode") || 301),
        reason: String(formData.get("reason") || ""),
        isActive: formData.get("isActive") === "on",
      }),
    });
    const body = await response.json().catch(() => ({}));
    setBusy(false);

    if (!response.ok) {
      setTone("error");
      setMessage(body.error || "Could not save redirect.");
      return;
    }
    setTone("success");
    setMessage("Redirect saved.");
    router.refresh();
    } catch {
      setTone("error");
      setMessage("Connection interrupted. Check the redirect list before retrying.");
    } finally { setBusy(false); }
  }

  return (
    <form onSubmit={(event) => { event.preventDefault(); void save(new FormData(event.currentTarget)); }} className="admin-form-grid" aria-busy={busy}>
      <p className="admin-span-2" id="redirect-help">Enter the old path and destination. Saving an existing source path replaces its redirect. An active redirect takes effect immediately.</p>
      <div className="field">
        <label htmlFor="fromPath">From path</label>
        <input id="fromPath" name="fromPath" placeholder="/old-online-mba" aria-describedby="redirect-help" required />
      </div>
      <div className="field">
        <label htmlFor="toPath">To path</label>
        <input id="toPath" name="toPath" placeholder="/courses/online-mba-amity-online" required />
      </div>
      <div className="field">
        <label htmlFor="statusCode">Status</label>
        <select id="statusCode" name="statusCode" defaultValue="301">
          <option value="301">301 permanent</option>
          <option value="302">302 temporary</option>
          <option value="307">307 temporary</option>
          <option value="308">308 permanent</option>
        </select>
      </div>
      <label className="admin-check">
        <input type="checkbox" name="isActive" defaultChecked />
        <span><strong>Active</strong><small>Start redirecting immediately.</small></span>
      </label>
      <div className="field admin-span-2">
        <label htmlFor="reason">Reason</label>
        <input id="reason" name="reason" maxLength={500} placeholder="Course slug changed, campaign URL retired, typo cleanup..." />
      </div>
      <button className="btn primary admin-span-2" type="submit" disabled={busy}>
        {busy ? "Saving..." : "Save redirect"}
      </button>
      {message ? <p role={tone === "error" ? "alert" : "status"} className={tone === "success" ? "admin-success" : "admin-error"}>{message}</p> : null}
    </form>
  );
}

export function RedirectRowActions({ redirect }: { redirect: RedirectRow }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  async function change(method: "PATCH" | "DELETE") {
    setBusy(true); setMessage(""); setFailed(false);
    try {
      const response = await fetch(`/api/admin/seo/redirects/${redirect.id}`, {
        method,
        ...(method === "PATCH" ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isActive: !redirect.is_active }) } : {}),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) { setFailed(true); setMessage(body?.error || "Could not update redirect."); return; }
      setMessage(method === "DELETE" ? "Redirect deleted." : "Redirect updated.");
      router.refresh();
    } catch { setFailed(true); setMessage("Connection interrupted. Refresh the list to check the redirect before retrying."); }
    finally { setBusy(false); }
  }
  return <div className="redirect-row-controls" aria-busy={busy}>
    <div className="row-actions">
      <button type="button" className="text-button" onClick={() => change("PATCH")} disabled={busy}>{redirect.is_active ? "Disable" : "Enable"}</button>
      <button type="button" className="text-button danger" onClick={() => change("DELETE")} disabled={busy}>Delete</button>
    </div>
    {message && <p role={failed ? "alert" : "status"} className={failed ? "admin-error" : "admin-success"}>{message}</p>}
  </div>;
}
