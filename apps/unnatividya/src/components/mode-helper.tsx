"use client";

import Link from "next/link";
import { useState } from "react";
import { CircleCheck, ExternalLink } from "lucide-react";
import { ASSESSMENT, EQUIVALENCE, MODE_QUESTIONS, STUDY_MODES, UGC_REGULATIONS_2020, allAnswered, evaluateModes, type ModeAnswers, type ModeFit } from "@/lib/study-modes";
import { formatCheckedDate } from "@/lib/source-checks";

const FIT_LABEL: Record<ModeFit, string> = { fits: "Fits your answers", possible: "Possible, with the points below", unlikely: "Less likely to fit" };
const FIT_TONE: Record<ModeFit, string> = { fits: "is-success", possible: "is-neutral", unlikely: "is-warning" };

// Wave 5 B2: four questions, answered in any order; the result appears once all four are answered.
// Answers stay in this page only. Modes are grouped by fit and never ranked within a group.
export function ModeHelper() {
  const [answers, setAnswers] = useState<ModeAnswers>({});
  const done = allAnswered(answers);
  const results = done ? evaluateModes(answers) : [];

  return <div className="uvt-mode">
    <form className="uvt-mode-questions" onSubmit={event => event.preventDefault()} aria-label="Your situation">
      {MODE_QUESTIONS.map((question, index) => <fieldset key={question.id} className="uvt-mode-question">
        <legend><span className="uvt-mode-num" aria-hidden="true">{index + 1}</span>{question.title}</legend>
        <div className="uvt-options uvt-mode-options">
          {question.options.map(option => {
            const selected = answers[question.id] === option.value;
            return <button type="button" key={option.value} className="uvt-option" aria-pressed={selected} onClick={() => setAnswers(current => ({ ...current, [question.id]: option.value }))}>
              <span className="uvt-option-text"><span className="uvt-option-label">{option.label}</span><span className="uvt-option-sub">{option.sub}</span></span>
              <CircleCheck size={22} className="uvt-option-check" aria-hidden="true" />
            </button>;
          })}
        </div>
      </fieldset>)}
    </form>

    <section className="uvt-card uvt-mode-result" aria-labelledby="mode-result-title" aria-live="polite">
      <h2 id="mode-result-title" className="uvt-h2-sm">What fits your answers</h2>
      {!done ? <p className="uvt-help-text">Answer all four questions to see how each mode fits. {Object.keys(answers).length} of {MODE_QUESTIONS.length} answered.</p> : <>
        <ul className="uvt-mode-cards">
          {(["fits", "possible", "unlikely"] as ModeFit[]).flatMap(fit => results.filter(result => result.fit === fit)).map(result => {
            const mode = STUDY_MODES[result.mode];
            return <li key={result.mode} className="uvt-mode-card" data-fit={result.fit}>
              <div className="uvt-mode-card-head"><h3>{mode.name}</h3><span className={`uvt-status ${FIT_TONE[result.fit]}`}>{FIT_LABEL[result.fit]}</span></div>
              {result.reasons.length ? <ul className="uvt-mode-reasons">{result.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul> : null}
              <dl className="uvt-mode-facts">
                <div><dt>What it is</dt><dd>{mode.definition}</dd></div>
                <div><dt>How you study</dt><dd>{mode.teaching}</dd></div>
                <div><dt>Exams</dt><dd>{mode.exams}</dd></div>
              </dl>
              <p className="uvt-source">{mode.regulations}, UGC 2020 regulations</p>
            </li>;
          })}
        </ul>
        <p className="uvt-mode-equal">{EQUIVALENCE} Check that the program is recognised in the mode you choose, for your session.</p>
        <p className="uvt-help-text">{ASSESSMENT}</p>
        <div className="uvt-mode-actions">
          <Link href="/courses" className="btn secondary">Browse online programs</Link>
          <Link href="/tools/recognition-check" className="btn secondary">Check a program&apos;s recognition</Link>
          <Link href="/lead?intent=mode-helper" rel="nofollow" data-open-lead className="btn primary">Apply now</Link>
        </div>
        <button type="button" className="uvt-text-btn" onClick={() => setAnswers({})}>Start again</button>
      </>}
      <p className="uvt-source">Source: <a href={UGC_REGULATIONS_2020.url} target="_blank" rel="noopener noreferrer" className="uv-link">{UGC_REGULATIONS_2020.label}<ExternalLink size={13} aria-hidden="true" /><span className="sr-only"> (opens in a new tab)</span></a> · read {formatCheckedDate(UGC_REGULATIONS_2020.checkedAt)}</p>
    </section>
  </div>;
}
