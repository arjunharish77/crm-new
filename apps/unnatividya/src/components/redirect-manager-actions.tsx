"use client";

import { useState } from "react";

type RedirectRow = {
  id: string;
  is_active: boolean;
};

export function RedirectCreateForm() {
  const [message, setMessage] = useState("");
  const [tone, setTone] = useState<"success" | "error">("success");
  const [busy, setBusy] = useState(false);

  async function save(formData: FormData) {
    setBusy(true);
    setMessage("");
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
    setMessage("Redirect saved. Refreshing...");
    window.location.reload();
  }

  return (
    <form action={save} className="admin-form-grid">
      <div className="field">
        <label htmlFor="fromPath">From path</label>
        <input id="fromPath" name="fromPath" placeholder="/old-online-mba" required />
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
        <input id="reason" name="reason" placeholder="Course slug changed, campaign URL retired, typo cleanup..." />
      </div>
      <button className="btn primary admin-span-2" type="submit" disabled={busy}>
        {busy ? "Saving..." : "Save redirect"}
      </button>
      {message ? <p className={tone === "success" ? "admin-success" : "admin-error"}>{message}</p> : null}
    </form>
  );
}

export function RedirectRowActions({ redirect }: { redirect: RedirectRow }) {
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    await fetch(`/api/admin/seo/redirects/${redirect.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !redirect.is_active }),
    });
    window.location.reload();
  }

  async function remove() {
    setBusy(true);
    await fetch(`/api/admin/seo/redirects/${redirect.id}`, { method: "DELETE" });
    window.location.reload();
  }

  return (
    <div className="row-actions">
      <button type="button" className="text-button" onClick={toggle} disabled={busy}>
        {redirect.is_active ? "Disable" : "Enable"}
      </button>
      <button type="button" className="text-button danger" onClick={remove} disabled={busy}>
        Delete
      </button>
    </div>
  );
}
