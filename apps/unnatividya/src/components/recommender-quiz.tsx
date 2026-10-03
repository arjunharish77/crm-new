"use client";
import { useCatalog } from "@/components/catalog-provider";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { trackEvent } from "@/components/analytics";
import { formatFee } from "@/lib/catalog-format";
import { type Course } from "@/data/catalog";

const questions = [
  { key: "level", title: "Which degree level are you exploring?", options: [["UG", "Undergraduate"], ["PG", "Postgraduate"], ["any", "Show both levels"]] },
  { key: "stream", title: "Which subject interests you?", options: [["Management", "Management & business"], ["IT & Computers", "IT & computer applications"], ["Commerce", "Commerce & finance"], ["Arts & Humanities", "Arts, media & humanities"], ["any", "Explore all subjects"]] },
  { key: "budget", title: "What is your total tuition budget?", options: [["100000", "Up to ₹1,00,000"], ["180000", "Up to ₹1,80,000"], ["any", "No budget limit yet"]] },
] as const;
type Key = typeof questions[number]["key"];
type Answers = Record<Key, string>;

export function RecommenderQuiz({ courses }: { courses: Course[] }) {
  const { courseWithUniversity } = useCatalog();
  const [index, setIndex] = useState(0);
  const [showResults, setShowResults] = useState(false);
  const [answers, setAnswers] = useState<Answers>({ level: "", stream: "", budget: "" });
  const heading = useRef<HTMLHeadingElement>(null);
  const initialRender = useRef(true);
  useEffect(() => {
    if (initialRender.current) { initialRender.current = false; return; }
    heading.current?.focus();
  }, [index, showResults]);
  const matches = courses.filter(course =>
    (answers.level === "any" || course.level === answers.level) &&
    (answers.stream === "any" || course.stream === answers.stream) &&
    (answers.budget === "any" || course.fee <= Number(answers.budget)))
    .sort((a, b) => a.fee - b.fee || a.id.localeCompare(b.id));
  const results = matches.slice(0, 3).map(courseWithUniversity);
  const question = questions[index];
  const filterParams = new URLSearchParams();
  if (answers.level && answers.level !== "any") filterParams.set("level", answers.level);
  if (answers.stream && answers.stream !== "any") filterParams.set("stream", answers.stream);
  if (answers.budget && answers.budget !== "any") filterParams.set("maxFee", answers.budget);

  function next() {
    trackEvent("recommender_step_answered", { step_index: index, question: question.key, answer: answers[question.key] });
    if (index < questions.length - 1) setIndex(index + 1);
    else { setShowResults(true); trackEvent("recommender_completed", { course_ids: matches.slice(0,3).map(course => course.id) }); }
  }
  function restart() { setAnswers({level:"",stream:"",budget:""}); setIndex(0); setShowResults(false); }

  return <section className="course-matcher">
    <header><h1>Find a course that fits your preferences</h1><p>Three questions. Free results, with no sign-up required.</p><p className="matcher-note">Matches use listed course data and your filters. They do not confirm eligibility, admission or class schedules.</p></header>
    {!showResults ? <div className="matcher-question">
      <p className="matcher-progress">Question {index + 1} of {questions.length}</p>
      <h2 ref={heading} tabIndex={-1} id="matcher-question-title">{question.title}</h2>
      <fieldset aria-labelledby="matcher-question-title"><legend className="sr-only">Choose one answer</legend>
        {question.options.map(([value,label]) => <label className="matcher-option" key={value}><input type="radio" name={question.key} value={value} checked={answers[question.key] === value} onChange={() => setAnswers(current => ({...current,[question.key]:value}))} />{label}</label>)}
      </fieldset>
      <div className="matcher-actions">{index > 0 && <button type="button" className="btn secondary" onClick={() => setIndex(index - 1)}>Back</button>}<button type="button" className="btn primary" disabled={!answers[question.key]} onClick={next}>{index === questions.length - 1 ? "Show matches" : "Continue"}</button></div>
    </div> : <div className="matcher-results">
      <h2 ref={heading} tabIndex={-1}>Your course matches</h2>
      <div className="matcher-answer-summary" aria-label="Your preferences">{questions.map((item,step) => <button type="button" key={item.key} className="btn secondary" onClick={() => {setIndex(step);setShowResults(false);}} aria-label={`Edit ${item.key}: ${item.options.find(([value]) => value === answers[item.key])?.[1]}`}>{item.options.find(([value]) => value === answers[item.key])?.[1]} · Edit</button>)}</div>
      {results.length ? <>
        <p>{matches.length} programs match your filters. Showing {results.length}, ordered by lowest listed tuition. This is not a quality ranking.</p>
        <div className="matcher-course-list">{results.map(course => <article className="matcher-course" key={course.id}>
          <h3>{course.name} — {course.university.name}</h3>
          <p>{course.level === "UG" ? "Undergraduate" : "Postgraduate"} · {course.stream} · {course.duration}</p>
          <p><strong>{formatFee(course.fee)}</strong> listed total tuition</p>
          <p className="matcher-note">Matches the level, subject and budget filters you selected. Check the course page for eligibility and current fee details.</p>
          <div className="matcher-actions"><Link href={`/courses/${course.slug}`} className="btn secondary">View course</Link><Link href={`/lead?course=${course.id}&intent=recommender`} className="btn primary" data-open-lead>Apply now</Link></div>
        </article>)}</div>
        <div className="matcher-actions">{results.length >= 2 && <Link href={`/compare?add=${results.map(course => course.id).join(",")}`} className="btn secondary">Compare these {results.length}</Link>}<Link href={`/courses?${filterParams}`} className="btn secondary">View all {matches.length} matches</Link></div>
      </> : <div className="illustrated-empty-state"><h3>No courses match all three preferences</h3><p>Try a different subject, degree level or budget using the edit buttons above. We have not substituted courses outside your filters.</p><Link href="/courses" className="btn secondary">Browse all courses</Link></div>}
      <button type="button" className="btn ghost" onClick={restart}>Start again</button>
    </div>}
  </section>;
}
