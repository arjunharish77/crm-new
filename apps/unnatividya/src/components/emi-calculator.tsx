"use client";
import { useCatalog } from "@/components/catalog-provider";
import { useRef, useState } from "react";
import Link from "next/link";
import { trackEvent } from "@/components/analytics";
import { formatFee } from "@/lib/catalog-format";

export function EmiCalculator() {
  const { courses, courseWithUniversity } = useCatalog();
  const catalogCourses = courses.map(courseWithUniversity).sort((a, b) => a.name.localeCompare(b.name));
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [values, setValues] = useState({ fee: "180000", down: "20000", months: "24", rate: "0" });
  const trackedUsage = useRef(false);
  const selectedCourse = catalogCourses.find(course => course.id === selectedCourseId);
  const fee = Number(values.fee), down = Number(values.down), months = Number(values.months), rate = Number(values.rate);
  const errors = {
    fee: values.fee === "" || !Number.isFinite(fee) || fee < 0 || fee > 10000000 ? "Enter a fee from ₹0 to ₹1,00,00,000." : "",
    down: values.down === "" || !Number.isFinite(down) || down < 0 || down > fee ? "Enter a down payment between zero and the total fee." : "",
    months: values.months === "" || !Number.isInteger(months) || months < 1 || months > 120 ? "Enter a whole number from 1 to 120 months." : "",
    rate: values.rate === "" || !Number.isFinite(rate) || rate < 0 || rate > 50 ? "Enter an annual rate from 0% to 50%." : "",
  };
  const valid = !Object.values(errors).some(Boolean);
  const principal = fee - down;
  const monthlyRate = rate / 1200;
  const emi = valid ? (principal === 0 ? 0 : monthlyRate === 0 ? principal / months : principal * monthlyRate / -Math.expm1(-months * Math.log1p(monthlyRate))) : 0;
  const repayment = emi * months;
  const money = (amount: number) => formatFee(Math.round(amount));
  const fields = [
    { key: "fee", label: "Total program fee (₹)", min: 0, max: 10000000, step: "0.01", help: "Enter tuition and any costs you want included in this estimate." },
    { key: "down", label: "Down payment (₹)", min: 0, max: fee || 0, step: "0.01", help: "The amount paid upfront, before loan repayments." },
    { key: "months", label: "Repayment period (months)", min: 1, max: 120, step: "1", help: "Use the repayment period offered by your lender, not the course duration." },
    { key: "rate", label: "Annual interest rate (%)", min: 0, max: 50, step: "0.01", help: "0% models interest-free repayments; it does not confirm an available offer." },
  ] as const;

  function trackCalculation() {
    if (!valid) return;
    if (!trackedUsage.current) {
      trackEvent("emi_calculator_used", { course_id: selectedCourseId || undefined, fee, tenure_months: months });
      trackedUsage.current = true;
    }
    trackEvent("emi_calculation", { fee, down_payment: down, tenure_months: months, rate, emi: Math.round(emi), total_interest: Math.round(repayment - principal) });
  }

  return <div className="emi-layout emi-workspace">
    <section className="emi-input-panel" aria-labelledby="emi-input-title">
      <h2 id="emi-input-title">Build your estimate</h2>
      <label htmlFor="emi-course">Choose a program (optional)</label>
      <select id="emi-course" value={selectedCourseId} onChange={event => {
        const course = catalogCourses.find(item => item.id === event.target.value);
        setSelectedCourseId(event.target.value);
        if (course) setValues(current => ({ ...current, fee: String(course.fee), down: String(Math.min(Number(current.down) || 0, course.fee)) }));
      }}>
        <option value="">Enter fee manually</option>
        {catalogCourses.map(course => <option key={course.id} value={course.id}>{course.name} — {course.university.shortName} · {formatFee(course.fee)}</option>)}
      </select>
      <p className="emi-field-help">Choosing a course fills its listed tuition. Confirm current fees and loan terms separately.</p>
      {fields.map(field => <div className="emi-input-field" key={field.key}>
        <label htmlFor={`emi-${field.key}`}>{field.label}</label>
        <input id={`emi-${field.key}`} type="number" inputMode={field.key === "months" ? "numeric" : "decimal"} min={field.min} max={field.max} step={field.step} value={values[field.key]} aria-invalid={Boolean(errors[field.key])} aria-describedby={`emi-${field.key}-help${errors[field.key] ? ` emi-${field.key}-error` : ""}`} onBlur={trackCalculation} onChange={event => {
          setValues(current => ({ ...current, [field.key]: event.target.value }));
          if (field.key === "fee") setSelectedCourseId("");
        }} />
        <p id={`emi-${field.key}-help`} className="emi-field-help">{field.help}</p>
        {errors[field.key] && <p id={`emi-${field.key}-error`} className="emi-field-error">{errors[field.key]}</p>}
      </div>)}
    </section>
    <aside className="right-rail emi-output-panel" aria-label="Repayment estimate">
      <div className="emi-result" aria-live="polite" aria-atomic="true">
        <h2>Estimated monthly EMI</h2>
        {valid ? <><p className="emi-result-amount" data-emi="monthly">{money(emi)}</p><p>{principal === 0 ? "No loan needed for these inputs." : `For ${months} months`}</p>
          <dl>{[
            ["Down payment", down, "down"], ["Loan amount", principal, "principal"], ["Total interest", repayment - principal, "interest"], ["Loan repayments", repayment, "repayment"], ["Overall payment including down payment", repayment + down, "overall"],
          ].map(([label, amount, key]) => <div key={key}><dt>{label}</dt><dd data-emi={key}>{money(Number(amount))}</dd></div>)}</dl>
          <p className="emi-result-note">Rounded to the nearest rupee. Overall payment excludes any fees or charges not entered above.</p>
        </> : <p role="status">Correct the highlighted inputs to see your estimate.</p>}
      </div>
      <div className="emi-next-step"><h2>Explore your next step</h2><p>This is a planning estimate, not a loan offer or approval. Confirm rates, charges and repayment dates with the lender.</p>
        {selectedCourse && <Link href={`/courses/${selectedCourse.slug}`} className="btn secondary">View selected course</Link>}
        <Link href={selectedCourse ? `/lead?intent=emi-calculator&course=${selectedCourse.id}` : "/lead?intent=emi-calculator"} className="btn primary" data-open-lead>Apply now</Link>
        <Link href="/courses">Browse courses and fees</Link>
      </div>
    </aside>
  </div>;
}
