"use client";

import { useState } from "react";
import Link from "next/link";

export function SetupForm() {
  const [showPassword, setShowPassword] = useState(false);
  const [status, setStatus] = useState<"idle" | "saving" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submit(formData: FormData) {
    setStatus("saving");
    setMessage("");
    const setupToken = String(formData.get("setupToken") || "");
    const payload = Object.fromEntries(formData.entries());
    delete payload.setupToken;
    try {
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
    setMessage("Admin account created. Sign in to open the CMS.");
    } catch { setStatus("error"); setMessage("Connection interrupted. Your entries are preserved. Try signing in first to check whether the account was created before retrying setup."); }
  }

  return (
    <form onSubmit={event => { event.preventDefault(); void submit(new FormData(event.currentTarget)); }} className="form-grid admin-setup-form" aria-busy={status === "saving"}>
      <div className="field">
        <label htmlFor="name">Name</label>
        <input id="name" name="name" autoComplete="name" required />
      </div>
      <div className="field">
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div className="field">
        <label htmlFor="password">Password</label>
        <input id="password" name="password" type={showPassword ? "text" : "password"} autoComplete="new-password" aria-describedby="setup-password-help" minLength={10} required />
        <small id="setup-password-help">Use at least 10 characters.</small>
        <button type="button" className="text-button" aria-pressed={showPassword} aria-controls="password" onClick={() => setShowPassword(value => !value)}>{showPassword ? "Hide password" : "Show password"}</button>
      </div>
      <div className="field">
        <label htmlFor="setupToken">Setup token</label>
        <input id="setupToken" name="setupToken" type="password" autoComplete="off" aria-describedby="setup-token-help" required />
        <small id="setup-token-help">Get this private setup token from the person who configured this website. It is different from your new account password.</small>
      </div>
      <button className="btn primary" type="submit" disabled={status === "saving" || status === "done"}>
        {status === "saving" ? "Creating..." : "Create admin"}
      </button>
      {message ? <p role={status === "error" ? "alert" : "status"} className={status === "error" ? "admin-error" : "admin-success"}>{message}</p> : null}
      <Link className="btn ghost" href="/admin/login">Go to sign in</Link>
    </form>
  );
}
