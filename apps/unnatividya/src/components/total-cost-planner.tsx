"use client";

import Link from "next/link";
import { useState } from "react";
import { Calculator, Printer } from "lucide-react";
import { useCatalog } from "@/components/catalog-provider";
import { formatCategoryFee } from "@/lib/prepared-category-fees";
import { alignedCostComparison, costChoices, costEstimate } from "@/lib/total-cost";
import { formatCheckedDate, sourceHost } from "@/lib/source-checks";
import { useFeeGroup } from "@/components/fee-group";
import { categoryRowFor } from "@/lib/fee-group";

export function TotalCostPlanner({ initialCourseIds = [], initialCategoryKey = "" }: { initialCourseIds?: string[]; initialCategoryKey?: string }) {
  const { courses, courseWithUniversity } = useCatalog();
  const all = courses.map(courseWithUniversity).sort((a, b) => a.name.localeCompare(b.name) || a.university.name.localeCompare(b.university.name));
  const [selectedIds, setSelectedIds] = useState<string[]>(() => initialCourseIds.filter(id => all.some(course => course.id === id)).slice(0, 3));
  const [picker, setPicker] = useState("");
  const [categories, setCategories] = useState<Record<string, string>>(() => initialCourseIds.length === 1 && initialCategoryKey ? { [initialCourseIds[0]]: initialCategoryKey } : {});
  const [extras, setExtras] = useState<Record<string, string>>({});
  const selected = selectedIds.map(id => all.find(course => course.id === id)).filter((course): course is NonNullable<typeof course> => Boolean(course));
  // Wave 5 E3: without an explicit choice, each program starts on the visitor's fee group.
  const group = useFeeGroup();
  const defaultChoice = (course: (typeof selected)[number]) => {
    const choices = costChoices(course);
    const row = categoryRowFor(course.categoryFees, group);
    const index = row && course.categoryFees ? course.categoryFees.rows.indexOf(row) : -1;
    if (index >= 0) return choices.find(choice => choice.key === `row-${index}`) || choices[0];
    if (group !== "indian") return choices.find(choice => choice.key === "unlisted") || choices[0];
    return choices[0];
  };
  const selectedChoices = selected.map(course => costChoices(course).find(choice => choice.key === categories[course.id]) || defaultChoice(course));
  const comparable = alignedCostComparison(selectedChoices);

  return <div className="uvt-planner">
    <section className="uvt-panel uvt-planner-intro" aria-labelledby="total-cost-build-title">
      <h2 id="total-cost-build-title" className="uvt-panel-title">Build a fee view</h2>
      <p>Choose up to three published programs. Select the applicant category shown by each university; if that fee is missing, the planner will say so. Your estimate stays in this browser and creates no enquiry.</p>
      <div className="uvt-picker">
        <label htmlFor="total-cost-add" className="uvt-label">Add a program</label>
        <select id="total-cost-add" className="uvt-control" value={picker} disabled={selectedIds.length >= 3} onChange={event => setPicker(event.target.value)}>
          <option value="">Choose a course</option>
          {all.filter(course => !selectedIds.includes(course.id)).map(course => <option key={course.id} value={course.id}>{course.name} — {course.university.shortName}</option>)}
        </select>
        <button type="button" className="btn primary large" disabled={!picker || selectedIds.length >= 3} onClick={() => { setSelectedIds(current => [...current, picker]); setPicker(""); }}>Add course</button>
      </div>
      <p className="uvt-help-text">{selectedIds.length} of 3 selected. This is a planning aid, not a university quote or an admission decision.</p>
    </section>

    {selected.length > 1 && <div className="uvt-callout" role="status">
      <strong>{comparable ? "Comparable published tuition categories" : "Fee categories cannot be compared directly yet"}</strong>
      <p>{comparable ? `Each selected program uses the same published applicant-category label and ${selectedChoices[0].currency} currency. Compare tuition separately from any extra costs you enter.` : "At least one applicant category is unverified, missing, differently labelled or in another currency. Each card remains useful on its own; no currency conversion or cross-category ranking is shown."}</p>
    </div>}

    {!selected.length && <div className="uv-empty uvt-planner-empty"><div className="uv-empty-art" aria-hidden="true"><span><Calculator size={26} /></span><i /><i /></div><h3>Start with a course</h3><p>Its published tuition and any available category-specific schedule will appear here. You can then add two more programs.</p></div>}

    <div className="uvt-cost-grid">{selected.map(course => {
      const choices = costChoices(course);
      const choice = choices.find(item => item.key === categories[course.id]) || defaultChoice(course);
      const extraRaw = extras[course.id] ?? "0";
      const extra = Number(extraRaw);
      const extraValid = extraRaw !== "" && Number.isSafeInteger(extra) && extra >= 0 && extra <= 10_000_000;
      const estimate = extraValid ? costEstimate(choice, extra) : null;
      const money = (amount: number) => choice.currency ? formatCategoryFee(choice.currency, amount) : "Unavailable";
      return <article className="uvt-cost-card" key={course.id}>
        <div className="uvt-cost-head"><div><h3>{course.name}</h3><p>{course.university.name}</p></div><button type="button" className="btn ghost uvt-cost-remove" aria-label={`Remove ${course.name} at ${course.university.name}`} onClick={() => setSelectedIds(current => current.filter(id => id !== course.id))}>Remove</button></div>
        <label htmlFor={`cost-category-${course.id}`} className="uvt-label">Your applicant fee category</label>
        <select id={`cost-category-${course.id}`} className="uvt-control" value={choice.key} onChange={event => setCategories(current => ({ ...current, [course.id]: event.target.value }))}>
          {choices.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}
        </select>
        {choice.publishedCategory ? <p className="uvt-cost-status"><span className="uvt-status is-success">Published category-specific tuition</span></p> : <p className="uvt-cost-status"><span className={`uvt-status ${choice.tuition === null ? "is-neutral" : "is-warning"}`}>{choice.tuition === null ? "No published fee for this applicant category" : "Listed INR tuition; applicant category still needs confirmation"}</span></p>}
        <dl className="uvt-cost-facts">
          <div><dt>Listed tuition</dt><dd>{choice.tuition === null ? "Confirm with university" : money(choice.tuition)}</dd></div>
          <div><dt>Semester instalments</dt><dd>{choice.perSemester !== null && choice.semesters !== null ? `${money(choice.perSemester)} × ${choice.semesters}` : "Not published for this category"}</dd></div>
          <div><dt>Application fee</dt><dd>{course.applicationFee ? `${course.applicationFee} listed; confirm whether it applies` : "Not verified; confirm if payable"}</dd></div>
          <div><dt>Exam, resit, convocation, taxes and processing</dt><dd>Not included here; confirm what applies</dd></div>
        </dl>
        {course.programDetails?.additionalCharges ? <details className="uvt-cost-details"><summary>Published note on other charges</summary><p>{course.programDetails.additionalCharges.scope}</p><ul>{course.programDetails.additionalCharges.points.map(point => <li key={point}>{point}</li>)}</ul><p className="uvt-source"><a href={course.programDetails.additionalCharges.sourceUrl} target="_blank" rel="noopener noreferrer">Check source</a> · checked {formatCheckedDate(course.programDetails.additionalCharges.checkedAt)}</p></details> : null}
        {choice.perSemester !== null && choice.semesters !== null && choice.semesters <= 12 && <details className="uvt-cost-details"><summary>See {choice.semesters}-semester tuition schedule</summary><ol>{Array.from({ length: choice.semesters }, (_, i) => <li key={i}>Semester {i + 1}: {money(choice.perSemester!)}</li>)}</ol></details>}
        {estimate?.scheduleDifference ? <p className="uvt-warning" role="note">The listed semester amounts sum to {money(estimate.scheduleTotal!)}; this differs from the listed total tuition by {money(Math.abs(estimate.scheduleDifference))}. Confirm the payable schedule with the university.</p> : null}
        {choice.sourceUrl ? <p className="uvt-source">Source: <a href={choice.sourceUrl} target="_blank" rel="noopener noreferrer">{sourceHost(choice.sourceUrl)}</a>{choice.checkedAt ? ` · checked ${formatCheckedDate(choice.checkedAt)}` : " · check the current fee"}</p> : <p className="uvt-source">No category-specific fee source is published for this selection.</p>}
        {choice.tuition !== null && <div className="uvt-cost-extra"><label htmlFor={`cost-extra-${course.id}`} className="uvt-label">Your allowance for other costs ({choice.currency === "USD" ? "US$" : "₹"})</label><input id={`cost-extra-${course.id}`} className="uvt-control" type="number" inputMode="numeric" min="0" max="10000000" step="1" value={extraRaw} aria-invalid={!extraValid} aria-describedby={`cost-extra-help-${course.id}`} onChange={event => setExtras(current => ({ ...current, [course.id]: event.target.value }))} /><p id={`cost-extra-help-${course.id}`} className="uvt-help-text">Optional amount you enter, in the same currency. We do not know which extra charges apply. {extraValid ? "" : "Enter a whole amount from 0 to 10,000,000."}</p></div>}
        {estimate ? <div className="uvt-cost-result" aria-live="polite"><span>Tuition + your allowance</span><strong>{money(estimate.planningSubtotal)}</strong><small>Planning subtotal only. Application and other mandatory charges are not verified or automatically included.</small></div> : choice.tuition !== null ? <p role="status" className="uvt-help-text">Enter a valid allowance to see the planning subtotal.</p> : null}
        <div className="uvt-cost-links"><Link href={`/courses/${course.slug}`} className="btn secondary">View course facts</Link><Link href={`/lead?course=${encodeURIComponent(course.id)}&intent=total-cost${choice.publishedCategory ? `&category=${encodeURIComponent(choice.key)}` : ""}`} rel="nofollow" className="btn primary" data-open-lead>Apply now</Link></div>
      </article>;
    })}</div>
    {selected.length > 0 && <div className="uvt-cost-bottom"><button type="button" className="btn secondary" onClick={() => window.print()}><Printer size={18} aria-hidden="true" />Print this fee view</button><p>Amounts and dates reflect the published catalog. Ask each university to confirm your exact applicant category, current tuition, payment schedule and all mandatory charges before paying.</p></div>}
  </div>;
}
