"use client";

import { useEffect, useRef, useState } from "react";

type Step = "credentials" | "otp" | "done";

export function AdminLoginForm() {
  const otpInput = useRef<HTMLInputElement>(null);
  const emailInput = useRef<HTMLInputElement>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [step, setStep] = useState<Step>("credentials");
  const [email, setEmail] = useState("");
  const [maskedEmail, setMaskedEmail] = useState("");
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"success" | "error">("success");
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (step === "otp") otpInput.current?.focus(); }, [step]);

  async function requestLogin(formData: FormData) {
    setBusy(true);
    setMessage("");
    const nextEmail = String(formData.get("email") || "").trim().toLowerCase();
    try {
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
    } catch { setMessageTone("error"); setMessage("Connection interrupted. Check your connection and try again."); }
    finally { setBusy(false); }
  }

  async function verifyOtp(formData: FormData) {
    setBusy(true);
    setMessage("");
    try {
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
    } catch { setMessageTone("error"); setMessage("Connection interrupted. Check your connection and try again."); }
    finally { setBusy(false); }
  }

  return (
    <div className="admin-auth-panel" aria-busy={busy}>
      {step === "credentials" ? (
        <form onSubmit={event => { event.preventDefault(); void requestLogin(new FormData(event.currentTarget)); }} className="admin-form-grid">
          <div className="field admin-span-2">
            <label htmlFor="email">Email</label>
            <input ref={emailInput} defaultValue={email} id="email" name="email" type="email" autoComplete="email" required />
          </div>
          <div className="field admin-span-2">
            <label htmlFor="password">Password</label>
            <input id="password" name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" required />
            <button className="text-button password-visibility" type="button" aria-pressed={showPassword} aria-controls="password" onClick={() => setShowPassword(value => !value)}>{showPassword ? "Hide password" : "Show password"}</button>
          </div>
          <button className="btn primary admin-span-2" type="submit" disabled={busy}>
            {busy ? "Checking..." : "Continue"}
          </button>
        </form>
      ) : null}

      {step === "otp" ? (
        <form onSubmit={event => { event.preventDefault(); void verifyOtp(new FormData(event.currentTarget)); }} className="admin-form-grid">
          <div className="field admin-span-2">
            <label htmlFor="otp">Email OTP</label>
            <input ref={otpInput} aria-describedby="otp-help" id="otp" name="otp" inputMode="numeric" minLength={4} maxLength={6} autoComplete="one-time-code" required />
            <small id="otp-help">Sent to {maskedEmail}. The code is valid for 10 minutes.</small>
          </div>
          <button className="btn primary admin-span-2" type="submit" disabled={busy}>
            {busy ? "Verifying..." : "Verify and open CMS"}
          </button>
          <button className="btn ghost admin-span-2" type="button" onClick={() => { setMessage(""); setShowPassword(false); setStep("credentials"); requestAnimationFrame(() => emailInput.current?.focus()); }} disabled={busy}>
            Use a different login
          </button>
        </form>
      ) : null}

      {step === "done" ? <p role="status" className="admin-success">Login successful. Opening CMS...</p> : null}
      {message ? <p role={messageTone === "error" ? "alert" : "status"} className={messageTone === "success" ? "admin-success" : "admin-error"}>{message}</p> : null}
    </div>
  );
}
