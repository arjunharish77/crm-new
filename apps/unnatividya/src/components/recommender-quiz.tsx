"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { courseWithUniversity, formatFee, type Course, type University } from "@/data/catalog";

type CourseItem = Course & { university: University };
type Phase = "quiz" | "thinking" | "results";
type AnswerKey = "goal" | "level" | "stream" | "budget" | "work";
type Answers = Partial<Record<AnswerKey, string>>;
type Message = { who: "user" | "bot"; text: string };

const questions: { key: AnswerKey; text: string; options: string[] }[] = [
  {
    key: "goal",
    text: "What is your main goal?",
    options: ["Get promoted / switch to a better role", "Start my first degree after 12th", "Move into tech / IT", "Add a PG degree to my profile"],
  },
  {
    key: "level",
    text: "Which level are you looking at?",
    options: ["Undergraduate (UG)", "Postgraduate (PG)", "Not sure — advise me"],
  },
  {
    key: "stream",
    text: "Which area interests you most?",
    options: ["Management & business", "IT & computer applications", "Commerce & finance", "Arts, media & humanities"],
  },
  {
    key: "budget",
    text: "What total budget are you comfortable with?",
    options: ["Under ₹1,00,000", "₹1,00,000 – ₹1,60,000", "Above ₹1,60,000 — brand matters more"],
  },
  {
    key: "work",
    text: "Are you currently working?",
    options: ["Yes, full-time", "Yes, part-time / freelancing", "No, studying or on a break"],
  },
];

function scoreCourse(course: CourseItem, answers: Answers) {
  let score = 60;
  const wantsPG = answers.level === "Postgraduate (PG)";
  const wantsUG = answers.level === "Undergraduate (UG)";
  if (wantsPG && course.level === "PG") score += 12;
  if (wantsUG && course.level === "UG") score += 12;
  if ((wantsPG && course.level === "UG") || (wantsUG && course.level === "PG")) score -= 30;

  const streamMap: Record<string, string> = {
    "Management & business": "Management",
    "IT & computer applications": "IT & Computers",
    "Commerce & finance": "Commerce",
    "Arts, media & humanities": "Arts & Humanities",
  };
  if (answers.stream && streamMap[answers.stream] === course.stream) score += 16;
  else if (answers.stream) score -= 18;

  if (answers.budget === "Under ₹1,00,000") score += course.fee <= 100000 ? 10 : -14;
  if (answers.budget === "₹1,00,000 – ₹1,60,000") score += course.fee > 100000 && course.fee <= 160000 ? 10 : -6;
  if (answers.budget?.startsWith("Above")) score += course.fee > 160000 ? 8 : 0;
  if (answers.goal === "Move into tech / IT" && course.stream === "IT & Computers") score += 6;
  if (answers.goal?.startsWith("Get promoted") && course.level === "PG") score += 5;

  score += Math.round((course.rating - 4.3) * 10) + Math.round(course.university.placement / 30);
  return Math.max(41, Math.min(98, score));
}

function why(course: CourseItem, answers: Answers) {
  const bits: string[] = [];
  if (answers.stream) bits.push(`matches your interest in ${answers.stream.toLowerCase()}`);
  if (answers.budget === "Under ₹1,00,000" && course.fee <= 100000) bits.push("fits your budget");
  if (answers.budget === "₹1,00,000 – ₹1,60,000" && course.fee <= 160000) bits.push("fits your budget");
  if (answers.work?.startsWith("Yes")) bits.push("weekend live classes suit working professionals");
  bits.push(`${course.university.placement}% placement rate at ${course.university.shortName}`);
  return `${bits.slice(0, 3).join("; ")}.`;
}

function botReply(text: string, courses: CourseItem[]) {
  const query = text.toLowerCase();
  const cheapest = [...courses].sort((a, b) => a.fee - b.fee)[0];
  const bestPlacement = [...courses].sort((a, b) => b.university.placement - a.university.placement)[0];
  const bestPartners = [...courses].sort((a, b) => b.university.partners - a.university.partners)[0];

  if (query.includes("cheap") || query.includes("afford") || query.includes("budget")) {
    return `On a tight budget, ${cheapest.name} from ${cheapest.university.name} at ${formatFee(cheapest.fee)} total (EMI ${cheapest.emi}) is the strongest value. It is UGC-entitled, so validity is identical to costlier options.`;
  }
  if (query.includes("placement") || query.includes("job") || query.includes("salary")) {
    return `For placements, ${bestPlacement.university.name} leads here with a ${bestPlacement.university.placement}% assistance rate and ${bestPlacement.university.avgPackage} average package. ${bestPartners.university.name} has the largest partner network (${bestPartners.university.partners}+). I would weight ${bestPlacement.university.shortName} if placement support is your top criterion.`;
  }
  if (query.includes("mba")) {
    return "Between the three MBAs: MUJ balances brand and outcomes best, SMU is the value pick, and Amity has the strongest international recognition (WES + QS ranked). Want to open them in the compare tool?";
  }
  if (query.includes("emi") || query.includes("loan")) {
    return "Every program here offers no-cost EMI via education loan partners — your top match works out to roughly the EMI shown on its card, with zero processing fee for salaried applicants.";
  }
  if (query.includes("valid") || query.includes("ugc") || query.includes("government")) {
    return "All programs I recommend are UGC-entitled — legally equivalent to on-campus degrees for government jobs, PSU roles and higher studies, including WES evaluation abroad.";
  }
  return 'Good question — based on your quiz answers I would still start with your top match above. For a nuanced take, tap "Enquire" on any card and a counsellor will call you free.';
}

