export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import Link from "next/link";
import { PublishedCatalogBoundary } from "@/components/published-catalog-boundary";
import { EligibilityChecker } from "@/components/eligibility-checker";
import { JsonLd } from "@/components/json-ld";
import { getPublishedCatalog } from "@/lib/catalog-snapshot-server";
import { withSocial } from "@/lib/page-metadata";
import { siteUrl } from "@/lib/seo-config";
import { isCompleteEligibilityRule } from "@/lib/eligibility-rules";

export async function generateMetadata(): Promise<Metadata> {
  const catalog = await getPublishedCatalog();
  const hasRules = catalog.courses.some(course => isCompleteEligibilityRule(catalog.courseWithUniversity(course).eligibilityRules));
  return withSocial({ title: "Online Degree Eligibility Checker", description: "Check published online degree qualification and marks criteria by program and applicant category. See the official source and where the university must confirm your case.", alternates: { canonical: "/tools/eligibility-checker" }, robots: hasRules ? undefined : { index: false, follow: true } });
}

export default async function EligibilityCheckerPage({ searchParams }: { searchParams: Promise<{ course?: string | string[] }> }) {
  const params = await searchParams;
  const initialCourseId = typeof params.course === "string" ? params.course : "";
  const host = siteUrl();
  return <PublishedCatalogBoundary><>
    <JsonLd data={{ "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: host },
      { "@type": "ListItem", position: 2, name: "Eligibility checker", item: `${host}/tools/eligibility-checker` },
    ] }} />
    <section className="uv-page-hero uvt-page-hero" aria-labelledby="eligibility-title">
      <div className="uv-page-hero-inner">
        <ol className="uv-breadcrumb" aria-label="Breadcrumb">
          <li><Link href="/">Home</Link></li>
          <li><span>Tools</span></li>
          <li><span aria-current="page">Eligibility checker</span></li>
        </ol>
        <p className="uv-eyebrow">Free learner tool</p>
        <h1 id="eligibility-title" className="uv-h1">Check online degree eligibility criteria</h1>
        <p className="uv-lede">See how your qualification and marks compare with the official criteria we have reviewed for a program. No sign-up or personal details are needed to see a result.</p>
      </div>
    </section>
    <div className="uv-shell uvt-page uvt-elig-page">
      <EligibilityChecker initialCourseId={initialCourseId} />
      <section className="uvt-elig-explainer" aria-labelledby="eligibility-explainer-title"><h2 id="eligibility-explainer-title" className="uv-h2 is-inner">What the result means</h2>
        <div className="uvt-tiles">
          <div><span className="uvt-status is-success" aria-hidden="true">Matches published academic criteria</span><h3>Matches published criteria</h3><p>Your answers match the academic requirements recorded from the linked program page. The university still verifies your marks, institution, category, documents and admission session.</p></div>
          <div><span className="uvt-status is-warning" aria-hidden="true">Needs university confirmation</span><h3>Needs university confirmation</h3><p>A rule is missing, an accepted equivalent is unclear, or your answer needs evidence such as an AIU certificate or CGPA conversion. This is not a rejection.</p></div>
          <div><span className="uvt-status is-error" aria-hidden="true">Does not meet the selected published criteria</span><h3>Does not meet selected criteria</h3><p>At least one explicit qualification or marks threshold is not met for the category selected. Ask the university whether another recognised route applies before making a final decision.</p></div>
        </div>
      </section>
    </div>
  </></PublishedCatalogBoundary>;
}
