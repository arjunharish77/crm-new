"use client";

import Link from "next/link";
import { useState } from "react";
import { CircleCheck } from "lucide-react";
import { CAREER_AREAS, matchArea, type FinderProgram, type FinderSpecialization } from "@/lib/specialization-finder";

// Wave 5 B5: pick a career area (and optionally a level); see the specializations and programs whose
// listed names match it. The choice stays in this page.
export function SpecializationFinder({ specializations, programs }: { specializations: FinderSpecialization[]; programs: FinderProgram[] }) {
  const [areaId, setAreaId] = useState("");
  const [level, setLevel] = useState("");
  const area = CAREER_AREAS.find(item => item.id === areaId);
  const result = area ? matchArea(area, specializations, programs, level) : null;

  return <div className="uvt-finder">
    <section className="uvt-card" aria-labelledby="finder-area-title">
      <h2 id="finder-area-title" className="uvt-h2-sm">1. Choose a career area</h2>
      <div className="uvt-options uvt-finder-areas" role="group" aria-labelledby="finder-area-title">
        {CAREER_AREAS.map(item => <button type="button" key={item.id} className="uvt-option" aria-pressed={item.id === areaId} onClick={() => setAreaId(item.id)}>
          <span className="uvt-option-text"><span className="uvt-option-label">{item.label}</span></span>
          <CircleCheck size={20} className="uvt-option-check" aria-hidden="true" />
        </button>)}
      </div>
      <div className="uvt-field uvt-finder-level">
        <label htmlFor="finder-level">2. Level (optional)</label>
        <select id="finder-level" className="uvt-control" value={level} onChange={event => setLevel(event.target.value)}>
          <option value="">Bachelor&apos;s and master&apos;s</option>
          <option value="UG">Bachelor&apos;s (after Class 12)</option>
          <option value="PG">Master&apos;s (after a degree)</option>
        </select>
      </div>
    </section>

    <section className="uvt-card uvt-finder-result" aria-labelledby="finder-result-title" aria-live="polite">
      <h2 id="finder-result-title" className="uvt-h2-sm">{area ? area.label : "Matches"}</h2>
      {!result ? <p className="uvt-help-text">Choose a career area to see the specializations and programs whose names match it.</p> : <>
        <h3 className="uvt-finder-h3">Specializations <span>{result.specializations.length}</span></h3>
        {result.specializations.length ? <ul className="uvt-finder-list">
          {result.specializations.map(item => <li key={item.slug}>
            <Link href={`/specializations/${item.slug}`}><strong>{item.specialization}</strong><span>{item.courseLabel} · {item.universities.join(", ")}</span></Link>
          </li>)}
        </ul> : <p className="uvt-help-text">No specialization at this level has a name that matches this area.</p>}
        <h3 className="uvt-finder-h3">Programs that list related roles <span>{result.programs.length}</span></h3>
        {result.programs.length ? <ul className="uvt-finder-list">
          {result.programs.map(item => <li key={item.slug}>
            <Link href={`/courses/${item.slug}#sec-careers`}><strong>{item.name} · {item.university}</strong><span>{item.roles.join(", ")}</span></Link>
          </li>)}
        </ul> : <p className="uvt-help-text">No program at this level lists a role that matches this area.</p>}
        <p className="uvt-source">Matched by the names the universities give their specializations and the career roles they list. This doesn&apos;t rank programs or predict jobs; check the curriculum on each page.</p>
        <div className="uvt-mode-actions">
          <Link href="/recommender" className="btn secondary">Find programs that fit you</Link>
          <Link href={`/lead?intent=specialization-finder`} rel="nofollow" data-open-lead className="btn primary">Apply now</Link>
        </div>
      </>}
    </section>
  </div>;
}
