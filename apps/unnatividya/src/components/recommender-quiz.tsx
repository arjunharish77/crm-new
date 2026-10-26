"use client";
import { useCatalog } from "@/components/catalog-provider";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  ArrowLeft, ArrowLeftRight, ArrowRight, Award, BadgeCheck, Bookmark, BookmarkCheck, CircleCheck, CircleHelp, Clock, Compass, Database,
  ExternalLink, GraduationCap, Headset, Infinity as InfinityIcon, Layers, ListFilter, PiggyBank, RotateCcw, Route, Scale, School, Sparkles, Tag, Wallet,
  type LucideIcon,
} from "lucide-react";
import { trackEvent } from "@/components/analytics";
import { CourseCard, STREAM_ICONS } from "@/components/course-card";
import { universityMedia } from "@/data/media";
import { formatFee } from "@/lib/catalog-format";
import { recognitionSummary } from "@/lib/program-facts";
import { isCompleteEligibilityRule } from "@/lib/eligibility-rules";
import { matchingCourses, sortMatches, type RecommenderAnswers } from "@/lib/recommender-matching";
import { matchRingColor, matchScore } from "@/lib/recommender-match-score";
import type { FollowupContext } from "@/lib/recommender-followup";
import { publicSourceUrls, sourceHost } from "@/lib/source-checks";
import { useShortlist } from "@/lib/use-shortlist";
import { type Course } from "@/data/catalog";
import { FeeGroupSwitch, GroupEmiText, GroupFeeText } from "@/components/fee-group";

type Option = { value: string; label: string; sub: string; icon: LucideIcon };
type Question = { key: keyof RecommenderAnswers; title: string; sub: string; journey: string; options: Option[] };

// The five hard-filter questions (increment 81) in the design's option-card style (Recommender.dc.html).
// Option labels and values are unchanged; the sub-labels and icons are presentation only.
const questions: Question[] = [
  { key: "level", title: "Which degree level are you exploring?", sub: "This decides whether we show undergraduate or postgraduate degrees.", journey: "Degree level", options: [
    { value: "UG", label: "Undergraduate", sub: "BBA, BCA, B.Com and BA programs", icon: GraduationCap },
    { value: "PG", label: "Postgraduate", sub: "MBA, MCA, M.Com, MSc and MA programs", icon: Award },
    { value: "any", label: "Show both levels", sub: "Undergraduate and postgraduate", icon: Layers },
  ] },
  { key: "qualification", title: "Have you completed a bachelor's degree?", sub: "Postgraduate programs need a completed bachelor's degree.", journey: "Bachelor's degree", options: [
    { value: "bachelors", label: "Yes", sub: "I have completed graduation", icon: BadgeCheck },
    { value: "school", label: "Not yet", sub: "Shows undergraduate programs only", icon: School },
    { value: "unsure", label: "Prefer not to say", sub: "No filter; confirm entry rules on each course", icon: CircleHelp },
  ] },
  { key: "stream", title: "Which subject interests you?", sub: "Pick the field closest to your career goal.", journey: "Subject", options: [
    { value: "Management", label: "Management & business", sub: "MBA, BBA", icon: STREAM_ICONS.Management },
    { value: "IT & Computers", label: "IT & computer applications", sub: "BCA, MCA, MSc", icon: STREAM_ICONS["IT & Computers"] },
    { value: "Commerce", label: "Commerce & finance", sub: "B.Com, M.Com", icon: STREAM_ICONS.Commerce },
    { value: "Arts & Humanities", label: "Arts, media & humanities", sub: "BA, MA", icon: STREAM_ICONS["Arts & Humanities"] },
    { value: "any", label: "Explore all subjects", sub: "Show every subject", icon: Compass },
  ] },
  { key: "budget", title: "What is your total tuition budget?", sub: "Listed tuition for the full program, before any extra charges.", journey: "Tuition budget", options: [
    { value: "100000", label: "Up to ₹1,00,000", sub: "Programs listed at ₹1 lakh or less", icon: PiggyBank },
    { value: "180000", label: "Up to ₹1,80,000", sub: "Programs listed at ₹1.8 lakh or less", icon: Wallet },
    { value: "any", label: "No budget limit yet", sub: "Show every listed fee", icon: InfinityIcon },
  ] },
  { key: "priority", title: "What matters most when comparing options?", sub: "This sets the order and part of the match score.", journey: "What matters most", options: [
    { value: "cost", label: "Lower listed tuition", sub: "Lower total tuition first", icon: Tag },
    { value: "duration", label: "Shorter listed duration", sub: "Shorter programs first", icon: Clock },
    { value: "balanced", label: "Show a balanced shortlist", sub: "Weigh tuition and duration equally", icon: Scale },
  ] },
];
type Key = Question["key"];
type Answers = Record<Key, string>;
type Suggestion = { courseId: string; reasons: string[]; source: { url: string; label: string } | null };
type Response = { mode: "ai" | "standard"; reason?: string; suggestions: Suggestion[] };
type ChatTurn = { question: string; answer: string; sources: Array<{ label: string; url: string }>; context: FollowupContext | null; mode: "ai" | "standard" };
const exampleQuestions = ["How do the fees compare?", "What are the entry requirements?", "Are these programs recognised?", "What about NRI fees?"];
const emptyAnswers: Answers = { level: "", qualification: "", stream: "", budget: "", priority: "" };
const TRUST: Array<[LucideIcon, string, string]> = [
  [ListFilter, "Your filters first", "Only programs that pass all five answers"],
  [Database, "Published catalog only", "Listed fees with source links"],
  [Sparkles, "AI is optional", "Standard order if AI is unavailable"],
];

