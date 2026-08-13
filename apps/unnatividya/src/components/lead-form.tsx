"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { trackEvent } from "@/components/analytics";
import type { LeadFormContext } from "@/components/lead-form-loader";
import { COUNTRY_CODES, DEFAULT_COUNTRY, countryFromTimezone, flagEmoji } from "@/lib/country-codes";
import { leadCourseOptions } from "@/lib/lead-course-options";

type Status = "idle" | "saving" | "otp" | "verifying" | "done" | "error";
type Step = 1 | 2 | 3;

function unlockCompare() {
  try {
    window.localStorage.setItem("uv_lead_unlocked", "1");
    window.dispatchEvent(new CustomEvent("uv-lead-unlocked"));
    trackEvent("compare_unlock");
  } catch {
    // Verification should not fail if localStorage is unavailable.
  }
}

function ProgressDots({ step }: { step: Step }) {
  return (
    <div style={{ display: "flex", gap: 6, paddingBottom: 20 }}>
      {[1, 2, 3].map((item) => (
        <div key={item} style={{ flex: 1, height: 4, borderRadius: 999, background: item <= step ? "#544CC8" : "#EAEAEA", transition: "background 200ms ease" }} />
      ))}
    </div>
  );
}

export function LeadForm({ context = {} }: { context?: LeadFormContext }) {
  const courseOptions = useMemo(() => leadCourseOptions(), []);
  const groupedByStream = useMemo(() => {
    const map = new Map<string, typeof courseOptions>();
    for (const option of courseOptions) {
      const list = map.get(option.stream) || [];
      list.push(option);
      map.set(option.stream, list);
    }
    return [...map.entries()];
  }, [courseOptions]);

  // A course is already known from where the wizard was opened (e.g. "Enquire" on a specific
  // course page) -- asking "which course?" again would be redundant, so skip straight to the
  // contact step.
  const hasCourseContext = Boolean(context.course);
  const [step, setStep] = useState<Step>(hasCourseContext ? 2 : 1);
  const [selectedLabel, setSelectedLabel] = useState("");
  const [selectedUniversityId, setSelectedUniversityId] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [leadId, setLeadId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [contact, setContact] = useState({ name: context.name || "", email: context.email || "", phone: context.phone || "" });
  const [dial, setDial] = useState(DEFAULT_COUNTRY.dial);

  useEffect(() => {
    // The device's configured timezone tracks real physical location far more reliably than the
    // browser's UI language does -- see countryFromTimezone's own comment for why.
    setDial(countryFromTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone).dial);
  }, []);

  // Fires once per mount -- covers both entry points this one shared component renders behind
  // (the modal, opened via a data-open-lead click, and the standalone /lead page, opened via a
  // direct visit with no click at all) -- so this is a broader "the form was actually presented"
  // signal than lead_cta_click, which only fires for the click-triggered case.
  useEffect(() => {
    trackEvent("wizard_open", {
      intent: context.intent || undefined,
      course_id: context.course || undefined,
      university_id: context.university || undefined,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedOption = courseOptions.find((option) => option.label === selectedLabel);
  const universityChoices = selectedOption?.universities || [];

  async function submitLead(formData: FormData) {
    setStatus("saving");
    setMessage("");
    const phoneDigits = String(formData.get("phone") || "").replace(/\D/g, "").slice(0, 14);
    const resolvedCourseId = context.course || universityChoices.find((uni) => uni.id === selectedUniversityId)?.courseId;
    const payload = {
      name: formData.get("name"),
      email: formData.get("email"),
      phone: `${dial}${phoneDigits}`,
      course: resolvedCourseId || undefined,
      university: context.university || (resolvedCourseId ? undefined : selectedUniversityId || undefined),
      intent: context.intent || "lead_wizard",
      interest: selectedLabel || context.goal || "General enquiry",
      goal: context.goal,
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
    trackEvent("lead_form_submit", { intent: context.intent || "lead_wizard" });
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
    trackEvent("otp_sent", { intent: context.intent || "lead_wizard" });
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
    trackEvent("lead_verified", { intent: context.intent || "lead_wizard" });
    trackEvent("otp_verified", { intent: context.intent || "lead_wizard" });
    setStatus("done");
    setMessage("Your email is verified. Compare access is unlocked and our counsellor can now guide you with better context.");
  }

  if (status === "done") {
    return (
      <div className="lead-step-enter" style={{ padding: "32px 24px" }}>
        <ProgressDots step={3} />
        <div style={{ textAlign: "center" }}>
          <div style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(46,125,50,0.10)", color: "#2E7D32", fontSize: 26, lineHeight: "56px", margin: "0 auto 14px" }}>
            ✓
          </div>
          <div style={{ color: "#363634", fontSize: 19, fontWeight: 700 }}>
            You&apos;re all set{contact.name.trim() ? `, ${contact.name.trim().split(" ")[0]}` : ""}
          </div>
          <div style={{ color: "#696868", fontSize: 14, marginTop: 8 }}>{message}</div>
          <div style={{ display: "flex", gap: 10, marginTop: 20, justifyContent: "center" }}>
            <Link href="/compare" className="btn primary">Open compare</Link>
            <Link href="/courses" className="btn ghost">Keep browsing courses</Link>
          </div>
        </div>
      </div>
    );
  }

  const canContinueStep2 = Boolean(contact.name.trim() && contact.email.trim() && contact.phone.trim()) && status !== "saving";

  return (
    <div style={{ marginTop: 22 }}>
      <ProgressDots step={step} />

      {step === 1 ? (
        <div className="lead-step lead-step-enter">
          <div style={{ color: "#363634", fontSize: 15, fontWeight: 700, marginBottom: 12 }}>
            Which course are you interested in?
          </div>
          {groupedByStream.map(([stream, options]) => (
            <div key={stream} style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#707070", letterSpacing: 0.4, marginBottom: 8 }}>{stream.toUpperCase()}</div>
              <div className="lead-interest-grid">
                {options.map((option) => (
                  <button
                    className={selectedLabel === option.label ? "lead-interest active" : "lead-interest"}
                    type="button"
                    key={option.label}
                    onClick={() => {
                      setSelectedLabel(option.label);
                      setSelectedUniversityId("");
                    }}
                  >
                    {option.label.replace(/^Online /, "")}
                  </button>
                ))}
              </div>
            </div>
          ))}

          {selectedOption && universityChoices.length > 1 ? (
            <div style={{ marginTop: 4, marginBottom: 4 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#363634", marginBottom: 8 }}>
                Which university? <span style={{ color: "#707070", fontWeight: 400 }}>(optional)</span>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {universityChoices.map((uni) => (
                  <button
                    key={uni.id}
                    type="button"
                    className={selectedUniversityId === uni.id ? "lead-interest active" : "lead-interest"}
                    style={{ flex: "0 0 auto", padding: "8px 16px" }}
                    onClick={() => setSelectedUniversityId((current) => (current === uni.id ? "" : uni.id))}
                  >
                    {uni.shortName}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <button className="btn primary" type="button" disabled={!selectedLabel} style={{ marginTop: 18, width: "100%" }} onClick={() => setStep(2)}>
            Continue
          </button>
        </div>
      ) : null}

      {step === 2 ? (
        <form action={submitLead} className="form-grid lead-step-enter">
          <div style={{ color: "#363634", fontSize: 15, fontWeight: 700 }}>
            Tell us about yourself
          </div>
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
            <div style={{ display: "flex", gap: 8 }}>
              <select
                aria-label="Country code"
                value={dial}
                onChange={(event) => setDial(event.target.value)}
                style={{ width: 110, flexShrink: 0, border: "1px solid var(--uv-border)", borderRadius: "var(--uv-radius-control)", background: "#fff", padding: "0 6px", fontSize: 13 }}
              >
                {COUNTRY_CODES.map((country) => (
                  <option key={country.iso2} value={country.dial}>
                    {flagEmoji(country.iso2)} {country.dial}
                  </option>
                ))}
              </select>
              <input
                id="phone"
                name="phone"
                inputMode="tel"
                minLength={dial === "+91" ? 10 : 4}
                maxLength={dial === "+91" ? 10 : 14}
                required
                style={{ flex: 1 }}
                value={contact.phone}
                onChange={(event) => setContact((current) => ({ ...current, phone: event.target.value.replace(/\D/g, "").slice(0, 14) }))}
              />
            </div>
          </div>
          <div className="lead-form-actions">
            {hasCourseContext ? null : (
              <button className="btn ghost" type="button" onClick={() => setStep(1)}>
                Back
              </button>
            )}
            <button
              className="btn primary"
              type="submit"
              disabled={!canContinueStep2}
              style={canContinueStep2 ? undefined : { background: "#D8D7D6", borderColor: "#D8D7D6", cursor: "not-allowed" }}
            >
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
          <div className="lead-form-actions">
            <button
              className="btn ghost"
              type="button"
              onClick={() => {
                setStep(2);
                setStatus("idle");
                setMessage("");
              }}
            >
              Back
            </button>
            <button className="btn primary" type="submit" disabled={status === "verifying"}>
              {status === "verifying" ? "Verifying..." : "Verify email"}
            </button>
          </div>
        </form>
      ) : null}

      {message ? <p style={{ color: status === "error" ? "#b00020" : "#707070", fontSize: 13 }}>{message}</p> : null}
      <div style={{ color: "#707070", fontSize: 12, marginTop: 12 }}>
        By continuing you agree to receive counselling calls and WhatsApp updates. We never share your number with third parties.
      </div>
    </div>
  );
}
