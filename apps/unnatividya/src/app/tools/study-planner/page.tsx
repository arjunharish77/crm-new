import type { Metadata } from "next";
import Link from "next/link";
import { FaqAccordion } from "@/components/faq-accordion";
import { JsonLd } from "@/components/json-ld";
import { StudyPlanner } from "@/components/study-planner";
import { withSocial } from "@/lib/page-metadata";
import { siteUrl } from "@/lib/seo-config";

export const metadata: Metadata = withSocial({
  title: "Weekly Study-Time Planner for Online Degrees",
  description: "Add up your week (work, travel, sleep, family) to see the hours you have for an online degree, and plan your study day by day. Free, no sign-up, nothing saved.",
  alternates: { canonical: "/tools/study-planner" },
});

const faqs: Array<[string, string]> = [
  ["How many hours a week does an online degree need?", "It depends on the program and the university, so ask them directly. This planner shows the time you actually have, so you can compare it with what they tell you."],
  ["Is my plan saved anywhere?", "No. Everything stays in this page and is cleared when you close it. Use Print my plan to keep a copy."],
  ["Do online programs require attendance?", "UGC's 2020 regulations require at least 75% participation in an online program's activities before each end-semester exam. Ask the university how it counts participation."],
];

// Wave 5 B3: the weekly study-time planner.
export default function StudyPlannerPage() {
  const host = siteUrl();
  return <>
    <JsonLd data={[
      { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: host },
        { "@type": "ListItem", position: 2, name: "Study-time planner", item: `${host}/tools/study-planner` },
      ] },
      { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faqs.map(([question, answer]) => ({ "@type": "Question", name: question, acceptedAnswer: { "@type": "Answer", text: answer } })) },
    ]} />
    <section className="uv-page-hero uvt-page-hero" aria-labelledby="planner-title">
      <div className="uv-page-hero-inner">
        <ol className="uv-breadcrumb" aria-label="Breadcrumb">
          <li><Link href="/">Home</Link></li>
          <li><span>Tools</span></li>
          <li><span aria-current="page">Study-time planner</span></li>
        </ol>
        <p className="uv-eyebrow">Free learner tool</p>
        <h1 id="planner-title" className="uv-h1">Can you fit an online degree into your week?</h1>
        <p className="uv-lede">Add up your week to see the hours you really have, then plan your study day by day. Your numbers stay on this page.</p>
      </div>
    </section>
    <div className="uv-shell uvt-page">
      <StudyPlanner />
      <div className="uvt-faq">
        <FaqAccordion items={faqs} name="study-planner-faq" title="Questions about study time" subtitle={null} id="sec-faq" />
      </div>
    </div>
  </>;
}
