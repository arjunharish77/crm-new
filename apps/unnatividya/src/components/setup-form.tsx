"use client";

import { useState } from "react";

export function SetupForm() {
  const [status, setStatus] = useState<"idle" | "saving" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submit(formData: FormData) {
    setStatus("saving");
    setMessage("");
    const response = await fetch("/api/admin/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.fromEntries(formData.entries())),
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
      <button className="btn primary" type="submit" disabled={status === "saving" || status === "done"}>
        {status === "saving" ? "Creating..." : "Create admin"}
      </button>
      {message ? <p>{message}</p> : null}
    </form>
  );
}