function optionLabel(question: Question, value: string) {
  return question.options.find(option => option.value === value)?.label || "—";
}

function recognitionTag(course: { recognition?: Parameters<typeof recognitionSummary>[0]["recognition"] }) {
  const chip = recognitionSummary(course).chip;
  return { text: chip.charAt(0).toUpperCase() + chip.slice(1), tone: course.recognition?.status === "listed" ? "success" : course.recognition ? "warning" : "neutral" };
}

function SaveToggle({ courseId, label }: { courseId: string; label: string }) {
  const { isSaved, toggle } = useShortlist();
  const saved = isSaved(courseId);
  const Icon = saved ? BookmarkCheck : Bookmark;
  return <button type="button" className="btn secondary" aria-pressed={saved} aria-label={`${saved ? "Saved" : "Save"}: ${label}`} onClick={() => toggle(courseId)}>
    <Icon size={16} aria-hidden="true" />{saved ? "Saved" : "Save"}
  </button>;
}

export function RecommenderQuiz({ courses }: { courses: Course[] }) {
  const { courseWithUniversity } = useCatalog();
  const [index, setIndex] = useState(0);
  const [showResults, setShowResults] = useState(false);
  const [answers, setAnswers] = useState<Answers>(emptyAnswers);
  const [response, setResponse] = useState<Response | null>(null);
  const [loading, setLoading] = useState(false);
  const [requestFailed, setRequestFailed] = useState(false);
  const pending = useRef<AbortController | null>(null);
  const chatPending = useRef<AbortController | null>(null);
  const [chatQuestion, setChatQuestion] = useState("");
  const [chatHistory, setChatHistory] = useState<ChatTurn[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const initialRender = useRef(true);
  const restoredFromUrl = useRef(false);
  useEffect(() => {
    if (initialRender.current) { initialRender.current = false; return; }
    // Results restored from a shared link appear without moving focus away from the page start.
    if (restoredFromUrl.current) { restoredFromUrl.current = false; return; }
    heading.current?.focus();
  }, [index, showResults]);
  useEffect(() => () => { pending.current?.abort(); chatPending.current?.abort(); }, []);

  const selections = answers as RecommenderAnswers;
  const matches = sortMatches(matchingCourses(courses, selections), selections.priority);
  const fallback = matches.slice(0, 3).map(course => ({ course: courseWithUniversity(course), suggestion: null as Suggestion | null }));
  const resultRows = response?.suggestions.map(suggestion => {
    const course = matches.find(item => item.id === suggestion.courseId);
    return course ? { course: courseWithUniversity(course), suggestion } : null;
  }).filter((item): item is NonNullable<typeof item> => item !== null) || fallback;
  // Q9a: the match percentage sits beside the order. AI-ordered results keep Groq's order; the
  // standard fallback (no AI order) is shown by score, ties keeping the filter order.
  const scored = (resultRows.length ? resultRows : fallback).map((row, position) => ({ ...row, score: matchScore(row.course, selections, matches), position }));
  const results = response?.mode === "ai" ? scored : [...scored].sort((a, b) => b.score.percent - a.score.percent || a.position - b.position);
  const shownIds = new Set(results.map(({ course }) => course.id));
  const more = matches.filter(course => !shownIds.has(course.id)).slice(0, 3).map(courseWithUniversity);
  const question = questions[index];
  const filterParams = new URLSearchParams();
  if (answers.qualification === "school") filterParams.set("level", "UG");
  else if (answers.level && answers.level !== "any") filterParams.set("level", answers.level);
  if (answers.stream && answers.stream !== "any") filterParams.set("stream", answers.stream);
  if (answers.budget && answers.budget !== "any") filterParams.set("maxFee", answers.budget);

  // UI redesign Q23: the five answers live in the query string once results are shown, so a
  // results page can be bookmarked or shared. Only the quiz values are written (no personal data),
  // other parameters such as utm_* are kept, and a link with all five valid answers reopens the results.
  function writeAnswersToUrl(snapshot: Answers | null) {
    const url = new URL(window.location.href);
    for (const item of questions) {
      if (snapshot) url.searchParams.set(item.key, snapshot[item.key]);
      else url.searchParams.delete(item.key);
    }
    window.history.replaceState(window.history.state, "", url);
  }
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const restored = { ...emptyAnswers };
    for (const item of questions) {
      const value = params.get(item.key);
      if (!value || !item.options.some(option => option.value === value)) return;
      restored[item.key] = value;
    }
    const snapshot = restored as RecommenderAnswers;
    restoredFromUrl.current = true;
    setAnswers(restored);
    setIndex(questions.length - 1);
    setShowResults(true);
    if (matchingCourses(courses, snapshot).length) void requestRecommendations(snapshot);
    // Runs once on load; the published catalog passed in does not change while the page is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function requestRecommendations(snapshot: RecommenderAnswers) {
    pending.current?.abort();
    chatPending.current?.abort(); setChatHistory([]); setChatLoading(false); setChatError("");
    const controller = new AbortController(); pending.current = controller;
    setLoading(true); setRequestFailed(false); setResponse(null);
    try {
      const result = await fetch("/api/recommender", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(snapshot), signal: controller.signal,
      });
      if (!result.ok) throw new Error("Recommendation request failed");
      const data = await result.json() as Response;
      if (!Array.isArray(data.suggestions) || !["ai", "standard"].includes(data.mode)) throw new Error("Invalid recommendations");
      if (!controller.signal.aborted) setResponse(data);
    } catch {
      if (!controller.signal.aborted) setRequestFailed(true);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }

  async function askQuestion(value: string) {
    const questionText = value.trim();
    if (!questionText || chatLoading || loading || !results.length) return;
    const controller = new AbortController(); chatPending.current = controller;
    setChatLoading(true); setChatError(""); setChatQuestion("");
    try {
      const result = await fetch("/api/recommender/follow-up", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
        body: JSON.stringify({ answers: selections, courseIds: results.map(({ course }) => course.id), question: questionText, previous: chatHistory.at(-1)?.context || undefined }),
      });
      const data = await result.json() as Partial<ChatTurn> & { error?: string };
      if (!result.ok || typeof data.answer !== "string" || !Array.isArray(data.sources)) throw new Error(data.error || "Could not answer right now.");
      if (!controller.signal.aborted) setChatHistory(current => [...current, { question: questionText, answer: data.answer!, sources: data.sources!, context: data.context || null, mode: data.mode === "ai" ? "ai" : "standard" }]);
    } catch (error) {
      if (!controller.signal.aborted) { setChatQuestion(questionText); setChatError(error instanceof Error ? error.message : "Could not answer right now."); }
    } finally { if (!controller.signal.aborted) setChatLoading(false); }
  }

  // Choosing an option card stores the answer and moves on (the design's auto-advance). Options are
  // buttons, so this only happens on an explicit click, Enter or Space, never on arrow keys.
  function advance(value: string) {
    const snapshot = { ...answers, [question.key]: value } as RecommenderAnswers;
    setAnswers(snapshot);
    trackEvent("recommender_step_answered", { step_index: index, question: question.key, answer: value });
    if (index < questions.length - 1) setIndex(index + 1);
    else {
      const finalMatches = sortMatches(matchingCourses(courses, snapshot), snapshot.priority);
      setShowResults(true);
      writeAnswersToUrl(snapshot as Answers);
      trackEvent("recommender_completed", { course_ids: finalMatches.slice(0, 3).map(course => course.id) });
      if (finalMatches.length) void requestRecommendations(snapshot);
    }
  }
  function edit(step: number) { writeAnswersToUrl(null); pending.current?.abort(); chatPending.current?.abort(); setChatHistory([]); setChatLoading(false); setLoading(false); setResponse(null); setIndex(step); setShowResults(false); }
  function restart() { writeAnswersToUrl(null); pending.current?.abort(); chatPending.current?.abort(); setChatHistory([]); setChatLoading(false); setChatQuestion(""); setAnswers(emptyAnswers); setIndex(0); setShowResults(false); setResponse(null); setLoading(false); setRequestFailed(false); }

  if (!showResults) {
    const current = answers[question.key];
    return <section className="uvt-quiz" aria-labelledby="matcher-page-title">
      <div className="uvt-quiz-inner">
        <div className="uvt-quiz-eyebrow"><h1 id="matcher-page-title">Find my course</h1><span aria-hidden="true">·</span><span>Step {index + 1} of {questions.length}</span></div>
        <div className="uvt-quiz-bars" aria-hidden="true">{questions.map((item, step) => <span key={item.key} data-done={step <= index || undefined} />)}</div>
        <h2 ref={heading} tabIndex={-1} id="matcher-question-title" className="uvt-quiz-question">{question.title}</h2>
        <p className="uvt-quiz-sub" id="matcher-question-sub">{question.sub}</p>
        <div className="uvt-options" role="group" aria-labelledby="matcher-question-title" aria-describedby="matcher-question-sub">
          {question.options.map(option => {
            const Icon = option.icon;
            const selected = current === option.value;
            return <button type="button" className="uvt-option" key={option.value} aria-pressed={selected} onClick={() => advance(option.value)}>
              <span className="uvt-option-icon" aria-hidden="true"><Icon size={24} /></span>
              <span className="uvt-option-text"><span className="uvt-option-label">{option.label}</span><span className="uvt-option-sub">{option.sub}</span></span>
              <CircleCheck size={22} className="uvt-option-check" aria-hidden="true" />
            </button>;
          })}
        </div>
        <div className="uvt-quiz-foot">
          {index > 0 ? <button type="button" className="uvt-text-btn" onClick={() => setIndex(index - 1)}><ArrowLeft size={18} aria-hidden="true" />Back</button> : <span />}
          <div className="uvt-quiz-foot-end">
            <span>No sign-up to see results</span>
            {current ? <button type="button" className="uvt-text-btn is-primary" onClick={() => advance(current)}>{index === questions.length - 1 ? "Show matches" : "Next"}<ArrowRight size={18} aria-hidden="true" /></button> : null}
          </div>
        </div>
        <p className="uvt-quiz-note">Five quick questions. Free results, with no sign-up required. We filter published course data first. Groq may order suitable options; it cannot change listed fees or decide admission eligibility.</p>
      </div>
    </section>;
  }

  const modeText = loading ? "Checking the published options for a tailored order…" : response?.mode === "ai" ? "AI-assisted order, using only published course facts." : "Showing the standard filter results. AI ordering is currently unavailable.";
  return <div className="uvt-results-view">
    <section className="uvt-results-hero" aria-labelledby="matcher-results-title">
      <div className="uvt-results-hero-inner">
        <ol className="uv-breadcrumb" aria-label="Breadcrumb">
          <li><Link href="/">Home</Link></li>
          <li><button type="button" className="uvt-crumb-btn" onClick={() => edit(0)}>Find my course</button></li>
          <li><span aria-current="page">Your matches</span></li>
        </ol>
        <p className="uv-eyebrow">Your course matches</p>
        <h1 ref={heading} tabIndex={-1} id="matcher-results-title" className="uvt-results-title">Your course <span>matches</span></h1>
        <p className="uvt-results-lede">Programs from the published catalog that pass all five of your answers. This is not a quality or admission ranking.</p>
        <ul className="uvt-trust">{TRUST.map(([Icon, title, sub]) => <li key={title}><span aria-hidden="true"><Icon size={20} /></span><div><strong>{title}</strong><small>{sub}</small></div></li>)}</ul>
      </div>
    </section>
    <div className="uvt-results-main">
      <aside className="uvt-journey" aria-labelledby="matcher-journey-title">
        <div className="uvt-journey-head"><Route size={24} aria-hidden="true" /><div><h2 id="matcher-journey-title">Your journey</h2><p>The answers you gave. Edit any of them.</p></div></div>
        <ol className="uvt-journey-list" aria-label="Your preferences">
          {questions.map((item, step) => <li key={item.key}>
            <span className="uvt-journey-num" aria-hidden="true">{step + 1}</span>
            <div><strong>{item.journey}</strong><span>{optionLabel(item, answers[item.key])}</span></div>
            <button type="button" className="uvt-text-btn is-primary" onClick={() => edit(step)} aria-label={`Edit ${item.journey.toLowerCase()}: ${optionLabel(item, answers[item.key])}`}>Edit</button>
          </li>)}
        </ol>
        <button type="button" className="btn secondary uvt-journey-restart" onClick={restart}><RotateCcw size={18} aria-hidden="true" />Start again</button>
      </aside>

      <div className="uvt-results-col">
        <div className="uvt-headline">
          <div className="uvt-headline-text"><Sparkles size={26} aria-hidden="true" /><div>
            <h2>{results.length ? `${matches.length} program${matches.length === 1 ? "" : "s"} match your filters · showing ${results.length}` : "No courses match all your preferences"}</h2>
            {results.length ? <p className="uvt-mode" role="status" aria-live="polite">{modeText}</p> : null}
          </div></div>
          {results.length ? <div className="uvt-headline-actions">
            {results.length >= 2 && <Link href={`/compare?add=${results.map(({ course }) => course.id).join(",")}`} className="btn secondary"><ArrowLeftRight size={18} aria-hidden="true" />Compare these {results.length}</Link>}
            <Link href={`/courses?${filterParams}`} className="btn ghost">View all {matches.length} matches</Link>
            {!loading && (requestFailed || ["provider", "invalid_output"].includes(response?.reason || "")) ? <button type="button" className="btn secondary" onClick={() => void requestRecommendations(selections)}><RotateCcw size={16} aria-hidden="true" />Retry AI ordering</button> : null}
          </div> : null}
        </div>
        {results.length ? <FeeGroupSwitch id="recommender-fee-group" className="uvt-fee-group" /> : null}

        {results.length ? <>
          <ol className="uvt-rec-list" aria-label="Recommended programs">{results.map(({ course, suggestion, score }) => {
            const sourceUrl = suggestion?.source?.url || publicSourceUrls(course.sourceUrls)[0];
            const recognition = recognitionTag(course);
            const ring = { "--uvt-ring": matchRingColor(score.percent), "--uvt-ring-deg": `${score.percent * 3.6}deg` } as CSSProperties;
            const label = `${course.name}, ${course.university.shortName}`;
            return <li className="uvt-rec" key={course.id}>
              <article className="uvt-rec-card" aria-labelledby={`rec-${course.id}`}>
                <div className="uvt-rec-score">
                  <div className="uvt-ring" style={ring} role="img" aria-label={`${score.percent}% match with your answers`}><div><strong>{score.percent}%</strong><span>Match</span></div></div>
                  <details className="uvt-score-how">
                    <summary>How it’s worked out</summary>
                    <dl>{score.parts.map(part => <div key={part.key}><dt>{part.label}</dt><dd>{part.points} / {part.max}</dd></div>)}</dl>
                  </details>
                </div>
                <div className="uvt-rec-info">
                  <div className="uvt-rec-id">
                    <Image src={universityMedia[course.universityId]?.logo || "/brand/favicon-32x32.png"} alt="" width={32} height={32} />
                    <div><h3 id={`rec-${course.id}`}>{course.name}</h3><p>{course.university.name}</p></div>
                  </div>
                  <p className="uvt-rec-meta">{course.level === "UG" ? "Undergraduate" : "Postgraduate"} · {course.stream} · {course.duration}</p>
                  <ul className="uvt-pills" aria-label="Why it matches">{score.pills.map(pill => <li key={pill.text} className={`is-${pill.tone}`}>{pill.text}</li>)}</ul>
                  <p className="uvt-rec-why">{suggestion?.reasons.join(" ") || "Matches the filters you selected. Check the course page for eligibility and current fee details."}</p>
                  {/* Wave 4 A3: the listed requirement, with the checker when a reviewed rule is published.
                      The quiz does not ask category or marks, so it never claims a personal verdict. */}
                  <div className="uvt-rec-elig">
                    <p><strong>Listed eligibility:</strong> {course.eligibility}</p>
                    {isCompleteEligibilityRule(course.eligibilityRules)
                      ? <Link href={`/tools/eligibility-checker?course=${encodeURIComponent(course.id)}`} className="uv-link">Check your eligibility for this program →</Link>
                      : <p className="uvt-rec-elig-note"><span className="uv-tag uv-tag-warning">Confirm with the university</span> <Link href={`/courses/${course.slug}#sec-eligibility`} className="uv-link">Entry details on the course page</Link></p>}
                  </div>
                  <p className="uvt-rec-badges"><span className={`uv-tag uv-tag-${recognition.tone}`}>{recognition.text}</span></p>
                  {sourceUrl ? <p className="uvt-rec-source"><a href={sourceUrl} target="_blank" rel="noopener noreferrer">Check university/source page ({suggestion?.source?.label || sourceHost(sourceUrl)})<ExternalLink size={14} aria-hidden="true" /></a></p> : null}
                </div>
                <dl className="uvt-rec-price">
                  <div><dd><GroupFeeText fee={course.fee} categoryFees={course.categoryFees} short /></dd><dt>Listed total tuition</dt></div>
                  <div><dd className="is-small"><GroupEmiText emi={course.emi} /></dd><dt>EMI from</dt></div>
                </dl>
                <div className="uvt-rec-actions">
                  <Link href={`/courses/${course.slug}`} className="btn primary">View details</Link>
                  <SaveToggle courseId={course.id} label={label} />
                  <Link href={`/lead?course=${course.id}&intent=recommender`} rel="nofollow" className="btn secondary" data-open-lead>Apply now</Link>
                </div>
              </article>
            </li>;
          })}</ol>
          <p className="uvt-disclaimer">Preference-based suggestions are a starting point, not an admission decision. The match percentage only measures how closely each program fits your five answers, using listed facts; it never uses ratings, reviews or placement figures.</p>

          <section className="uvt-chat" aria-labelledby="matcher-chat-heading">
            <h3 id="matcher-chat-heading">Ask about these courses</h3>
            <p>Ask a follow-up about the shortlist. Answers use published course information; missing or unverified details are flagged. Please do not enter contact details here.</p>
            <div className="uvt-chat-examples" aria-label="Suggested questions">{exampleQuestions.map(text => <button type="button" key={text} disabled={loading || chatLoading} onClick={() => void askQuestion(text)}>{text}</button>)}</div>
            {chatHistory.length > 0 && <div className="uvt-chat-history" role="log" aria-label="Course questions" aria-live="polite">{chatHistory.map((turn, i) => <div className="uvt-chat-turn" key={i}><p><strong>You:</strong> {turn.question}</p><p><strong>Course guide:</strong> {turn.answer}</p>{turn.sources.length > 0 && <p>Sources: {turn.sources.map((source, index) => <span key={source.url}>{index > 0 ? " · " : ""}<a href={source.url} target="_blank" rel="noopener noreferrer">{source.label}</a></span>)}</p>}</div>)}</div>}
            <form className="uvt-chat-form" onSubmit={event => { event.preventDefault(); void askQuestion(chatQuestion); }}>
              <label htmlFor="matcher-chat-input">Your question</label>
              <textarea id="matcher-chat-input" maxLength={300} value={chatQuestion} disabled={loading || chatLoading} onChange={event => setChatQuestion(event.target.value)} placeholder="For example: What about the second course?" />
              {chatError && <p role="alert" className="uvt-error">{chatError}</p>}
              <div><button type="submit" className="btn primary" disabled={loading || chatLoading || !chatQuestion.trim()}>{chatLoading ? "Checking…" : "Ask question"}</button></div>
            </form>
          </section>
        </> : <div className="uv-empty uvt-empty">
          <div className="uv-empty-art" aria-hidden="true"><span><ListFilter size={26} /></span><i /><i /></div>
          <h3>No programs pass all five answers</h3>
          <p>{answers.level === "PG" && answers.qualification === "school" ? "A postgraduate choice conflicts with your answer that you have not completed a bachelor's degree. Edit either answer to see options." : "Try a different subject, degree level or budget using the edit buttons in Your journey. We have not substituted courses outside your filters."}</p>
          <div className="uv-empty-actions"><Link href="/courses" className="btn secondary">Browse all courses</Link></div>
        </div>}
      </div>

      <section className="uvt-help" aria-labelledby="matcher-help-title">
        <span className="uvt-help-icon" aria-hidden="true"><Headset size={30} /></span>
        <div><h2 id="matcher-help-title">Need help choosing the right program?</h2><p>Counselling is free. Send an enquiry to talk through fees, eligibility and next steps for these programs.</p></div>
        <Link href="/lead?intent=recommender" rel="nofollow" className="btn primary large" data-open-lead>Apply now</Link>
      </section>

      {more.length ? <section className="uvt-more" aria-labelledby="matcher-more-title">
        <div className="uv-section-head">
          <div><h2 id="matcher-more-title" className="uv-h2 is-inner">More programs that match</h2><p className="uv-section-sub">Other programs that pass the same five answers.</p></div>
          <Link href={`/courses?${filterParams}`} className="uv-section-link">View all {matches.length} matches →</Link>
        </div>
        <div className="uv-card-grid">{more.map(course => <CourseCard key={course.id} course={course} trackSource="recommender_more" />)}</div>
      </section> : null}
    </div>
  </div>;
}