export function RecommenderQuiz({ courses }: { courses: Course[] }) {
  const courseItems = useMemo(() => courses.map(courseWithUniversity), [courses]);
  const [phase, setPhase] = useState<Phase>("quiz");
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Answers>({});
  const [chat, setChat] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");

  const results = useMemo(() => {
    return courseItems
      .map((course) => ({ course, score: scoreCourse(course, answers) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
  }, [answers, courseItems]);

  const question = questions[index];

  function pick(label: string) {
    const nextAnswers = { ...answers, [question.key]: label };
    setAnswers(nextAnswers);
    if (index < questions.length - 1) {
      setIndex(index + 1);
      return;
    }
    setPhase("thinking");
    window.setTimeout(() => {
      setChat([{ who: "bot", text: "I shortlisted these 3 from our catalog. Ask me anything — cheaper alternatives, placements, EMI, or whether the degree is valid for government jobs." }]);
      setPhase("results");
    }, 1400);
  }

  function send(message: string) {
    const text = message.trim();
    if (!text) return;
    setChat((items) => [...items, { who: "user", text }, { who: "bot", text: botReply(text, courseItems) }]);
    setDraft("");
  }

  function restart() {
    setAnswers({});
    setIndex(0);
    setChat([]);
    setDraft("");
    setPhase("quiz");
  }

  return (
    <section style={{ background: "#F7F8F9", flex: 1, display: "flex", flexDirection: "column" }}>
      <div style={{ maxWidth: 840, margin: "0 auto", padding: "40px 24px 64px", width: "100%", boxSizing: "border-box", flex: 1 }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "#fff", border: "1px solid #CFDAE6", borderRadius: 999, padding: "6px 14px", fontSize: 12, fontWeight: 700, color: "#696868" }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "linear-gradient(180deg,#453DB8,#8B7CF0)", display: "inline-block" }} />
            UnnatiAI course recommender
          </div>
          <h1 style={{ fontSize: 30, fontWeight: 700, color: "#363634", margin: "14px 0 6px" }}>{phase === "results" ? "Your personalised shortlist" : "Find your degree in 2 minutes"}</h1>
          <p style={{ fontSize: 15, color: "#696868", margin: 0 }}>{phase === "results" ? "Ranked by fit with your goals, budget and schedule" : "Five quick questions — no sign-up needed to see results"}</p>
        </div>

        {phase === "quiz" ? (
          <div style={{ background: "#fff", border: "1px solid #CFDAE6", borderRadius: 8, padding: 28, maxWidth: 620, margin: "0 auto" }}>
            <div className="quiz-progress">
              {questions.map((item, itemIndex) => <span className={itemIndex <= index ? "active" : undefined} key={item.key} />)}
            </div>
            <span style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#544CC8", marginBottom: 6 }}>Question {index + 1} of 5</span>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: "#363634", margin: 0 }}>{question.text}</h2>
            <div className="quiz-option-list">
              {question.options.map((option) => (
                <button
                  className={answers[question.key] === option ? "quiz-option active" : "quiz-option"}
                  type="button"
                  onClick={() => pick(option)}
                  key={option}
                >
                  {option}
                </button>
              ))}
            </div>
            {index > 0 ? <button className="quiz-back" type="button" onClick={() => setIndex(index - 1)}>← Back</button> : null}
          </div>
        ) : null}

        {phase === "thinking" ? (
          <div style={{ background: "#fff", border: "1px solid #CFDAE6", borderRadius: 8, padding: 48, maxWidth: 620, margin: "0 auto", textAlign: "center" }}>
            <div className="uv-spinner" aria-hidden="true" />
            <h2 style={{ fontSize: 16, fontWeight: 700, color: "#363634", margin: 0 }}>Matching your answers against our programs…</h2>
            <p style={{ fontSize: 13, color: "#707070", margin: "6px 0 0" }}>Checking fees, approvals, placement records and flexibility</p>
          </div>
        ) : null}

        {phase === "results" ? (
          <div className="recommender-results">
            {results.map(({ course, score }, resultIndex) => (
              <article className={resultIndex === 0 ? "match-card best" : "match-card"} key={course.id}>
                <div className="match-score">
                  <strong>{score}%</strong>
                  <span>MATCH</span>
                </div>
                <div>
                  {resultIndex === 0 ? <span className="best-match-badge">BEST MATCH</span> : null}
                  <h2>{course.name} — {course.university.name}</h2>
                  <p>{course.duration} · {formatFee(course.fee)} total · EMI {course.emi}</p>
                  <p className="match-why"><b>Why:</b> {why(course, answers)}</p>
                </div>
                <div className="match-actions">
                  <Link href={`/courses/${course.slug}`} className="btn primary">View course</Link>
                  <Link href={`/lead?course=${course.id}&intent=recommender`} className="btn secondary" data-open-lead>Enquire</Link>
                </div>
              </article>
            ))}
            <button className="quiz-back centered" type="button" onClick={restart}>↺ Retake the quiz</button>

            <div className="recommender-chat">
              <div className="chat-head">
                <span />
                <strong>Refine with UnnatiAI</strong>
                <small>demo — responses are scripted</small>
              </div>
              <div className="chat-body">
                {chat.map((message, messageIndex) => (
                  <div className={`chat-row ${message.who}`} key={`${message.who}-${messageIndex}`}>
                    <p>{message.text}</p>
                  </div>
                ))}
              </div>
              <div className="chat-chips">
                {["Cheapest good option?", "Which has best placements?", "Is it valid for govt jobs?"].map((chip) => (
                  <button type="button" onClick={() => send(chip)} key={chip}>{chip}</button>
                ))}
              </div>
              <form className="chat-form" onSubmit={(event) => { event.preventDefault(); send(draft); }}>
                <input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Ask anything, e.g. cheapest option with good placements" />
                <button type="submit">Send</button>
              </form>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
