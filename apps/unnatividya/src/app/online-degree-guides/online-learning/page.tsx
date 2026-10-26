export const dynamic = "force-dynamic";
import { PublishedCatalogBoundary } from "@/components/published-catalog-boundary";
import { getPublishedCatalog } from "@/lib/catalog-snapshot-server";
import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { JsonLd } from "@/components/json-ld";
import { FaqAccordion } from "@/components/faq-accordion";
import { Byline, ReadingApplyCta, ReadingHero, ReadingToc, RelatedRows } from "@/components/reading-page";
import { EXAM_SOURCES, EXAM_UNIVERSITIES } from "@/data/exam-requirements";
import { formatCheckedDate } from "@/lib/source-checks";
import { ASSESSMENT, EQUIVALENCE, STUDY_MODES, UGC_REGULATIONS_2020 } from "@/lib/study-modes";
import { withSocial } from "@/lib/page-metadata";

const SITE_URL = process.env.NEXT_PUBLIC_UNNATIVIDYA_SITE_URL || "https://unnatividya.com";

export const metadata: Metadata = withSocial({
  title: "What Studying an Online Degree Is Like: Classes, Exams, Time",
  description: "How online degrees at MUJ, SMU and Amity work: what UGC's rules say about participation and assessment, how each university holds exams, and how to plan your time.",
  alternates: { canonical: "/online-degree-guides/online-learning" },
});

// Wave 5 cluster D1 (decision V4): how studying online works, from UGC's 2020 regulations, the
// universities' exam pages and the program details published in the catalog. No workload or outcome
// figures are stated that a source doesn't give.
export default async function OnlineLearningHubPage() {
  return <PublishedCatalogBoundary><OnlineLearningHub /></PublishedCatalogBoundary>;
}

