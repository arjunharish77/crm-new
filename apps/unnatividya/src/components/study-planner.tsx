"use client";

import Link from "next/link";
import { useState } from "react";
import { Printer } from "lucide-react";
import { COMMITMENTS, DAYS, HOURS_IN_WEEK, formatHours, planWeek, type PlannerInput } from "@/lib/study-planner";

// Wave 5 B3: everything stays in this page (no storage, nothing sent). The plan is the learner's
// own; the page never states a university's expected weekly hours.
export function StudyPlanner() {
  const [input, setInput] = useState<PlannerInput>({ commitments: {}, target: "", days: {} });
  const result = planWeek(input);
  const setCommitment = (id: string, value: string) => setInput(current => ({ ...current, commitments: { ...current.commitments, [id]: value } }));
  const setDay = (day: string, value: string) => setInput(current => ({ ...current, days: { ...current.days, [day]: value } }));

  return <div className="uvt-plan">
    <div className="uvt-plan-grid">
      <section className="uvt-card" aria-labelledby="plan-week-title">
        <h2 id="plan-week-title" className="uvt-h2-sm">1. Your week now</h2>
        <p className="uvt-help-text">Hours in a typical week. Leave anything that doesn&apos;t apply empty.</p>
        <div className="uvt-plan-fields">
          {COMMITMENTS.map(item => <div key={item.id} className="uvt-field">
            <label htmlFor={`plan-${item.id}`}>{item.label}</label>
            <input id={`plan-${item.id}`} className="uvt-control" type="number" inputMode="decimal" min={0} max={HOURS_IN_WEEK} step={0.5} value={input.commitments[item.id] ?? ""} onChange={event => setCommitment(item.id, event.target.value)} aria-describedby={`plan-${item.id}-help`} />
            <p id={`plan-${item.id}-help`} className="uvt-help-text">{item.help}</p>
          </div>)}
        </div>
      </section>

      <section className="uvt-card" aria-labelledby="plan-study-title">
        <h2 id="plan-study-title" className="uvt-h2-sm">2. Your study plan</h2>
        <div className="uvt-field">
          <label htmlFor="plan-target">Study goal for the week (hours)</label>
          <input id="plan-target" className="uvt-control" type="number" inputMode="decimal" min={0} max={HOURS_IN_WEEK} step={0.5} value={input.target} onChange={event => setInput(current => ({ ...current, target: event.target.value }))} aria-describedby="plan-target-help" />
          <p id="plan-target-help" className="uvt-help-text">Ask the university how many hours a week your program expects, and use that here.</p>
        </div>
        <fieldset className="uvt-plan-days">
          <legend>Hours you plan to study each day</legend>
          {DAYS.map(day => <div key={day} className="uvt-plan-day">
            <label htmlFor={`plan-day-${day}`}>{day}</label>
            <input id={`plan-day-${day}`} className="uvt-control" type="number" inputMode="decimal" min={0} max={24} step={0.5} value={input.days[day] ?? ""} onChange={event => setDay(day, event.target.value)} />
          </div>)}
        </fieldset>
      </section>
    </div>

    <section className="uvt-card uvt-plan-result" aria-labelledby="plan-result-title" aria-live="polite">
      <h2 id="plan-result-title" className="uvt-h2-sm">Your week, added up</h2>
      {result.errors.length ? <ul className="uvt-plan-errors">{result.errors.map(error => <li key={error} className="uvt-error">{error}</li>)}</ul> : null}
      {!result.ready ? <p className="uvt-help-text">Enter your sleep and at least one other commitment to see the hours left for study.</p> : <>
        <dl className="uvt-plan-figures">
          <div><dt>Committed</dt><dd>{formatHours(result.committed)}</dd></div>
          <div><dt>Free in the week</dt><dd>{formatHours(result.free)}</dd></div>
          <div><dt>Planned study</dt><dd>{formatHours(result.planned)}</dd></div>
          <div><dt>Free after study</dt><dd>{formatHours(result.leftAfterStudy)}</dd></div>
        </dl>
        <div className="uvt-plan-bar" aria-hidden="true">
          <span className="is-committed" style={{ width: `${Math.min(100, (result.committed / HOURS_IN_WEEK) * 100)}%` }} />
          <span className="is-study" style={{ width: `${Math.min(100 - Math.min(100, (result.committed / HOURS_IN_WEEK) * 100), (result.planned / HOURS_IN_WEEK) * 100)}%` }} />
        </div>
        <p className="uvt-plan-summary">
          {result.leftAfterStudy < 0
            ? `Your plan needs ${formatHours(-result.leftAfterStudy)} more than your free time. Reduce the study hours or look again at your commitments.`
            : result.target === null
              ? `You have ${formatHours(result.free)} free in a typical week.`
              : result.targetGap !== null && result.targetGap > 0
                ? `Your daily plan is ${formatHours(result.targetGap)} short of your goal of ${formatHours(result.target)}.`
                : `Your daily plan covers your goal of ${formatHours(result.target)}.`}
        </p>
        {result.planned > 0 ? <table className="uvt-plan-table">
          <caption className="sr-only">Planned study hours by day</caption>
          <thead><tr><th scope="col">Day</th><th scope="col">Study</th></tr></thead>
          <tbody>{result.dayHours.map(item => <tr key={item.day}><th scope="row">{item.day}</th><td>{item.hours ? formatHours(item.hours) : "—"}</td></tr>)}</tbody>
        </table> : null}
        <div className="uvt-plan-actions">
          <button type="button" className="btn secondary" onClick={() => window.print()}><Printer size={18} aria-hidden="true" />Print my plan</button>
          <Link href="/lead?intent=study-planner" rel="nofollow" data-open-lead className="btn primary">Apply now</Link>
        </div>
      </>}
      <p className="uvt-source">Online programs under UGC&apos;s 2020 regulations need at least 75% participation in the program&apos;s online activities before each end-semester exam (regulation 15(A)(3)). <Link href="/tools/mode-helper" className="uv-link">How the study modes differ</Link></p>
    </section>
  </div>;
}
