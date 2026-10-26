"use client";

import Link from "next/link";
import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { useCatalog } from "@/components/catalog-provider";
import { recognitionSummary } from "@/lib/program-facts";
import { formatCheckedDate, sourceHost } from "@/lib/source-checks";

// Wave 4 A2 (decision W2): shows only the recognition result published in the CMS for each program.
// Until an administrator applies the reviewed 2026-27 proposals, a program reads "being re-checked".
// A result is per program and per session, never a blanket statement about the university.
export function RecognitionCheck({ initialCourseId }: { initialCourseId: string }) {
  const { courses, courseWithUniversity } = useCatalog();
  const all = courses.map(courseWithUniversity).sort((a, b) => a.name.localeCompare(b.name) || a.university.shortName.localeCompare(b.university.shortName));
  const [courseId, setCourseId] = useState(all.some(course => course.id === initialCourseId) ? initialCourseId : "");
  const selected = all.find(course => course.id === courseId);
  const summary = selected ? recognitionSummary(selected) : null;
  const recognition = summary?.recognition || null;
  const tone = !recognition ? "is-neutral" : recognition.status === "listed" ? "is-success" : "is-warning";
  const label = !recognition ? "Being re-checked for 2026-27" : recognition.status === "listed" ? `Listed for ${recognition.academicYear}` : "Confirm the awarding university";

  return <div className="uvt-recog">
    <section className="uvt-card uvt-recog-form" aria-labelledby="recognition-form-title">
      <h2 id="recognition-form-title" className="uvt-h2-sm">Choose a program</h2>
      <div className="uvt-field">
        <label htmlFor="recognition-course">Program</label>
        <select id="recognition-course" className="uvt-control" value={courseId} onChange={event => setCourseId(event.target.value)}>
          <option value="">Choose a program</option>
          {all.map(course => <option key={course.id} value={course.id}>{course.name} — {course.university.shortName}</option>)}
        </select>
      </div>
    </section>

    <section className="uvt-card uvt-recog-result" aria-labelledby="recognition-result-title" aria-live="polite">
      <h2 id="recognition-result-title" className="uvt-h2-sm">{selected ? `${selected.name} — ${selected.university.name}` : "Result"}</h2>
      {selected && summary ? <>
        <p><span className={`uvt-status ${tone}`}>{label}</span></p>
        <p className="uvt-recog-answer">{summary.answer}</p>
        {recognition ? <dl className="uvt-recog-facts">
          <div><dt>List</dt><dd>{recognition.listName}</dd></div>
          <div><dt>Listed under</dt><dd>{recognition.listedUnder}</dd></div>
          {recognition.listedProgramme ? <div><dt>Programme as printed</dt><dd>{recognition.listedProgramme}</dd></div> : null}
          <div><dt>Checked</dt><dd>{formatCheckedDate(recognition.checkedAt)}</dd></div>
          <div><dt>Source</dt><dd><a href={recognition.sourceUrl} target="_blank" rel="noopener noreferrer" className="uv-link">{sourceHost(recognition.sourceUrl)} <ExternalLink size={14} aria-hidden="true" /><span className="sr-only"> (opens in a new tab)</span></a></dd></div>
        </dl> : <p className="uvt-help-text"><a href="#recognition-steps-title" className="uv-link">How to check it yourself ↓</a></p>}
        <div className="uvt-recog-actions">
          <Link href={`/courses/${selected.slug}#sec-recognition`} className="btn secondary">View the program</Link>
          <Link href={`/lead?intent=recognition-check&course=${encodeURIComponent(selected.id)}`} rel="nofollow" data-open-lead className="btn primary">Apply now</Link>
        </div>
      </> : <p className="uvt-help-text">Choose a program to see its published 2026-27 result, the source and the date we checked it.</p>}
    </section>
  </div>;
}