async function OnlineLearningHub() {
  const catalog = await getPublishedCatalog();
  const courses = catalog.courses.map(catalog.courseWithUniversity);
  const withDetails = courses.filter(course => course.programDetails?.study || course.programDetails?.assessment).sort((a, b) => a.name.localeCompare(b.name) || a.university.shortName.localeCompare(b.university.shortName));
  const faqs: Array<[string, string]> = [
    ["Do I have to attend online classes?", "UGC's 2020 regulations require at least 75% participation in an online program's activities before you can sit each end-semester exam. Ask the university how it counts participation and which sessions are live."],
    ["How are online degrees assessed?", "Under the same regulations, continuous assessment during the semester counts for at most 30% of the marks and the end-semester exam for at least 70%."],
    ["Where do I take the exams?", "Online Manipal says MUJ and SMU exams are online proctored and taken from home on a computer that meets the requirements. Amity says all its exams are online and proctored. Use the exam check to test your computer."],
    ["How many hours a week will I need?", "It depends on the program, so ask the university. Our study-time planner shows the hours you actually have in a typical week."],
    ["Is an online degree equal to a regular degree?", EQUIVALENCE],
  ];
  const schema = [
    { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Online Degree Guides", item: `${SITE_URL}/online-degree-guides` },
      { "@type": "ListItem", position: 3, name: "How online learning works", item: `${SITE_URL}/online-degree-guides/online-learning` },
    ] },
    { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faqs.map(([question, answer]) => ({ "@type": "Question", name: question, acceptedAnswer: { "@type": "Answer", text: answer } })) },
  ];

  return <>
    <JsonLd data={schema} />
    <article className="uv-read uv-read-guide">
      <ReadingHero
        crumbs={[{ label: "Home", href: "/" }, { label: "Online degree guides", href: "/online-degree-guides" }, { label: "How online learning works" }]}
        tag="Studying online"
        title="What studying an online degree is really like"
        deck="How classes, exams and your time work in the online programs we list, from UGC's rules and the universities' own pages. Confirm the details for your program and session with the university."
        meta={<Byline />}
      />
      <div className="uv-read-body">
        <ReadingToc label="On this page" navLabel="Page sections" items={[
          { href: "#ol-rules", label: "What UGC's rules require" },
          { href: "#ol-classes", label: "Classes and assessment by program" },
          { href: "#ol-exams", label: "Exams" },
          { href: "#ol-time", label: "Planning your time" },
          { href: "#guide-faq", label: "Frequently asked questions" },
          { href: "#ol-related", label: "Tools and guides" },
        ]} />

        <section className="uv-read-section" id="ol-rules" tabIndex={-1} aria-labelledby="ol-rules-title">
          <h2 id="ol-rules-title" className="uv-read-h2">What UGC&apos;s rules require</h2>
          <div className="uv-read-prose">
            <ul>
              <li><strong>Delivery.</strong> {STUDY_MODES.online.definition}</li>
              <li><strong>Participation.</strong> You need at least 75% participation in the program&apos;s online activities before each end-semester exam (regulation 15(A)(3)).</li>
              <li><strong>Assessment.</strong> {ASSESSMENT}</li>
              <li><strong>Exams.</strong> {STUDY_MODES.online.exams}</li>
              <li><strong>Equivalence.</strong> {EQUIVALENCE}</li>
            </ul>
          </div>
          <p className="uv-read-caption">Source: <a href={UGC_REGULATIONS_2020.url} target="_blank" rel="noopener noreferrer">{UGC_REGULATIONS_2020.label}<ExternalLink size={12} aria-hidden="true" /></a>, read {formatCheckedDate(UGC_REGULATIONS_2020.checkedAt)}. <Link href="/tools/mode-helper">Online, distance or regular: which fits you?</Link></p>
        </section>

        <section className="uv-read-section" id="ol-classes" tabIndex={-1} aria-labelledby="ol-classes-title">
          <h2 id="ol-classes-title" className="uv-read-h2">Classes and assessment by program</h2>
          {withDetails.length ? <>
            <div className="uv-read-prose"><p>These programs have published, sourced details of how classes and assessment work. For the others, ask the university for the current program handbook.</p></div>
            <ul className="uv-read-cards">{withDetails.map(course => <li key={course.id} className="uv-read-card">
              <h3><Link href={`/courses/${course.slug}`}>{course.name}, {course.university.shortName}</Link></h3>
              {course.programDetails?.study ? <p><strong>Learning:</strong> {course.programDetails.study.points.join(" ")}</p> : null}
              {course.programDetails?.assessment ? <p><strong>Assessment:</strong> {course.programDetails.assessment.points.join(" ")}</p> : null}
            </li>)}</ul>
          </> : <div className="uv-read-prose"><p>Program-specific details of live classes, recordings and assessment are being reviewed and aren&apos;t published here yet. Until they are, ask the university for the current program handbook, and use the questions below.</p>
            <ul><li>Which classes are live, which are recorded, and is attendance tracked?</li><li>How are assignments and end-semester exams weighted for this program?</li><li>What support is there for missed classes, technical problems and resits?</li></ul></div>}
        </section>

        <section className="uv-read-section" id="ol-exams" tabIndex={-1} aria-labelledby="ol-exams-title">
          <h2 id="ol-exams-title" className="uv-read-h2">Exams</h2>
          <ul className="uv-read-cards">{EXAM_UNIVERSITIES.map(item => <li key={item.id} className="uv-read-card">
            <h3>{item.name}</h3>
            <p>{item.howHeld.slice(0, 2).join(" ")}</p>
            <p className="uv-read-card-muted">Source: {EXAM_SOURCES[item.source].label}, updated {EXAM_SOURCES[item.source].updated}</p>
          </li>)}</ul>
          <div className="uv-read-compare">
            <div><p className="uv-read-compare-title">Is your computer ready for online exams?</p><p className="uv-read-compare-copy">Check device, browser, screen, camera and microphone against your university&apos;s requirements. Nothing is recorded.</p></div>
            <Link href="/tools/exam-check" className="btn secondary guide-cost-link">Open the exam check</Link>
          </div>
        </section>

        <section className="uv-read-section" id="ol-time" tabIndex={-1} aria-labelledby="ol-time-title">
          <h2 id="ol-time-title" className="uv-read-h2">Planning your time</h2>
          <div className="uv-read-prose"><p>Weekly study hours depend on the program and on you, and the universities don&apos;t publish a single figure for every program. Ask the university what your program expects, then add up your own week to see whether it fits.</p></div>
          <div className="uv-read-compare">
            <div><p className="uv-read-compare-title">Can you fit it around work?</p><p className="uv-read-compare-copy">Add up your work, travel, sleep and family time, and plan your study day by day.</p></div>
            <Link href="/tools/study-planner" className="btn secondary guide-cost-link">Open the study-time planner</Link>
          </div>
        </section>

        <div className="uv-read-section"><FaqAccordion id="guide-faq" name="online-learning-faq" items={faqs} subtitle={null} /></div>
        <ReadingApplyCta title="Want to know how a program runs week to week?" copy="A counsellor will go through the class schedule, assessment and support for the program you're considering." href="/lead?intent=online-learning-guide" note="Free service · no spam" />
        <RelatedRows id="ol-related" title="Tools and guides" items={[
          { href: "/tools/exam-check", label: "Online exams and device check" },
          { href: "/tools/study-planner", label: "Weekly study-time planner" },
          { href: "/tools/mode-helper", label: "Online, distance or regular helper" },
          { href: "/blog/studying-while-working-fulltime", label: "Studying while working full time" },
        ]} />
      </div>
    </article>
  </>;
}
