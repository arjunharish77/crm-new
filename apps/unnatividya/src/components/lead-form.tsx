"use client";
import { useCatalog } from "@/components/catalog-provider";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState, type FocusEvent, type ReactNode } from "react";
import { Lock } from "lucide-react";
import { trackEvent } from "@/components/analytics";
import type { LeadFormContext } from "@/components/lead-form-loader";
import { COUNTRY_CODES, DEFAULT_COUNTRY, countryFromTimezone, flagEmoji } from "@/lib/country-codes";
import { leadCourseOptions } from "@/lib/lead-course-options";

import { CONTACT_CONSENT_TEXT } from "@/lib/lead-consent";

const STEP_TITLES = ["Your contact details", "Choose your preferences", "Verify your email"];

// Contact-first Apply now flow (increment 80), styled to the Apply design (UI redesign D §5): step 1
// saves contact details with one required, initially unchecked consent; step 2 records the course
// and optional university; step 3 verifies the email, which also unlocks comparison.
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
  const [feeCategoryKey, setFeeCategoryKey] = useState(context.feeCategoryKey || "");
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
  const [fromComparison, setFromComparison] = useState(false);
  const choices = options.find(o => o.label === course)?.universities || [];
  const feeCourseId = choices.find(choice => choice.id === university)?.courseId;
  const feeCourse = courses.find(item => item.id === feeCourseId);
  const feeRows = feeCourse ? catalog.courseWithUniversity(feeCourse).categoryFees?.rows || [] : [];
  const feeIndex = /^row-\d{1,2}$/.test(feeCategoryKey) ? Number(feeCategoryKey.slice(4)) : -1;
  const validFeeCategoryKey = feeRows[feeIndex] ? feeCategoryKey : "";

  useEffect(() => {
    setDial(countryFromTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone).dial);
    if (window.location.pathname === "/compare") { setReturnTo(window.location.pathname + window.location.search); setFromComparison(true); }
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
      setStep(2); setNotice("Your details are saved. Our team may contact you about your enquiry.");
    });
  }
  async function sendOtp() {
    await api("/api/otp/send", "POST", { leadId });
    setCooldown(60); setNotice(`A verification code was sent to ${contact.email}.`);
    trackEvent("otp_sent", { intent: context.intent });
  }
  async function savePreferences() {
    await run(async () => {
      await api(`/api/leads/${leadId}`, "PATCH", { coursePreference: course, university, ...(context.intent === "total-cost" || context.feeCategoryKey ? { feeCategoryKey: validFeeCategoryKey } : {}) });
      trackEvent("lead_preferences_saved", { intent: context.intent });
      setStep(3);
      await sendOtp();
    });
  }
  const closeDialog = () => window.dispatchEvent(new Event("uv-close-lead"));
  // UI redesign Q27: inline messages under each field. The rules are the inputs' own constraints
  // (required, type, pattern, length); a message appears when the learner leaves a filled-in field
  // or submits, and clears as soon as the value becomes valid.
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  function fieldMessage(el: HTMLInputElement): string {
    const validity = el.validity;
    if (validity.valid) return "";
    if (el.id === "uv-name") return validity.valueMissing ? "Enter your name." : "Enter at least 2 characters.";
    if (el.id === "uv-email") return validity.valueMissing ? "Enter your email address." : "Enter a valid email address, like name@example.com.";
    if (el.id === "uv-phone") return validity.valueMissing ? "Enter your phone number." : dial === "+91" ? "Enter a 10-digit mobile number." : "Enter 4 to 14 digits.";
    if (el.id === "uv-otp") return validity.valueMissing ? "Enter the code from your email." : "Enter the 4 to 6 digit code from your email.";
    return el.validationMessage;
  }
  const checkField = (el: HTMLInputElement) => setFieldErrors(current => ({ ...current, [el.id]: fieldMessage(el) }));
  const fieldProps = (id: string) => ({
    // Leaving an empty field says nothing yet (the message would shift the form under the pointer
    // while tabbing or clicking past it); empty required fields are reported on submit.
    onBlur: (event: FocusEvent<HTMLInputElement>) => { if (event.currentTarget.value || fieldErrors[id]) checkField(event.currentTarget); },
    "aria-invalid": fieldErrors[id] ? true : undefined,
    "aria-describedby": fieldErrors[id] ? `${id}-error` : undefined,
  });
  const fieldError = (id: string) => fieldErrors[id] ? <p id={`${id}-error`} className="uv-lead-field-error">{fieldErrors[id]}</p> : null;
  // On submit, show every message at once and move focus to the first field that needs attention.
  function formIsValid(form: HTMLFormElement) {
    const invalid = Array.from(form.querySelectorAll<HTMLInputElement>("input[id]")).filter(el => !el.validity.valid);
    if (!invalid.length) return true;
    setFieldErrors(current => ({ ...current, ...Object.fromEntries(invalid.map(el => [el.id, fieldMessage(el)])) }));
    invalid[0].focus();
    return false;
  }
  // Server and connection errors sit just above the step's main button, where the learner is looking.
  const errorMessage: ReactNode = error ? <p role="alert" className="uv-lead-error">{error}</p> : null;

  if (done) return <div className="uv-lead uv-lead-done lead-step-enter">
    <Image className="state-illustration uv-lead-done-art" src="/states/application-enquiry-received.webp" alt="" width={800} height={600} sizes="140px" />
    <h2 ref={heading} tabIndex={-1} className="uv-lead-done-title">Your details are received</h2>
    <p className="uv-lead-done-copy">Your email is verified and comparison access is unlocked. Our team will follow up about your enquiry. This is not confirmation of university admission.</p>
    <div className="uv-lead-next">
      <h3>What happens next</h3>
      <ol>
        <li>Our team contacts you about your enquiry, using the details and consent you gave.</li>
        <li>Compare courses side by side while you decide; your comparison is now unlocked.</li>
        <li>We help with documents, education-loan options and follow-ups until you enrol. The university confirms admission.</li>
      </ol>
    </div>
    <div className="uv-lead-done-actions">
      <Link href={returnTo} className="btn secondary" onClick={closeDialog}>{fromComparison ? "Return to comparison" : "Compare courses"}</Link>
      <Link href="/courses" className="btn ghost" onClick={closeDialog}>Browse courses</Link>
    </div>
  </div>;

  return <div className="uv-lead">
    <div className="uv-lead-steps">
      <ol className="uv-lead-bars" aria-hidden="true">
        {STEP_TITLES.map((title, index) => <li key={title} data-state={index + 1 < step ? "done" : index + 1 === step ? "current" : "todo"} />)}
      </ol>
      <p className="uv-lead-progress">Step {step} of 3</p>
    </div>
    <h2 ref={heading} tabIndex={-1} className="uv-lead-title">{STEP_TITLES[step - 1]}</h2>
    {notice && <p role="status" className="uv-lead-status">{notice}</p>}
    {step === 1 && <form className="uv-lead-form lead-step-enter" noValidate onSubmit={e => { e.preventDefault(); if (formIsValid(e.currentTarget)) void saveContact(); }}>
      <div className="uv-lead-field"><label htmlFor="uv-name">Name</label><input id="uv-name" autoComplete="name" minLength={2} maxLength={150} required placeholder="Your name" value={contact.name} {...fieldProps("uv-name")} onChange={e => { setContact({ ...contact, name: e.target.value }); if (fieldErrors["uv-name"]) checkField(e.currentTarget); }} />{fieldError("uv-name")}</div>
      <div className="uv-lead-field"><label htmlFor="uv-email">Email</label><input id="uv-email" type="email" autoComplete="email" maxLength={254} required placeholder="you@email.com" value={contact.email} {...fieldProps("uv-email")} onChange={e => { setContact({ ...contact, email: e.target.value }); if (fieldErrors["uv-email"]) checkField(e.currentTarget); }} />{fieldError("uv-email")}</div>
      <div className="uv-lead-field"><label htmlFor="uv-phone">Phone</label><div className="uv-lead-phone">
        <select aria-label="Country code" autoComplete="tel-country-code" value={dial} onChange={e => setDial(e.target.value)}>{COUNTRY_CODES.map(c => <option key={c.iso2} value={c.dial}>{flagEmoji(c.iso2)} {c.dial} {c.iso2}</option>)}</select>
        <input id="uv-phone" type="tel" inputMode="numeric" autoComplete="tel-national" required placeholder={dial === "+91" ? "10-digit mobile" : "Phone number"} minLength={dial === "+91" ? 10 : 4} maxLength={15 - dial.length + 1} pattern={dial === "+91" ? "[0-9]{10}" : "[0-9]{4,14}"} value={contact.phone} {...fieldProps("uv-phone")} onChange={e => { setContact({ ...contact, phone: e.target.value.replace(/\D/g, "") }); if (fieldErrors["uv-phone"]) checkField(e.currentTarget); }} />
      </div>{fieldError("uv-phone")}</div>
      <label className="uv-lead-consent"><input type="checkbox" required checked={consent} onChange={e => setConsent(e.target.checked)} /><span>{CONTACT_CONSENT_TEXT}</span></label>
      <p className="uv-lead-help">Your details will be saved when you continue. <Link href="/privacy">Privacy policy</Link></p>
      {errorMessage}
      <button className="btn primary uv-lead-submit" disabled={busy || !consent}>{busy ? "Saving…" : "Continue"}</button>
      <p className="uv-lead-lock"><Lock size={15} aria-hidden="true" />Submitting an enquiry does not confirm university admission.</p>
    </form>}
    {step === 2 && <form className="uv-lead-form lead-step-enter" onSubmit={e => { e.preventDefault(); void savePreferences(); }}>
      <div className="uv-lead-pair">
        <div className="uv-lead-field"><label htmlFor="uv-course">Course</label><select id="uv-course" required value={course} onChange={e => { setCourse(e.target.value); setUniversity(""); setFeeCategoryKey(""); }}><option value="">Select a course</option>{options.map(o => <option key={o.label} value={o.label}>{o.label}</option>)}</select></div>
        <div className="uv-lead-field"><label htmlFor="uv-university">University <span className="uv-lead-optional">(optional)</span></label><select id="uv-university" value={choices.some(u => u.id === university) ? university : ""} onChange={e => { setUniversity(e.target.value); setFeeCategoryKey(""); }}><option value="">No preference</option>{choices.map(u => <option key={u.id} value={u.id}>{u.shortName === "MUJ" ? "Manipal University Jaipur" : u.shortName === "SMU" ? "Sikkim Manipal University" : "Amity Online"}</option>)}</select></div>
      </div>
      {(context.intent === "total-cost" || context.feeCategoryKey) && <div className="uv-lead-field">{feeRows.length ? <><label htmlFor="uv-fee-category">Applicant fee category <span className="uv-lead-optional">(optional)</span></label><select id="uv-fee-category" value={validFeeCategoryKey} onChange={e => setFeeCategoryKey(e.target.value)}><option value="">Not sure yet</option>{feeRows.map((row, index) => <option key={`${row.category}-${index}`} value={`row-${index}`}>{row.category} ({row.currency})</option>)}</select><p className="uv-lead-help">This is the fee category you reviewed. The university must confirm which category applies to you.</p></> : <p className="uv-lead-help"><strong>Applicant fee category:</strong> {feeCourse ? "No category-specific fee is published for this course yet. Ask the university to confirm your category." : "Choose a university to see its published fee categories."}</p>}</div>}
      {errorMessage}
      <div className="uv-lead-actions"><button type="button" className="btn ghost" disabled={busy} onClick={() => setStep(1)}>Back</button><button className="btn primary uv-lead-submit" disabled={busy || !course}>{busy ? "Saving…" : "Save and verify email"}</button></div>
    </form>}
    {step === 3 && <form className="uv-lead-form lead-step-enter" noValidate onSubmit={e => { e.preventDefault(); if (!formIsValid(e.currentTarget)) return; const otp = new FormData(e.currentTarget).get("otp"); void run(async () => { await api("/api/otp/verify", "POST", { leadId, otp }); window.dispatchEvent(new Event("uv-lead-unlocked")); trackEvent("otp_verified", { intent: context.intent }); setDone(true); }); }}>
      <p className="uv-lead-help">Enter the code sent to <strong>{contact.email}</strong>. Your enquiry is already saved.</p>
      <div className="uv-lead-field"><label htmlFor="uv-otp">Email verification code</label><input id="uv-otp" name="otp" className="uv-lead-otp" autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{4,6}" required minLength={4} maxLength={6} {...fieldProps("uv-otp")} onChange={e => { if (fieldErrors["uv-otp"]) checkField(e.currentTarget); }} />{fieldError("uv-otp")}</div>
      {errorMessage}
      <button className="btn primary uv-lead-submit" disabled={busy}>{busy ? "Please wait…" : "Verify email"}</button>
      <div className="uv-lead-more">
        <button className="btn ghost" type="button" disabled={busy || cooldown > 0} onClick={() => void run(sendOtp)}>{cooldown ? `Resend in ${cooldown}s` : "Resend code"}</button>
        <button className="btn ghost" type="button" disabled={busy} onClick={() => { setStep(1); setError(""); }}>Edit contact details</button>
        <button className="btn ghost" type="button" disabled={busy} onClick={() => { setStep(2); setError(""); }}>Edit preferences</button>
      </div>
    </form>}
  </div>;
}
