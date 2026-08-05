"use client";

import { useState } from "react";

type Step = "credentials" | "otp" | "done";

export function AdminLoginForm() {
  const [step, setStep] = useState<Step>("credentials");
  const [email, setEmail] = useState("");
  const [maskedEmail, setMaskedEmail] = useState("");
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"success" | "error">("success");
  const [busy, setBusy] = useState(false);

  async function requestLogin(formData: FormData) {
    setBusy(true);
    setMessage("");
    const nextEmail = String(formData.get("email") || "").trim().toLowerCase();
    const response = await fetch("/api/admin/login/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: nextEmail,
        password: String(formData.get("password") || ""),
      }),
    });
    const body = await response.json().catch(() => ({}));
    setBusy(false);

    if (!response.ok) {
      setMessageTone("error");
      setMessage(body.error || "Could not start login.");
      return;
    }
    setEmail(nextEmail);
    if (body.requiresOtp) {
      setMaskedEmail(body.email || nextEmail);
      setStep("otp");
      setMessageTone("success");
      setMessage("Enter the OTP sent to your email.");
      return;
    }
    setStep("done");
    window.location.assign("/admin");
  }

  async function verifyOtp(formData: FormData) {
    setBusy(true);
    setMessage("");
    const response = await fetch("/api/admin/login/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        otp: String(formData.get("otp") || ""),
      }),
    });
    const body = await response.json().catch(() => ({}));
    setBusy(false);

    if (!response.ok) {
      setMessageTone("error");
      setMessage(body.error || "Could not verify OTP.");
      return;
    }
    setStep("done");
    window.location.assign("/admin");
  }

  return (
    <div className="admin-auth-panel">
      {step === "credentials" ? (
        <form action={requestLogin} className="admin-form-grid">
          <div className="field admin-span-2">
            <label htmlFor="email">Email</label>
            <input id="email" name="email" type="email" autoComplete="email" required />
          </div>
          <div className="field admin-span-2">
            <label htmlFor="password">Password</label>
            <input id="password" name="password" type="password" autoComplete="current-password" required />
          </div>
          <button className="btn primary admin-span-2" type="submit" disabled={busy}>
            {busy ? "Checking..." : "Continue"}
          </button>
        </form>
      ) : null}

      {step === "otp" ? (
        <form action={verifyOtp} className="admin-form-grid">
          <div className="field admin-span-2">
            <label htmlFor="otp">Email OTP</label>
            <input id="otp" name="otp" inputMode="numeric" minLength={4} maxLength={6} autoComplete="one-time-code" required />
            <small>Sent to {maskedEmail}. The code is valid for 10 minutes.</small>
          </div>
          <button className="btn primary admin-span-2" type="submit" disabled={busy}>
            {busy ? "Verifying..." : "Verify and open CMS"}
          </button>
          <button className="btn ghost admin-span-2" type="button" onClick={() => setStep("credentials")} disabled={busy}>
            Use a different login
          </button>
        </form>
      ) : null}

      {step === "done" ? <p className="admin-success">Login successful. Opening CMS...</p> : null}
      {message ? <p className={messageTone === "success" ? "admin-success" : "admin-error"}>{message}</p> : null}
    </div>
  );
}
