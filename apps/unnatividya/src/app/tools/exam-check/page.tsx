import type { Metadata } from "next";
import Link from "next/link";
import { ExamCheck } from "@/components/exam-check";
import { FaqAccordion } from "@/components/faq-accordion";
import { JsonLd } from "@/components/json-ld";
import { withSocial } from "@/lib/page-metadata";
import { siteUrl } from "@/lib/seo-config";

export const metadata: Metadata = withSocial({
  title: "Online Exam Guide and Device Check: MUJ, SMU, Amity",
  description: "How Manipal University Jaipur, Sikkim Manipal University and Amity Online hold online proctored exams, and a free check of your computer, camera and microphone against their requirements.",
  alternates: { canonical: "/tools/exam-check" },
});

const faqs: Array<[string, string]> = [
  ["Are online degree exams taken from home?", "At MUJ and SMU, Online Manipal says exams are online proctored and taken from home on a computer that meets the requirements. Amity says all its exams are online and proctored. Confirm the arrangement for your exam cycle with the university."],
  ["Can I take the exam on a phone or tablet?", "MUJ and SMU need a desktop or laptop and say mobiles, tablets and iPads are not supported. Amity says tablets and mobile devices may not be supported."],
  ["Does this check record me?", "No. The camera and microphone start only when you click, the preview stays on your screen, and nothing is recorded or sent. They stop when you click Stop or leave the page."],
];

// Wave 5 B1: the online exams guide and device check.
export default function ExamCheckPage() {
  const host = siteUrl();
  return <>
    <JsonLd data={[
      { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: host },
        { "@type": "ListItem", position: 2, name: "Exams and device check", item: `${host}/tools/exam-check` },
      ] },
      { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faqs.map(([question, answer]) => ({ "@type": "Question", name: question, acceptedAnswer: { "@type": "Answer", text: answer } })) },
    ]} />
    <section className="uv-page-hero uvt-page-hero" aria-labelledby="exam-title">
      <div className="uv-page-hero-inner">
        <ol className="uv-breadcrumb" aria-label="Breadcrumb">
          <li><Link href="/">Home</Link></li>
          <li><span>Tools</span></li>
          <li><span aria-current="page">Exams and device check</span></li>
        </ol>
        <p className="uv-eyebrow">Free learner tool</p>
        <h1 id="exam-title" className="uv-h1">How online exams work, and is your computer ready?</h1>
        <p className="uv-lede">See how each university holds its online proctored exams, from its own pages, then check this computer, camera and microphone against what it asks for.</p>
      </div>
    </section>
    <div className="uv-shell uvt-page">
      <ExamCheck />
      <div className="uvt-faq">
        <FaqAccordion items={faqs} name="exam-check-faq" title="Questions about online exams" subtitle={null} id="sec-faq" />
      </div>
    </div>
  </>;
}
