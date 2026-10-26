export const dynamic = "force-dynamic";
import type { Metadata } from "next";
import Link from "next/link";
import { PublishedCatalogBoundary } from "@/components/published-catalog-boundary";
import { TotalCostPlanner } from "@/components/total-cost-planner";
import { FaqAccordion } from "@/components/faq-accordion";
import { JsonLd } from "@/components/json-ld";
import { withSocial } from "@/lib/page-metadata";
import { siteUrl } from "@/lib/seo-config";

export const metadata: Metadata = withSocial({
  title: "Online Degree Total Cost Planner",
  description: "Compare published online degree tuition by applicant category, see available semester schedules and plan for costs the university still needs to confirm.",
  alternates: { canonical: "/tools/total-cost" },
});

const faqs: Array<[string, string]> = [
  ["Does this show the exact amount I will pay?", "No. It shows the published tuition for a selected applicant category, or clearly labels a listed INR amount when category-specific fees are not yet published. Application, exam, resit, convocation, tax and financing charges may still apply."],
  ["Can I compare domestic and international fees?", "You can view each published category separately. The planner makes a direct comparison only when the selected programs have the same published category label and currency. It never converts currencies or uses a domestic INR amount as an NRI fee."],
  ["Why is a fee or semester schedule missing?", "The current published catalog does not contain a reviewed amount for that category or schedule. Check the linked university source and confirm your applicant category before applying."],
  ["Does the extra-cost allowance come from a university?", "No. It is an optional number you enter for your own planning. The subtotal is not a quote and does not certify that every mandatory charge has been included."],
];

export default async function TotalCostPage({ searchParams }: { searchParams: Promise<{ course?: string | string[]; category?: string | string[] }> }) {
  const params = await searchParams;
  // `course` takes one id, or up to three comma-separated ids (the fee guides link a whole degree).
  const initialCourseIds = typeof params.course === "string" ? [...new Set(params.course.split(",").map(id => id.trim()).filter(Boolean))].slice(0, 3) : [];
  const initialCategoryKey = initialCourseIds.length === 1 && typeof params.category === "string" && /^row-\d{1,2}$/.test(params.category) ? params.category : "";
  const host = siteUrl();
  const schema = [
    { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: host },
      { "@type": "ListItem", position: 2, name: "Total cost planner", item: `${host}/tools/total-cost` },
    ] },
    { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faqs.map(([question, answer]) => ({ "@type": "Question", name: question, acceptedAnswer: { "@type": "Answer", text: answer } })) },
  ];
  return <PublishedCatalogBoundary><>
    <JsonLd data={schema} />
    <section className="uv-page-hero uvt-page-hero" aria-labelledby="total-cost-title">
      <div className="uv-page-hero-inner">
        <ol className="uv-breadcrumb" aria-label="Breadcrumb">
          <li><Link href="/">Home</Link></li>
          <li><span>Tools</span></li>
          <li><span aria-current="page">Total cost planner</span></li>
        </ol>
        <p className="uv-eyebrow">Free learner tool</p>
        <h1 id="total-cost-title" className="uv-h1">Plan the full cost of an online degree</h1>
        <p className="uv-lede">See the tuition your university publishes for your applicant category, when semester amounts are available, and what you still need to confirm. No sign-up is needed.</p>
      </div>
    </section>
    <div className="uv-shell uvt-page uvt-cost-page">
      <TotalCostPlanner initialCourseIds={initialCourseIds} initialCategoryKey={initialCategoryKey} />
      <div className="uvt-faq uvt-cost-faq">
        <FaqAccordion items={faqs} name="total-cost-faq" title="Questions about online degree fees" subtitle="What the planner shows, and what to confirm with the university." id="sec-faq" />
      </div>
    </div>
  </></PublishedCatalogBoundary>;
}
