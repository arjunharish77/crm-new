import type { Metadata } from "next";
import Link from "next/link";
import { FaqAccordion } from "@/components/faq-accordion";
import { JsonLd } from "@/components/json-ld";
import { ModeHelper } from "@/components/mode-helper";
import { withSocial } from "@/lib/page-metadata";
import { siteUrl } from "@/lib/seo-config";

export const metadata: Metadata = withSocial({
  title: "Online, Distance or Regular Degree? Mode Helper",
  description: "Answer four questions to see whether online, distance (ODL) or regular study fits you, with what UGC's 2020 regulations say about teaching, exams and equivalence.",
  alternates: { canonical: "/tools/mode-helper" },
});

const faqs: Array<[string, string]> = [
  ["Is an online degree equal to a regular degree?", "Yes, if the institution is recognised for that program in online mode. Regulation 22 of UGC's 2020 regulations treats degrees awarded in ODL or online mode by recognised institutions as equivalent to the same degrees in regular mode."],
  ["Which mode are the programs on Unnati Vidya?", "All the programs we list at Manipal University Jaipur, Sikkim Manipal University and Amity Online are offered in online mode. Use the recognition check to see each program's published 2026-27 status."],
  ["Does this helper recommend a program?", "No. It only sorts the three modes by your answers, using the regulations. Your answers stay on this page and are not saved or sent."],
];

// Wave 5 B2: the online vs distance vs regular helper.
export default function ModeHelperPage() {
  const host = siteUrl();
  return <>
    <JsonLd data={[
      { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: host },
        { "@type": "ListItem", position: 2, name: "Mode helper", item: `${host}/tools/mode-helper` },
      ] },
      { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faqs.map(([question, answer]) => ({ "@type": "Question", name: question, acceptedAnswer: { "@type": "Answer", text: answer } })) },
    ]} />
    <section className="uv-page-hero uvt-page-hero" aria-labelledby="mode-title">
      <div className="uv-page-hero-inner">
        <ol className="uv-breadcrumb" aria-label="Breadcrumb">
          <li><Link href="/">Home</Link></li>
          <li><span>Tools</span></li>
          <li><span aria-current="page">Mode helper</span></li>
        </ol>
        <p className="uv-eyebrow">Free learner tool</p>
        <h1 id="mode-title" className="uv-h1">Online, distance or regular: which fits you?</h1>
        <p className="uv-lede">Answer four questions about your situation. You&apos;ll see how each mode fits, explained with what UGC&apos;s 2020 regulations say about teaching, exams and equivalence. No sign-up, and nothing is saved.</p>
      </div>
    </section>
    <div className="uv-shell uvt-page">
      <ModeHelper />
      <div className="uvt-faq">
        <FaqAccordion items={faqs} name="mode-helper-faq" title="Questions about study modes" subtitle={null} id="sec-faq" />
      </div>
    </div>
  </>;
}
