export const dynamic = "force-dynamic";
import { PublishedCatalogBoundary } from "@/components/published-catalog-boundary";
import { getPublishedCatalog } from "@/lib/catalog-snapshot-server";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Calculator, ChevronRight, GraduationCap, Headset, Compass, type LucideIcon } from "lucide-react";
import { ComparePicker } from "@/components/compare-picker";
import { FaqAccordion } from "@/components/faq-accordion";
import { JsonLd } from "@/components/json-ld";
import { allComparisonPairs } from "@/lib/comparisons";
import { withSocial } from "@/lib/page-metadata";

export const metadata: Metadata = withSocial({
  title: "Compare Online Degrees",
  description: "Compare online degree fees, duration, approvals, universities, and specialisations.",
  alternates: { canonical: "/compare" },
});

// General answers only (visible without the gate, so FAQPage data is appropriate). Corrected
// from the design's copy: per-program recognition, no full-payment plan, no universal EMI promise.
const compareFaqs: Array<[string, string]> = [
  ["Are these online programs UGC-entitled?", "Recognition is checked per program, not per university. Each course page shows the program's UGC-DEB 2026-27 result and the date we checked it. Check deb.ugc.ac.in again before you enrol."],
  ["How do I choose the right program?", "Start with the total fee and the eligibility rules, then compare duration and specialisations. Placement, package and hiring-partner figures are university-wide, not specific to one program. A counsellor can help you weigh them."],
  ["What does the fee in the comparison include?", "It is the listed total tuition. Where a university publishes separate fees for applicants outside India, they are shown in that university's own currency. Fees can change between sessions, so confirm them on the course page before you apply."],
  ["Why do I need to verify my email to see the comparison?", "The interactive comparison opens after you share your contact details and verify your email with a one-time code. Your selection stays on the page while you do this. The published comparison pages are open to everyone."],
  ["Can I pay in EMIs?", "The table shows the \"EMI from\" amount each program lists. EMI plans depend on the university's payment and loan partners and on approval, so confirm the terms before you apply."],
  ["Can I compare programs from different degrees?", "Yes, but like-for-like comparisons are the most useful: an MBA against another MBA, for example. The quick-start options pick the same degree at each university."],
];

export default async function ComparePage({ searchParams }: { searchParams?: Promise<{ add?: string | string[] }> }) {
  const catalog = await getPublishedCatalog();
  const { courses, courseWithUniversity } = catalog;
  const params = await searchParams;
  // params.add === undefined means the query param is absent entirely (first visit) -> show the
  // default pair (the client opens the learner's own compare list instead, if they have one).
  // params.add === "" means the user explicitly cleared every selection (by removing the last
  // picked course) -> must stay empty so the "select a program" state shows.
  const selectedIds = params?.add !== undefined ? [...new Set((Array.isArray(params.add) ? params.add : [params.add]).flatMap(value => value.split(",")))].filter(id => courses.some(course => course.id === id)).slice(0, 3) : ["mba-muj", "mba-amity"];
  const allCourses = courses.map(courseWithUniversity);
  const comparisonPairs = allComparisonPairs(catalog);
  const presets: Array<[string, string]> = ([
    ["MBA: all three", "mba-muj,mba-smu,mba-amity"],
    ["MCA: all three", "mca-muj,mca-smu,mca-amity"],
    ["BBA: all three", "bba-muj,bba-smu,bba-amity"],
    ["B.Com: all three", "bcom-muj,bcom-smu,bcom-amity"],
    ["BCA: MUJ vs Amity", "bca-muj,bca-amity"],
  ] as Array<[string, string]>).filter(([, add]) => add.split(",").every(id => courses.some(course => course.id === id)));
  const explore: Array<{ icon: LucideIcon; title: string; text: string; cta: string; href: string; lead?: boolean }> = [
    { icon: GraduationCap, title: "View all programs", text: `Explore all ${courses.length} programs from the three universities we list.`, cta: "View all programs", href: "/courses" },
    { icon: Compass, title: "Explore specializations", text: "Find the specialisation that fits your goals.", cta: "View specializations", href: "/specializations" },
    { icon: Calculator, title: "Plan the total cost", text: "Add up tuition and other costs for the program you choose.", cta: "Open the planner", href: "/tools/total-cost" },
    { icon: Headset, title: "Talk to a counsellor", text: "Get free guidance on choosing between programs.", cta: "Apply now", href: "/lead?intent=compare", lead: true },
  ];
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: compareFaqs.map(([question, answer]) => ({ "@type": "Question", name: question, acceptedAnswer: { "@type": "Answer", text: answer } })),
  };

  return <PublishedCatalogBoundary>{(
    <div className="uv-cmp-page">
      <JsonLd data={faqJsonLd} />
      <ComparePicker allCourses={allCourses} initialSelectedIds={selectedIds} presets={presets} />

      <div className="uv-shell uv-cmp-after">
        <section className="uv-section" aria-labelledby="compare-explore-title">
          <h2 id="compare-explore-title" className="uv-h2 is-inner">Explore more options</h2>
          <p className="uv-section-sub">Discover more programs, specialisations and planning tools.</p>
          <ul className="uv-cmp-explore">
            {explore.map(item => <li key={item.title}>
              <Link href={item.href} className="uv-cmp-explore-card" {...(item.lead ? { rel: "nofollow", "data-open-lead": true } : {})}>
                <span className="uv-icon-tile" aria-hidden="true"><item.icon size={24} /></span>
                <span>
                  <strong>{item.title}</strong>
                  <small>{item.text}</small>
                  <span className="uv-cmp-explore-cta">{item.cta} <ArrowRight size={14} aria-hidden="true" /></span>
                </span>
              </Link>
            </li>)}
          </ul>
        </section>

        {comparisonPairs.length ? <section className="uv-section" aria-labelledby="compare-published-title">
          <h2 id="compare-published-title" className="uv-cmp-label">Published comparison pages</h2>
          <ul className="uv-cmp-pairs">
            {comparisonPairs.map(pair => <li key={`${pair.key}/${pair.slug}`}>
              <Link href={`/compare/${pair.key}/${pair.slug}`}>
                <span>{pair.label}: {pair.left.university.shortName} vs {pair.right.university.shortName}</span>
                <ChevronRight size={18} aria-hidden="true" />
              </Link>
            </li>)}
          </ul>
        </section> : null}

        <div className="uv-section">
          <FaqAccordion items={compareFaqs} name="compare-faq" subtitle="Get quick answers to common questions about comparing programs." />
        </div>
      </div>
    </div>
  )}</PublishedCatalogBoundary>;
}
