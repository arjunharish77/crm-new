"use client";
import { useCatalog } from "@/components/catalog-provider";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { trackEvent } from "@/components/analytics";
import type { LeadFormContext } from "@/components/lead-form-loader";
import { COUNTRY_CODES, DEFAULT_COUNTRY, countryFromTimezone, flagEmoji } from "@/lib/country-codes";
import { leadCourseOptions } from "@/lib/lead-course-options";

import { CONTACT_CONSENT_TEXT } from "@/lib/lead-consent";

export function LeadForm({ context = {} }: { context?: LeadFormContext }) {
  const catalog = useCatalog();
  const { courses } = catalog;
  const options = useMemo(() => leadCourseOptions(catalog), [catalog]);
  const contextualCourse = courses.find(c => c.id === context.course || c.slug === context.course);
  const contextualOption = options.find(o => o.universities.some(u => u.courseId === contextualCourse?.id) || o.label.replace(/^Online /i, "").toLowerCase().replace(/[^a-z0-9]+/g, "-") === context.course);
  const [step, setStep] = useState(1);
  const [contact, setContact] = useState({ name: "", email: "", phone: "" });
  const [dial, setDial] = useState(DEFAULT_COUNTRY.dial);
  const [consent, setConsent] = useState(false);
  const [course, setCourse] = useState(contextualOption?.label || "");
  const [university, setUniversity] = useState(contextualCourse?.universityId || context.university || "");
  const [leadId, setLeadId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [done, setDone] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const session = useRef<{ key: string; token: string } | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const [returnTo, setReturnTo] = useState("/compare");
  const choices = options.find(o => o.label === course)?.universities || [];

  useEffect(() => {
    setDial(countryFromTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone).dial);
    if (window.location.pathname === "/compare") setReturnTo(window.location.pathname + window.location.search);
    trackEvent("wizard_open", { intent: context.intent });
  }, [context.intent]);
  useEffect(() => { heading.current?.focus(); }, [step, done]);
  useEffect(() => {
    if (!cooldown) return;
    const timer = setTimeout(() => setCooldown(cooldown - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  function getSession() {
    if (!session.current) session.current = {
      key: crypto.randomUUID(),
      token: Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, "0")).join(""),
    };
    return session.current;
  }
  async function api(url: string, method: string, body: unknown) {
    const response = await fetch(url, { method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${getSession().token}` }, body: JSON.stringify(body) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.ok === false) throw new Error(result.error || "We could not complete this step. Please try again.");
    return result;
  }
  async function run(work: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError(""); setNotice("");
    try { await work(); } catch (e) { setError(e instanceof Error ? e.message : "Connection failed. Please try again."); }
    finally { busyRef.current = false; setBusy(false); }
  }
  async function saveContact() {
    await run(async () => {
      const body = { ...contact, phone: `${dial}${contact.phone}`, consent, submissionKey: getSession().key, intent: context.intent || "apply_now" };
      const result = await api(leadId ? `/api/leads/${leadId}` : "/api/leads", leadId ? "PATCH" : "POST", leadId ? { contact: body } : body);
      setLeadId(result.leadId || leadId);
      window.dispatchEvent(new Event("uv-lead-unlocked"));
      trackEvent("lead_contact_saved", { intent: context.intent });
      setStep(2); setNotice("Your details are saved. Our team may follow up even if you leave before finishing.");
    });
  }
  async function sendOtp() {
    await api("/api/otp/send", "POST", { leadId });
    setCooldown(60); setNotice(`A verification code was sent to ${contact.email}.`);
    trackEvent("otp_sent", { intent: context.intent });
  }
  async function savePreferences() {
    await run(async () => {
      await api(`/api/leads/${leadId}`, "PATCH", { coursePreference: course, university });
      trackEvent("lead_preferences_saved", { intent: context.intent });
      setStep(3);
      await sendOtp();
    });
  }

  if (done) return <div className="form-grid lead-step-enter">
    <Image className="state-illustration state-illustration-confirmation" src="/states/application-enquiry-received.webp" alt="" width={800} height={600} sizes="160px" />
    <h2 ref={heading} tabIndex={-1}>Your details are received</h2>
    <p>Your email is verified and comparison access is unlocked. Our team will follow up about your enquiry. This is not confirmation of university admission.</p>
    <Link href={returnTo} className="btn primary" onClick={() => window.dispatchEvent(new Event("uv-close-lead"))}>Return to comparison</Link>
    <Link href="/courses" className="btn ghost" onClick={() => window.dispatchEvent(new Event("uv-close-lead"))}>Browse courses</Link>
  </div>;

  return <div className="form-grid">
    <p className="lead-progress" aria-label={`Step ${step} of 3`}>{step === 1 ? "1. Your details" : step === 2 ? "2. Course preferences" : "3. Verify email"}</p>
    <h2 ref={heading} tabIndex={-1} className="lead-step-title">{step === 1 ? "Start your application enquiry" : step === 2 ? "Choose your preferences" : "Verify your email"}</h2>
    {step === 1 && <form className="form-grid lead-step-enter" onSubmit={e => { e.preventDefault(); void saveContact(); }}>
      <div className="field"><label htmlFor="uv-name">Name</label><input id="uv-name" autoComplete="name" minLength={2} maxLength={150} required value={contact.name} onChange={e => setContact({ ...contact, name: e.target.value })} /></div>
      <div className="field"><label htmlFor="uv-email">Email</label><input id="uv-email" type="email" autoComplete="email" maxLength={254} required value={contact.email} onChange={e => setContact({ ...contact, email: e.target.value })} /></div>
      <div className="field"><label htmlFor="uv-phone">Phone</label><div className="lead-phone-row">
        <select aria-label="Country code" autoComplete="tel-country-code" value={dial} onChange={e => setDial(e.target.value)}>{COUNTRY_CODES.map(c => <option key={c.iso2} value={c.dial}>{flagEmoji(c.iso2)} {c.dial} {c.iso2}</option>)}</select>
        <input id="uv-phone" type="tel" autoComplete="tel-national" required minLength={dial === "+91" ? 10 : 4} maxLength={15 - dial.length + 1} pattern={dial === "+91" ? "[0-9]{10}" : "[0-9]{4,14}"} value={contact.phone} onChange={e => setContact({ ...contact, phone: e.target.value.replace(/\D/g, "") })} />
      </div></div>
      <label className="lead-consent"><input type="checkbox" required checked={consent} onChange={e => setConsent(e.target.checked)} /><span>{CONTACT_CONSENT_TEXT}</span></label>
      <p className="lead-help">Your details will be saved when you continue. <Link href="/privacy">Privacy policy</Link></p>
      <button className="btn primary" disabled={busy || !consent}>{busy ? "Saving…" : "Continue"}</button>
    </form>}
    {step === 2 && <form className="form-grid lead-step-enter" onSubmit={e => { e.preventDefault(); void savePreferences(); }}>
      <div className="field"><label htmlFor="uv-course">Course</label><select id="uv-course" required value={course} onChange={e => { setCourse(e.target.value); setUniversity(""); }}><option value="">Select a course</option>{options.map(o => <option key={o.label} value={o.label}>{o.label}</option>)}</select></div>
      <div className="field"><label htmlFor="uv-university">University (optional)</label><select id="uv-university" value={choices.some(u => u.id === university) ? university : ""} onChange={e => setUniversity(e.target.value)}><option value="">No preference</option>{choices.map(u => <option key={u.id} value={u.id}>{u.shortName === "MUJ" ? "Manipal University Jaipur" : u.shortName === "SMU" ? "Sikkim Manipal University" : "Amity Online"}</option>)}</select></div>
      <div className="lead-form-actions"><button type="button" className="btn ghost" disabled={busy} onClick={() => setStep(1)}>Back</button><button className="btn primary" disabled={busy || !course}>{busy ? "Saving…" : "Save and verify email"}</button></div>
    </form>}
    {step === 3 && <form className="form-grid lead-step-enter" onSubmit={e => { e.preventDefault(); const otp = new FormData(e.currentTarget).get("otp"); void run(async () => { await api("/api/otp/verify", "POST", { leadId, otp }); window.dispatchEvent(new Event("uv-lead-unlocked")); trackEvent("otp_verified", { intent: context.intent }); setDone(true); }); }}>
      <p className="lead-help">Enter the code sent to {contact.email}. Your enquiry is already saved.</p>
      <div className="field"><label htmlFor="uv-otp">Email verification code</label><input id="uv-otp" name="otp" autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{4,6}" required minLength={4} maxLength={6} /></div>
      <button className="btn primary" disabled={busy}>{busy ? "Please wait…" : "Verify email"}</button>
      <button className="btn ghost" type="button" disabled={busy || cooldown > 0} onClick={() => void run(sendOtp)}>{cooldown ? `Resend in ${cooldown}s` : "Resend code"}</button>
      <button className="btn ghost" type="button" disabled={busy} onClick={() => { setStep(1); setError(""); }}>Edit contact details</button>
      <button className="btn ghost" type="button" disabled={busy} onClick={() => { setStep(2); setError(""); }}>Edit preferences</button>
    </form>}
    {error && <p role="alert" className="lead-error">{error}</p>}
    {notice && <p role="status" className="lead-help">{notice}</p>}
  </div>;
}
