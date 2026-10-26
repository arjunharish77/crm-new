"use client";

import Link from "next/link";
import { useState } from "react";
import { useCatalog } from "@/components/catalog-provider";
import { applicantCategories, applicantLabels, evaluateEligibility, qualificationLabels, qualificationRoutes, type EligibilityAnswers, type EligibilityResult } from "@/lib/eligibility-rules";
import { formatCheckedDate, sourceHost } from "@/lib/source-checks";

const resultTone = { matches: "is-success", confirm: "is-warning", does_not_meet: "is-error" } as const;
const resultLabel = { matches: "Matches published academic criteria", confirm: "Needs university confirmation", does_not_meet: "Does not meet the selected published criteria" } as const;

function ResultCard({ course, result, featured = false }: { course: ReturnType<ReturnType<typeof useCatalog>["courseWithUniversity"]>; result: EligibilityResult; featured?: boolean }) {
  return <article className={`uvt-elig-result is-${result.outcome}${featured ? " is-featured" : ""}`}>
    <div className="uvt-elig-head"><div><h3>{course.name}</h3><p>{course.university.name}</p></div><span className={`uvt-status ${resultTone[result.outcome]}`}>{resultLabel[result.outcome]}</span></div>
    <ul className="uvt-elig-reasons">{result.reasons.map((reason, index) => <li key={`${index}-${reason}`}>{reason}</li>)}</ul>
    {result.sourceUrl ? <p className="uvt-source">Rule source: <a href={result.sourceUrl} target="_blank" rel="noopener noreferrer">{sourceHost(result.sourceUrl)}</a>{result.checkedAt ? ` · checked ${formatCheckedDate(result.checkedAt)}` : ""}</p> : <p className="uvt-source">No structured eligibility rule has been published for this course.</p>}
    <p className="uvt-help-text">The university checks your documents and makes the final admission decision. This result is a screening aid.</p>
    <div className="uvt-elig-actions"><Link className="btn secondary" href={`/courses/${course.slug}#sec-eligibility`}>Read course eligibility</Link><Link className="btn primary" href={`/lead?course=${encodeURIComponent(course.id)}&intent=eligibility-checker`} rel="nofollow" data-open-lead>Apply now</Link></div>
  </article>;
}

