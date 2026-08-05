"use client";

import { useState } from "react";
import type { LeadFormContext } from "@/components/lead-form-loader";

type Status = "idle" | "saving" | "otp" | "verifying" | "done" | "error";
type Step = 1 | 2 | 3;

const interests = [
  "Online MBA",
  "Online BBA",
  "Online BCA",
  "Online MCA",
  "Online B.Com / M.Com",
  "Online BA / MA",
];

function unlockCompare() {
  try {
    window.localStorage.setItem("uv_lead_unlocked", "1");
    window.dispatchEvent(new CustomEvent("uv-lead-unlocked"));
  } catch {
    // Verification should not fail if localStorage is unavailable.
  }
}

export function LeadForm({ context = {} }: { context?: LeadFormContext }) {
  const [step, setStep] = useState<Step>(1);
  const [interest, setInterest] = useState(interests[0]);
  const [status, setStatus] = useState<Status>("idle");
  const [leadId, setLeadId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [contact, setContact] = useState({ name: "", email: "", phone: "" });

  async function submitLead(formData: FormData) {
    setStatus("saving");
    setMessage("");
    const payload = {
      ...Object.fromEntries(formData.entries()),
      ...context,
      interest,
      intent: context.intent || "lead_wizard",
      phone: String(formData.get("phone") || "").replace(/\D/g, "").slice(0, 10),
    };
    const response = await fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      setStatus("error");
      setMessage("Could not save your enquiry. Please try again.");
      return;
    }
    const data = (await response.json()) as { leadId: string };
    setLeadId(data.leadId);
    const otpResponse = await fetch("/api/otp/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadId: data.leadId }),
    });
    if (!otpResponse.ok) {
      setStatus("error");
      setMessage("Your enquiry is saved, but we could not send the email OTP. Please try again.");
      return;
    }
    setStep(3);
    setStatus("otp");
    setMessage("We saved your enquiry and sent an email OTP.");
  }

  async function verifyOtp(formData: FormData) {
    setStatus("verifying");
    const response = await fetch("/api/otp/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadId, otp: formData.get("otp") }),
    });
    if (!response.ok) {
      setStatus("otp");
      setMessage("OTP could not be verified. Please try again.");
      return;
    }
    unlockCompare();
    setStatus("done");
    setMessage("Your email is verified. Compare access is unlocked and our counsellor can now guide you with better context.");
  }

  if (status === "done") {
    return (
      <div className="lead-step-enter" style={{ padding: "32px 24px", textAlign: "center" }}>
        <div style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(46,125,50,0.10)", color: "#2E7D32", fontSize: 26, lineHeight: "56px", margin: "0 auto 14px" }}>
          ✓
        </div>
        <div style={{ color: "#363634", fontSize: 19, fontWeight: 700 }}>
          You&apos;re all set{contact.name.trim() ? `, ${contact.name.trim().split(" ")[0]}` : ""}
        </div>
        <div style={{ color: "#696868", fontSize: 14, marginTop: 8 }}>{message}</div>
      </div>
    );
  }

  return (
    <div style={{ marginTop: 22 }}>
      <div style={{ display: "flex", gap: 6, paddingBottom: 20 }}>
        {[1, 2, 3].map((item) => (
          <div key={item} style={{ flex: 1, height: 4, borderRadius: 999, background: item <= step ? "#544CC8" : "#EAEAEA", transition: "background 200ms ease" }} />
        ))}
      </div>

      {step === 1 ? (
        <div className="lead-step lead-step-enter">
          <div style={{ color: "#363634", fontSize: 15, fontWeight: 700, marginBottom: 12 }}>
            What do you want to study?
          </div>
          <div className="lead-interest-grid">
            {interests.map((item) => (
              <button className={interest === item ? "lead-interest active" : "lead-interest"} key={item} type="button" onClick={() => setInterest(item)}>
                {item}
              </button>
            ))}
          </div>
          <button className="btn primary" type="button" style={{ marginTop: 18, width: "100%" }} onClick={() => setStep(2)}>
            Continue
          </button>
        </div>
      ) : null}

      {step === 2 ? (
        <form action={submitLead} className="form-grid lead-step-enter">
          <div style={{ color: "#363634", fontSize: 15, fontWeight: 700 }}>
            Tell us about yourself
          </div>
          <input type="hidden" name="interest" value={interest} />
          <div className="field">
            <label htmlFor="name">Name</label>
            <input id="name" name="name" required value={contact.name} onChange={(event) => setContact((current) => ({ ...current, name: event.target.value }))} />
          </div>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" name="email" type="email" required value={contact.email} onChange={(event) => setContact((current) => ({ ...current, email: event.target.value }))} />
          </div>
          <div className="field">
            <label htmlFor="phone">Mobile number</label>
            <input
              id="phone"
              name="phone"
              inputMode="tel"
              minLength={10}
              maxLength={10}
              required
              value={contact.phone}
              onChange={(event) => setContact((current) => ({ ...current, phone: event.target.value.replace(/\D/g, "").slice(0, 10) }))}
            />
          </div>
          <div className="lead-form-actions">
            <button className="btn ghost" type="button" onClick={() => setStep(1)}>
              Back
            </button>
            <button className="btn primary" type="submit" disabled={status === "saving"}>
              {status === "saving" ? "Saving..." : "Save and send OTP"}
            </button>
          </div>
        </form>
      ) : null}

      {step === 3 && (status === "otp" || status === "verifying") ? (
        <form action={verifyOtp} className="form-grid lead-step-enter" style={{ marginTop: 20 }}>
          <div style={{ color: "#2E7D32", background: "rgba(46,125,50,0.10)", padding: "8px 12px", borderRadius: 4, fontSize: 13 }}>
            Email OTP sent. Verify now to mark this lead as verified.
          </div>
          <div className="field">
            <label htmlFor="otp">Email OTP</label>
            <input id="otp" name="otp" inputMode="numeric" minLength={4} maxLength={6} required style={{ fontSize: 18, letterSpacing: 8 }} />
          </div>
          <button className="btn primary" type="submit" disabled={status === "verifying"}>
            {status === "verifying" ? "Verifying..." : "Verify email"}
          </button>
        </form>
      ) : null}

      {message ? <p style={{ color: status === "error" ? "#b00020" : "#707070", fontSize: 13 }}>{message}</p> : null}
      <div style={{ color: "#707070", fontSize: 12, marginTop: 12 }}>
        By continuing you agree to receive counselling calls and WhatsApp updates. We never share your number with third parties.
      </div>
    </div>
  );
}
