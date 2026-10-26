// Wave 5 B2: the online vs distance vs regular helper. Every fact comes from the UGC (Open and
// Distance Learning Programmes and Online Programmes) Regulations, 2020 (read 13 October 2026; the
// 2021, 2022 and 2024 amendments do not change regulations 2, 15 or 22). The helper only sorts the
// three modes by the learner's own answers; it never ranks programs or universities.

export const UGC_REGULATIONS_2020 = {
  label: "UGC (Open and Distance Learning Programmes and Online Programmes) Regulations, 2020",
  url: "https://deb.ugc.ac.in/pdf/20200906.pdf",
  checkedAt: "2026-10-13",
};

export type StudyMode = "regular" | "odl" | "online";

export const STUDY_MODES: Record<StudyMode, { name: string; short: string; definition: string; teaching: string; exams: string; regulations: string }> = {
  regular: {
    name: "Regular (conventional) mode",
    short: "Regular",
    definition: "Taught through \"face to face interaction between the teacher and learner in regular class room environment\", which can be supplemented with online instruction.",
    teaching: "Classes on campus, on the institution's timetable.",
    exams: "Held by the institution on campus.",
    regulations: "Regulation 2(f)",
  },
  odl: {
    name: "Open and distance learning (ODL)",
    short: "Distance",
    definition: "Taught through \"a variety of media, including print, electronic, online and occasional interactive face-to-face meetings\" with learners, or through learner support services.",
    teaching: "Self-learning material with occasional contact sessions; you need 75% attendance in the program's personal contact sessions to sit the end-semester exam.",
    exams: "End-semester exams are proctored in examination centres within the university's territorial jurisdiction.",
    regulations: "Regulations 2(v), 15(A)(3) and 15(B)(1)",
  },
  online: {
    name: "Online mode",
    short: "Online",
    definition: "Taught through the internet and e-learning materials, with \"full-fledged programme delivery through the internet\".",
    teaching: "Delivered online; you need at least 75% participation in the program's online activities to sit the end-semester exam.",
    exams: "Technology-enabled online tests with security arrangements, or proctored exams. The territorial restriction does not apply to online learning.",
    regulations: "Regulations 2(u), 15(A)(3) and 15(C)(1)–(2)",
  },
};

export const EQUIVALENCE = "Under regulation 22, a degree earned in ODL or online mode from an institution recognised under the regulations is treated as equivalent to the same degree in regular mode.";
export const ASSESSMENT = "In both ODL and online programs, continuous assessment counts for at most 30% of the marks and the end-semester exam for at least 70% (regulation 15(A)(3)).";

export const MODE_QUESTIONS = [
  { id: "inPerson", title: "Can you attend classes in person on a fixed timetable?", options: [
    { value: "yes", label: "Yes", sub: "I can be on campus regularly." },
    { value: "sometimes", label: "Sometimes", sub: "Occasional sessions would work." },
    { value: "no", label: "No", sub: "I can't attend classes in person." },
  ] },
  { id: "aroundWork", title: "Do you need to study around a job or other fixed commitments?", options: [
    { value: "yes", label: "Yes", sub: "I'll study in my own time." },
    { value: "no", label: "No", sub: "I can study full time." },
  ] },
  { id: "examCentre", title: "Can you travel to an exam centre in the university's region for each end-semester exam?", options: [
    { value: "yes", label: "Yes", sub: "A centre in my region works for me." },
    { value: "no", label: "Not easily", sub: "Travelling for every exam would be hard." },
    { value: "abroad", label: "I live outside India", sub: "I'd study from another country." },
  ] },
  { id: "learning", title: "How do you prefer to learn?", options: [
    { value: "online", label: "Mostly online", sub: "Recorded and live sessions on a learning platform." },
    { value: "mixed", label: "A mix", sub: "Printed or downloadable material and occasional sessions." },
    { value: "classroom", label: "In a classroom", sub: "Face to face with teachers and classmates." },
  ] },
] as const;

export type ModeAnswers = Partial<Record<(typeof MODE_QUESTIONS)[number]["id"], string>>;
export type ModeFit = "fits" | "possible" | "unlikely";

// Deterministic: each mode's fit and the reasons, in the learner's own terms.
export function evaluateModes(answers: ModeAnswers): Array<{ mode: StudyMode; fit: ModeFit; reasons: string[] }> {
  const { inPerson, aroundWork, examCentre, learning } = answers;
  const regular = { mode: "regular" as const, fit: "possible" as ModeFit, reasons: [] as string[] };
  if (inPerson === "yes") { regular.fit = "fits"; regular.reasons.push("You can attend classes in person."); }
  if (inPerson === "no") { regular.fit = "unlikely"; regular.reasons.push("Regular mode is taught face to face, and you can't attend in person."); }
  if (inPerson === "sometimes") regular.reasons.push("Regular mode expects you on campus on its timetable; occasional attendance may not be enough.");
  if (aroundWork === "yes" && regular.fit === "fits") { regular.fit = "possible"; regular.reasons.push("Check that the class timetable fits around your work."); }

  const odl = { mode: "odl" as const, fit: "possible" as ModeFit, reasons: [] as string[] };
  if (examCentre === "abroad" || examCentre === "no") { odl.fit = "unlikely"; odl.reasons.push("ODL end-semester exams are held at examination centres within the university's territorial jurisdiction."); }
  else if (examCentre === "yes") {
    odl.reasons.push("You can reach an exam centre for the end-semester exams.");
    if (aroundWork === "yes" || learning === "mixed") { odl.fit = "fits"; odl.reasons.push(learning === "mixed" ? "ODL uses printed and electronic material with occasional sessions, as you prefer." : "You can study the material in your own time."); }
  }
  if (inPerson === "no" && odl.fit !== "unlikely") odl.reasons.push("ODL can include occasional face-to-face contact sessions, with 75% attendance needed; ask how and where they are held.");

  const online = { mode: "online" as const, fit: "possible" as ModeFit, reasons: [] as string[] };
  if (learning === "online" || aroundWork === "yes" || examCentre === "abroad") {
    online.fit = "fits";
    if (learning === "online") online.reasons.push("Online programs are delivered entirely over the internet, as you prefer.");
    if (aroundWork === "yes") online.reasons.push("You can study around your commitments, with 75% participation in online activities needed before each end-semester exam.");
    if (examCentre === "abroad") online.reasons.push("The territorial restriction does not apply to online learning; check that the university enrols learners from your country.");
  }
  if (learning === "classroom") { online.fit = online.fit === "fits" ? "possible" : "unlikely"; online.reasons.push("Online programs have no classroom; teaching happens on a learning platform."); }
  return [regular, odl, online];
}

export function allAnswered(answers: ModeAnswers) {
  return MODE_QUESTIONS.every(question => Boolean(answers[question.id]));
}