export function EligibilityChecker({ initialCourseId = "" }: { initialCourseId?: string }) {
  const { courses, courseWithUniversity } = useCatalog();
  const all = courses.map(courseWithUniversity).sort((a, b) => a.name.localeCompare(b.name) || a.university.name.localeCompare(b.university.name));
  const [courseId, setCourseId] = useState(() => all.some(course => course.id === initialCourseId) ? initialCourseId : "");
  const [category, setCategory] = useState<EligibilityAnswers["category"]>("indian");
  const [qualification, setQualification] = useState<EligibilityAnswers["qualification"]>("class12");
  const [recognisedInstitution, setRecognisedInstitution] = useState<EligibilityAnswers["recognisedInstitution"]>("unsure");
  const [marks, setMarks] = useState("");
  const [reservedCategory, setReservedCategory] = useState<EligibilityAnswers["reservedCategory"]>("unsure");
  const [educationOutsideIndia, setEducationOutsideIndia] = useState<EligibilityAnswers["educationOutsideIndia"]>("unsure");
  const [aiuEquivalence, setAiuEquivalence] = useState<EligibilityAnswers["aiuEquivalence"]>("unsure");
  const [checked, setChecked] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const selected = all.find(course => course.id === courseId);
  const needsMarks = !selected?.eligibilityRules || Object.values(selected.eligibilityRules.categories).some(rule => rule?.minimum !== null && rule?.minimum !== undefined);
  const marksNumber = marks.trim() === "" ? null : Number(marks);
  const marksValid = !needsMarks || marksNumber === null || Number.isFinite(marksNumber) && marksNumber >= 0 && marksNumber <= 100;
  const answers: EligibilityAnswers = { category, qualification, recognisedInstitution, marks: needsMarks && marksValid ? marksNumber : null, reservedCategory, educationOutsideIndia, aiuEquivalence };
  const publishedRuleCount = all.filter(course => course.eligibilityRules).length;
  const result = selected && checked && marksValid ? evaluateEligibility(selected.eligibilityRules, answers) : null;
  const otherResults = showAll && checked && marksValid ? all.filter(course => course.id !== courseId).map(course => ({ course, result: evaluateEligibility(course.eligibilityRules, answers) })) : [];
  const otherReviewed = otherResults.filter(item => item.course.eligibilityRules);
  const otherUnreviewed = otherResults.filter(item => !item.course.eligibilityRules);
  return <div className="uvt-elig">
    <form className="uvt-panel uvt-elig-form" onSubmit={event => { event.preventDefault(); setChecked(true); setShowAll(false); }}>
      <div className="uvt-elig-intro"><h2 className="uvt-panel-title">Check your academic profile</h2><p>Answer from your own records. Nothing is sent or saved; use the result to prepare a question for the university.</p><p>{publishedRuleCount} of {all.length} programs currently have a structured rule in the published catalog. Courses without one return “Needs university confirmation.”</p></div>
      <div className="uvt-elig-fields">
        <div className="uvt-field"><label htmlFor="eligibility-course">Program</label><select id="eligibility-course" className="uvt-control" value={courseId} required onChange={event => { setCourseId(event.target.value); setChecked(false); }}><option value="">Choose a program</option>{all.map(course => <option key={course.id} value={course.id}>{course.name} — {course.university.shortName}</option>)}</select></div>
        <div className="uvt-field"><label htmlFor="eligibility-category">Applicant category</label><select id="eligibility-category" className="uvt-control" value={category} onChange={event => setCategory(event.target.value as EligibilityAnswers["category"])}>{applicantCategories.map(value => <option key={value} value={value}>{applicantLabels[value]}</option>)}</select></div>
        <div className="uvt-field"><label htmlFor="eligibility-qualification">Qualification route for this application</label><select id="eligibility-qualification" className="uvt-control" value={qualification} onChange={event => setQualification(event.target.value as EligibilityAnswers["qualification"])}>{qualificationRoutes.map(value => <option key={value} value={value}>{qualificationLabels[value]}</option>)}</select></div>
        <div className="uvt-field"><label htmlFor="eligibility-recognised">Is the awarding institution recognised?</label><select id="eligibility-recognised" className="uvt-control" value={recognisedInstitution} onChange={event => setRecognisedInstitution(event.target.value as EligibilityAnswers["recognisedInstitution"])}><option value="unsure">I need to check</option><option value="yes">Yes, to my knowledge</option><option value="no">No / I cannot confirm it</option></select></div>
        {needsMarks ? <div className="uvt-field"><label htmlFor="eligibility-marks">{selected?.level === "UG" ? "Class 12 or diploma aggregate (%)" : "Graduation aggregate (%)"}</label><input id="eligibility-marks" className="uvt-control" type="number" inputMode="decimal" min="0" max="100" step="0.01" value={marks} aria-invalid={!marksValid} aria-describedby="eligibility-marks-hint" onChange={event => setMarks(event.target.value)} /><small id="eligibility-marks-hint" className="uvt-help-text">Leave blank for CGPA or if you do not know your converted percentage. The result will ask for confirmation where a minimum applies.</small></div> : null}
        <div className="uvt-field"><label htmlFor="eligibility-reserved">Reserved category for this university&apos;s admission rule?</label><select id="eligibility-reserved" className="uvt-control" value={reservedCategory} onChange={event => setReservedCategory(event.target.value as EligibilityAnswers["reservedCategory"])}><option value="unsure">Not sure</option><option value="no">No</option><option value="yes">Yes, subject to university verification</option></select></div>
        <div className="uvt-field"><label htmlFor="eligibility-abroad">Was your qualifying education completed outside India?</label><select id="eligibility-abroad" className="uvt-control" value={educationOutsideIndia} onChange={event => setEducationOutsideIndia(event.target.value as EligibilityAnswers["educationOutsideIndia"])}><option value="unsure">Not sure</option><option value="no">No</option><option value="yes">Yes</option></select></div>
        {educationOutsideIndia === "yes" ? <div className="uvt-field"><label htmlFor="eligibility-aiu">Do you have an AIU equivalence certificate?</label><select id="eligibility-aiu" className="uvt-control" value={aiuEquivalence} onChange={event => setAiuEquivalence(event.target.value as EligibilityAnswers["aiuEquivalence"])}><option value="unsure">Not sure / applying for one</option><option value="no">No</option><option value="yes">Yes</option></select></div> : null}
      </div>
      {!marksValid ? <p role="alert" className="uvt-error">Enter a percentage from 0 to 100, or leave it blank.</p> : null}
      <button type="submit" className="btn primary large" disabled={!courseId || !marksValid}>Check published criteria</button>
    </form>
    {result && selected ? <section className="uvt-elig-results" aria-labelledby="eligibility-result-title">
      <h2 id="eligibility-result-title" className="uvt-h2-sm">Your screening result</h2><div aria-live="polite"><ResultCard course={selected} result={result} featured /></div>
      <button type="button" className="btn secondary" onClick={() => setShowAll(current => !current)}>{showAll ? "Hide other programs" : `Check the same answers against ${all.length - 1} other programs`}</button>
      {showAll ? <div className="uvt-elig-other"><p className="uvt-help-text">Only reviewed rules can produce a criteria result. This list is not an admission offer or a ranking.</p>
        <h3>Programs with reviewed rules ({otherReviewed.length})</h3>
        {otherReviewed.length ? <ul className="uvt-elig-list">{otherReviewed.map(item => <li key={item.course.id}><div><Link href={`/courses/${item.course.slug}#sec-eligibility`}>{item.course.name} — {item.course.university.shortName}</Link><small>{item.result.reasons[0]}</small></div><strong className={`uvt-status ${resultTone[item.result.outcome]}`}>{resultLabel[item.result.outcome]}</strong></li>)}</ul> : <p>No other course has a published structured rule yet.</p>}
        {otherUnreviewed.length ? <details className="uvt-cost-details"><summary>{otherUnreviewed.length} programs awaiting reviewed rules</summary><p>These all return “Needs university confirmation.”</p><ul>{otherUnreviewed.map(item => <li key={item.course.id}><Link href={`/courses/${item.course.slug}#sec-eligibility`}>{item.course.name} — {item.course.university.shortName}</Link></li>)}</ul></details> : null}
      </div> : null}
    </section> : null}
  </div>;
}
