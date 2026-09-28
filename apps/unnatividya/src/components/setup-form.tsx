"use client";

import { useState } from "react";

export function SetupForm() {
  const [status, setStatus] = useState<"idle" | "saving" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submit(formData: FormData) {
    setStatus("saving");
    setMessage("");
    const setupToken = String(formData.get("setupToken") || "");
    const payload = Object.fromEntries(formData.entries());
    delete payload.setupToken;
    const response = await fetch("/api/admin/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-cms-setup-token": setupToken },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const error = (await response.json().catch(() => null)) as { error?: string } | null;
      setStatus("error");
      setMessage(error?.error || "Could not create admin.");
      return;
    }
    setStatus("done");
    setMessage("Admin created. You can now go to /admin/login.");
  }

  return (
    <form action={submit} className="form-grid">
      <div className="field">
        <label htmlFor="name">Name</label>
        <input id="name" name="name" required />
      </div>
      <div className="field">
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" required />
      </div>
      <div className="field">
        <label htmlFor="password">Password</label>
        <input id="password" name="password" type="password" minLength={10} required />
      </div>
      <div className="field">
        <label htmlFor="setupToken">Setup token</label>
        <input id="setupToken" name="setupToken" type="password" required />
        <p style={{ fontSize: 12, color: "#707070" }}>
          The one-use value of UNNATIVIDYA_CMS_SETUP_TOKEN, shared with you directly by whoever configured this
          deployment.
        </p>
      </div>
      <button className="btn primary" type="submit" disabled={status === "saving" || status === "done"}>
        {status === "saving" ? "Creating..." : "Create admin"}
      </button>
      {message ? <p>{message}</p> : null}
    </form>
  );
}
