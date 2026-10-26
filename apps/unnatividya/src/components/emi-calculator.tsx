"use client";
import { useCatalog } from "@/components/catalog-provider";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { trackEvent } from "@/components/analytics";
import { universityMedia } from "@/data/media";
import { formatFee } from "@/lib/catalog-format";
import { costChoices, inrFeeForEmi, semesterComparison, upfrontRoute } from "@/lib/total-cost";
import { formatCheckedDate, sourceHost } from "@/lib/source-checks";

const TENURES = [6, 12, 18, 24, 36];

// Reducing-balance EMI (unchanged, increment 82): principal ÷ months at 0%, 0 when nothing is borrowed.
function monthlyEmi(principal: number, months: number, rate: number) {
  const monthlyRate = rate / 1200;
  return principal === 0 ? 0 : monthlyRate === 0 ? principal / months : principal * monthlyRate / -Math.expm1(-months * Math.log1p(monthlyRate));
}

// EMI calculator in the design layout (EMICalculator.dc.html): inputs card on the left, navy result
// card on the right, then "Same plan, other universities". Ranges, the applicant-category selector,
// the INR-only guard, manual fee entry and the formula are unchanged (UI redesign Q9).
export function EmiCalculator() {
  const { courses, courseWithUniversity } = useCatalog();
  const catalogCourses = courses.map(courseWithUniversity).sort((a, b) => a.name.localeCompare(b.name));
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [selectedCategoryKey, setSelectedCategoryKey] = useState("");
  const [values, setValues] = useState({ fee: "180000", down: "20000", months: "24", rate: "0", processing: "0" });
  const trackedUsage = useRef(false);
  const selectedCourse = catalogCourses.find(course => course.id === selectedCourseId);
  const choices = selectedCourse ? costChoices(selectedCourse) : [];
  const selectedChoice = choices.find(choice => choice.key === selectedCategoryKey) || choices[0];
  const selectedFeeIsInr = !selectedCourse || inrFeeForEmi(selectedChoice) !== null;
  const fee = Number(values.fee), down = Number(values.down), months = Number(values.months), rate = Number(values.rate), processing = Number(values.processing);
  const errors = {
    fee: !selectedFeeIsInr ? "This calculator uses INR only. Choose a listed INR category or enter an INR lender quote manually." : values.fee === "" || !Number.isFinite(fee) || fee < 0 || fee > 10000000 ? "Enter a fee from ₹0 to ₹1,00,00,000." : "",
    down: values.down === "" || !Number.isFinite(down) || down < 0 || down > fee ? "Enter a down payment between zero and the total fee." : "",
    months: values.months === "" || !Number.isInteger(months) || months < 1 || months > 120 ? "Enter a whole number from 1 to 120 months." : "",
    rate: values.rate === "" || !Number.isFinite(rate) || rate < 0 || rate > 50 ? "Enter an annual rate from 0% to 50%." : "",
    processing: values.processing === "" || !Number.isFinite(processing) || processing < 0 || processing > 1000000 ? "Enter a processing fee from ₹0 to ₹10,00,000." : "",
  };
  const valid = !Object.values(errors).some(Boolean);
  const principal = fee - down;
  const emi = valid ? monthlyEmi(principal, months, rate) : 0;
  const repayment = emi * months;
  const money = (amount: number) => formatFee(Math.round(amount));
  const overall = repayment + down + (valid ? processing : 0);
  // Wave 4 A4: loan route vs the published semester schedule, when one exists for this category.
  const semesters = valid && selectedCourse ? semesterComparison(selectedChoice, overall) : null;
  // Wave 5 B4 (EMI v2): upfront, with an optional one-time discount the learner has been offered.
  const [upfrontDiscount, setUpfrontDiscount] = useState("");
  const discountValue = upfrontDiscount === "" ? 0 : Number(upfrontDiscount);
  const discountError = upfrontDiscount !== "" && (!Number.isFinite(discountValue) || discountValue < 0 || discountValue > 10000000) ? "Enter a discount from ₹0 to ₹1,00,00,000." : "";
  const canPayUpfront = Boolean(valid && selectedCourse && upfrontRoute(selectedCourse, selectedChoice, 0));
  const upfront = valid && selectedCourse && !discountError ? upfrontRoute(selectedCourse, selectedChoice, discountValue) : null;
  const share = (amount: number) => `${overall > 0 ? Math.max(0, amount) / overall * 100 : 0}%`;
  const feeMax = Number.isFinite(fee) && fee > 0 && fee <= 10000000 ? fee : 0;

  const fields = {
    fee: { label: "Total program fee (₹)", min: 0, max: 10000000, step: "0.01", help: "Enter tuition and any costs you want included in this estimate." },
    down: { label: "Down payment (₹)", min: 0, max: fee || 0, step: "0.01", help: "The amount paid upfront, before loan repayments." },
    months: { label: "Repayment period (months)", min: 1, max: 120, step: "1", help: "Use the repayment period offered by your lender, not the course duration." },
    rate: { label: "Annual interest rate (%)", min: 0, max: 50, step: "0.01", help: "0% models interest-free repayments; it does not confirm an available offer." },
    processing: { label: "Lender processing fee (₹, optional)", min: 0, max: 1000000, step: "0.01", help: "A one-time charge some lenders add. It counts in the total payable; it is not borrowed." },
  } as const;
  type FieldKey = keyof typeof fields;

  function trackCalculation() {
    if (!valid) return;
    if (!trackedUsage.current) {
      trackEvent("emi_calculator_used", { course_id: selectedCourseId || undefined, fee, tenure_months: months });
      trackedUsage.current = true;
    }
    trackEvent("emi_calculation", { fee, down_payment: down, tenure_months: months, rate, emi: Math.round(emi), total_interest: Math.round(repayment - principal) });
  }

  // Selecting a program fills its listed (or published-category) INR tuition and keeps the down
  // payment within it. "Use this" in the peer table prefers the same published category label.
  function selectCourse(courseId: string, preferredLabel?: string) {
    const course = catalogCourses.find(item => item.id === courseId);
    setSelectedCourseId(courseId);
    const options = course ? costChoices(course) : [];
    const preferred = preferredLabel ? options.find(choice => choice.publishedCategory && choice.currency === "INR" && choice.label.trim().toLowerCase() === preferredLabel) : undefined;
    const first = preferred || options.find(choice => choice.currency === "INR") || options[0] || null;
    const inrFee = first ? inrFeeForEmi(first) : null;
    setSelectedCategoryKey(first?.key || "");
    if (course) setValues(current => ({ ...current, fee: inrFee !== null ? String(inrFee) : "", down: String(Math.min(Number(current.down) || 0, inrFee || 0)) }));
  }

  // UI redesign Q24: course pages link here with ?course=<id> (and optionally &category=<key>), so
  // the program and its listed INR tuition are filled in on arrival. Unknown ids or categories are
  // ignored, leaving the calculator as it would open without them.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const course = catalogCourses.find(item => item.id === params.get("course"));
    if (!course) return;
    selectCourse(course.id);
    const choice = costChoices(course).find(item => item.key === params.get("category") && inrFeeForEmi(item) !== null);
    if (!choice) return;
    const inrFee = inrFeeForEmi(choice);
    setSelectedCategoryKey(choice.key);
    setValues(current => ({ ...current, fee: String(inrFee), down: String(Math.min(Number(current.down) || 0, inrFee || 0)) }));
    // Runs once on load against the published catalog.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function field(key: FieldKey) {
    const config = fields[key];
    return <>
      <div className="uvt-emi-head">
        <label htmlFor={`emi-${key}`}>{config.label}</label>
        <input id={`emi-${key}`} className="uvt-control uvt-emi-number" type="number" inputMode={key === "months" ? "numeric" : "decimal"} min={config.min} max={config.max} step={config.step} value={values[key]} aria-invalid={Boolean(errors[key])} aria-describedby={`emi-${key}-help${errors[key] ? ` emi-${key}-error` : ""}`} onBlur={trackCalculation} onChange={event => {
          setValues(current => ({ ...current, [key]: event.target.value }));
          if (key === "fee") { setSelectedCourseId(""); setSelectedCategoryKey(""); }
        }} />
      </div>
    </>;
  }
  function notes(key: FieldKey) {
    return <>
      <p id={`emi-${key}-help`} className="uvt-help-text">{fields[key].help}</p>
      {errors[key] && <p id={`emi-${key}-error`} className="uvt-error">{errors[key]}</p>}
    </>;
  }

  const sameCategory = selectedChoice?.publishedCategory ? selectedChoice.label.trim().toLowerCase() : null;
  const peers = selectedCourse && selectedFeeIsInr && valid ? catalogCourses
    .filter(course => course.shortName === selectedCourse.shortName)
    .sort((a, b) => a.university.name.localeCompare(b.university.name))
    .map(course => {
      const match = sameCategory ? costChoices(course).find(choice => choice.publishedCategory && choice.currency === "INR" && choice.label.trim().toLowerCase() === sameCategory) : null;
      const peerFee = sameCategory ? (match ? inrFeeForEmi(match) : null) : course.fee;
      return { course, peerFee, peerEmi: peerFee === null ? null : monthlyEmi(peerFee - Math.min(down, peerFee), months, rate) };
    }) : [];
  const applyHref = selectedCourse ? `/lead?intent=emi-calculator&course=${selectedCourse.id}${selectedChoice.publishedCategory ? `&category=${encodeURIComponent(selectedChoice.key)}` : ""}` : "/lead?intent=emi-calculator";

  return <div className="uvt-emi">
    <div className="uvt-emi-grid">
      <section className="uvt-emi-inputs" aria-labelledby="emi-input-title">
        <h2 id="emi-input-title" className="sr-only">Build your estimate</h2>
        <div className="uvt-emi-field">
          <label htmlFor="emi-course" className="uvt-emi-label">Program <span>(optional)</span></label>
          <select id="emi-course" className="uvt-control" value={selectedCourseId} onChange={event => selectCourse(event.target.value)}>
            <option value="">Enter fee manually</option>
            {catalogCourses.map(course => <option key={course.id} value={course.id}>{course.name} — {course.university.shortName} · listed INR {formatFee(course.fee)}</option>)}
          </select>
          <p className="uvt-help-text">Choosing a course fills its listed INR tuition. Confirm the applicant category and lender terms separately.</p>
        </div>
        {selectedCourse && <div className="uvt-emi-field">
          <label htmlFor="emi-fee-category" className="uvt-emi-label">Applicant fee category</label>
          <select id="emi-fee-category" className="uvt-control" value={selectedChoice.key} onChange={event => {
            const choice = choices.find(item => item.key === event.target.value)!;
            const inrFee = inrFeeForEmi(choice);
            setSelectedCategoryKey(choice.key);
            setValues(current => ({ ...current, fee: inrFee !== null ? String(inrFee) : "", down: String(Math.min(Number(current.down) || 0, inrFee || 0)) }));
          }}>{choices.map(choice => <option key={choice.key} value={choice.key}>{choice.label}</option>)}</select>
          <p className="uvt-help-text">
            <span className={`uvt-status ${selectedChoice.publishedCategory ? "is-success" : selectedChoice.tuition === null ? "is-neutral" : "is-warning"}`}>{selectedChoice.publishedCategory ? "Published category fee" : selectedChoice.tuition === null ? "Not published" : "Confirm with the university"}</span>{" "}
            {selectedChoice.publishedCategory ? "Using published category-specific tuition." : selectedChoice.tuition === null ? "No published fee for this category; no INR estimate is shown." : "Using listed INR tuition; applicant category is not yet verified."} {selectedChoice.sourceUrl ? <><a href={selectedChoice.sourceUrl} target="_blank" rel="noopener noreferrer">{sourceHost(selectedChoice.sourceUrl)}</a>{selectedChoice.checkedAt ? ` · checked ${formatCheckedDate(selectedChoice.checkedAt)}` : ""}</> : null}
          </p>
          <p className="uvt-help-text"><Link href={`/tools/total-cost?course=${encodeURIComponent(selectedCourse.id)}&category=${encodeURIComponent(selectedChoice.key)}`} className="uv-link">Check tuition, semester payments and missing charges →</Link></p>
        </div>}
        <div className="uvt-emi-field">{field("fee")}{notes("fee")}</div>
        <div className="uvt-emi-field">
          {field("down")}
          <input type="range" className="uvt-range" aria-label="Down payment slider" min={0} max={feeMax} step={5000} value={Number.isFinite(down) ? Math.min(Math.max(down, 0), feeMax) : 0} aria-valuetext={formatFee(Math.round(Number.isFinite(down) ? down : 0))} disabled={!feeMax} onChange={event => setValues(current => ({ ...current, down: event.target.value }))} onPointerUp={trackCalculation} onKeyUp={trackCalculation} />
          <div className="uvt-range-legend" aria-hidden="true"><span>₹0</span><span>{formatFee(Math.round(feeMax))}</span></div>
          {notes("down")}
        </div>
        <div className="uvt-emi-field">
          {field("months")}
          <fieldset className="uvt-tenure">
            <legend className="sr-only">Common repayment periods</legend>
            {TENURES.map(tenure => <label key={tenure}>
              <input type="radio" name="emi-tenure" value={tenure} checked={values.months === String(tenure)} onChange={() => setValues(current => ({ ...current, months: String(tenure) }))} onBlur={trackCalculation} />
              <span aria-hidden="true">{tenure}m</span><span className="sr-only">{tenure} months</span>
            </label>)}
          </fieldset>
          {notes("months")}
        </div>
        <div className="uvt-emi-field">
          {field("rate")}
          <input type="range" className="uvt-range" aria-label="Interest rate slider" min={0} max={18} step={0.5} value={Number.isFinite(rate) ? Math.min(Math.max(rate, 0), 18) : 0} aria-valuetext={`${Number.isFinite(rate) ? rate : 0}% a year${rate === 0 ? ", interest-free scenario" : ""}`} onChange={event => setValues(current => ({ ...current, rate: event.target.value }))} onPointerUp={trackCalculation} onKeyUp={trackCalculation} />
          <div className="uvt-range-legend" aria-hidden="true"><span>0% · interest-free scenario</span><span>18%</span></div>
          {notes("rate")}
        </div>
        <div className="uvt-emi-field">{field("processing")}{notes("processing")}</div>
      </section>

      <aside className="uvt-emi-result" aria-label="Repayment estimate">
        <div className="uvt-emi-live" aria-live="polite" aria-atomic="true">
          <h2>Your monthly EMI</h2>
          {valid ? <>
            <p className="uvt-emi-amount" data-emi="monthly">{money(emi)}</p>
            <p className="uvt-emi-for">{principal === 0 ? "No loan needed for these inputs." : `For ${months} months${selectedCourse ? ` · ${selectedCourse.name}, ${selectedCourse.university.shortName}` : ""}`}</p>
            <div className="uvt-emi-bar" role="img" aria-label={`Down payment ${money(down)}, loan amount ${money(principal)}, total interest ${money(repayment - principal)}`}>
              <span className="is-down" style={{ width: share(down) }} />
              <span className="is-principal" style={{ width: share(principal) }} />
              <span className="is-interest" style={{ width: share(repayment - principal) }} />
            </div>
            <dl className="uvt-emi-figures">
              <div><dt><i className="is-down" aria-hidden="true" />Down payment</dt><dd data-emi="down">{money(down)}</dd></div>
              <div><dt><i className="is-principal" aria-hidden="true" />Loan amount</dt><dd data-emi="principal">{money(principal)}</dd></div>
              <div><dt><i className="is-interest" aria-hidden="true" />Total interest</dt><dd data-emi="interest">{money(repayment - principal)}</dd></div>
              <div><dt>Total payable</dt><dd data-emi="overall">{money(overall)}</dd></div>
            </dl>
            <p className="uvt-emi-repay">Loan repayments (EMI × months): <strong data-emi="repayment">{money(repayment)}</strong></p>
            {processing > 0 ? <p className="uvt-emi-repay">Lender processing fee: <strong data-emi="processing">{money(processing)}</strong></p> : null}
            <p className="uvt-emi-note">Rounded to the nearest rupee. Total payable is your down payment, loan repayments and any processing fee entered; it excludes other charges.</p>
          </> : <p role="status" className="uvt-emi-invalid">Correct the highlighted inputs to see your estimate.</p>}
        </div>
        <div className="uvt-emi-actions">
          <Link href={applyHref} rel="nofollow" className="btn on-navy large" data-open-lead>Apply now</Link>
          {selectedCourse ? <Link href={`/courses/${selectedCourse.slug}`} className="btn outline-on-navy large">View program</Link> : <Link href="/courses" className="btn outline-on-navy large">Browse courses and fees</Link>}
        </div>
        <p className="uvt-emi-note">Estimate only. This is a planning estimate, not a loan offer or approval. Confirm rates, charges and repayment dates with the lender and current university terms.</p>
      </aside>
    </div>

    {selectedCourse && valid ? <section className="uvt-emi-semesters" aria-labelledby="emi-semesters-title">
      <h2 id="emi-semesters-title" className="uvt-h2-sm">Ways to pay: upfront, each semester or a loan</h2>
      {canPayUpfront || semesters ? <>
        <div className="uvt-field uvt-emi-discount">
          <label htmlFor="emi-upfront-discount">One-time discount the university offered for paying upfront (₹, optional)</label>
          <input id="emi-upfront-discount" className="uvt-control" type="number" inputMode="numeric" min={0} step={1} value={upfrontDiscount} onChange={event => setUpfrontDiscount(event.target.value)} aria-invalid={Boolean(discountError)} aria-describedby="emi-upfront-discount-help" />
          <p id="emi-upfront-discount-help" className="uvt-help-text">Only if the university has offered you one. We don&apos;t assume a discount.</p>
          {discountError ? <p className="uvt-error" role="alert">{discountError}</p> : null}
        </div>
        <dl className="uvt-emi-compare is-three">
          {upfront ? <div><dt>Pay upfront</dt><dd data-emi="upfront-total">{money(upfront.total)}</dd><span>One payment before the program starts. {upfront.fromPlan ? "The university's published full-payment amount" : "The listed tuition"}{upfront.discount > 0 ? `, less your ${money(upfront.discount)} discount` : ""}.</span></div> : null}
          {semesters ? <div><dt>Pay the university each semester</dt><dd data-emi="schedule-total">{money(semesters.scheduleTotal)}</dd><span>{semesters.semesters} × {money(semesters.perSemester)}, one at the start of each semester, from the published “{selectedChoice.label}” schedule.</span></div> : null}
          <div><dt>This loan plan</dt><dd data-emi="plan-total">{money(semesters ? semesters.loanPlanTotal : Math.round(overall))}</dd><span>Down payment, then {months} monthly payments of {money(emi)}{processing > 0 ? ", plus the processing fee" : ""}.</span></div>
        </dl>
        <p className="uvt-help-text" data-emi="schedule-difference">
          {upfront ? `Compared with paying upfront, the loan plan totals ${money(Math.abs(Math.round(overall) - upfront.total))} ${Math.round(overall) - upfront.total >= 0 ? "more" : "less"}. ` : ""}
          {semesters ? (semesters.difference === 0 ? "The loan plan and the semester schedule total the same amount. " : `The loan plan totals ${money(Math.abs(semesters.difference))} ${semesters.difference > 0 ? "more" : "less"} than the published semester schedule. `) : "No semester schedule is published for this program and fee category yet. "}
          Timing differs: {upfront || canPayUpfront ? "upfront is paid once, " : ""}{semesters ? "semester fees at the start of each term, " : ""}and the loan over {months} months.
          {selectedChoice.sourceUrl ? <> Source: <a href={selectedChoice.sourceUrl} target="_blank" rel="noopener noreferrer">{sourceHost(selectedChoice.sourceUrl)}</a>{selectedChoice.checkedAt ? `, checked ${formatCheckedDate(selectedChoice.checkedAt)}` : ""}.</> : null}
        </p>
        <p className="uvt-help-text">Before you choose a loan, ask the lender for its Key Facts Statement: it shows the annual percentage rate including all charges. These totals add up the payments only; they don&apos;t reflect when each payment falls due or any other costs.</p>
      </> : <p className="uvt-help-text">No published tuition or semester schedule for this program and fee category, so there is nothing to compare. <Link href={`/tools/total-cost?course=${encodeURIComponent(selectedCourse.id)}&category=${encodeURIComponent(selectedChoice.key)}`} className="uv-link">See the total cost planner →</Link></p>}
    </section> : null}

    {peers.length > 1 ? <section className="uvt-emi-peers" aria-labelledby="emi-peers-title">
      <h2 id="emi-peers-title" className="uvt-h2-sm">Same plan, other universities</h2>
      <p className="uvt-help-text uvt-peer-note">{sameCategory ? `Each row uses the published “${selectedChoice.label}” tuition` : "Each row uses the program's listed INR tuition"} with your down payment (up to that fee), {months}-month period and {rate}% rate. Sorted by university name; not a ranking.</p>
      <div className="uv-table-region" role="region" aria-labelledby="emi-peers-title" tabIndex={0}>
        <table className="uv-table uvt-peer-table">
          <caption className="sr-only">Monthly EMI for the same plan at other universities</caption>
          <thead><tr><th scope="col">Program</th><th scope="col">Listed tuition</th><th scope="col">Your EMI</th><th scope="col"><span className="sr-only">Action</span></th></tr></thead>
          <tbody>{peers.map(({ course, peerFee, peerEmi }) => {
            const current = course.id === selectedCourse?.id;
            return <tr key={course.id} aria-current={current ? "true" : undefined} className={current ? "is-current" : undefined}>
              <th scope="row"><span className="uvt-peer-name"><Image src={universityMedia[course.universityId]?.logo || "/brand/favicon-32x32.png"} alt="" width={24} height={24} />{course.name} — {course.university.shortName}</span></th>
              <td>{peerFee === null ? "Not published for this category" : formatFee(peerFee)}</td>
              <td className="uvt-peer-emi">{peerEmi === null ? "—" : `${money(peerEmi)}/mo`}</td>
              <td>{current ? <span className="uvt-peer-current">Selected</span> : peerFee === null ? null : <button type="button" className="uvt-text-btn is-primary" onClick={() => selectCourse(course.id, sameCategory || undefined)} aria-label={`Use ${course.name}, ${course.university.shortName}`}>Use this <ArrowRight size={16} aria-hidden="true" /></button>}</td>
            </tr>;
          })}</tbody>
        </table>
      </div>
    </section> : null}
  </div>;
}
