export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import Link from "next/link";
import { PublishedCatalogBoundary } from "@/components/published-catalog-boundary";
import { DocumentChecklist } from "@/components/document-checklist";
import { JsonLd } from "@/components/json-ld";
import { withSocial } from "@/lib/page-metadata";
import { siteUrl } from "@/lib/seo-config";

export const metadata: Metadata = withSocial({
  title: "Online Degree Admission Document Checklist",
  description: "A printable checklist of the documents MUJ, SMU and Amity Online list for online degree admission, by program and applicant category, with the official sources.",
  alternates: { canonical: "/tools/document-checklist" },
});

// Wave 4 A1: admission document checklist (tool 2 in the next-phase plan).
export default async function DocumentChecklistPage({ searchParams }: { searchParams: Promise<{ course?: string | string[]; category?: string | string[] }> }) {
  const params = await searchParams;
  const initialCourseId = typeof params.course === "string" ? params.course : "";
  const initialCategory = params.category === "nri" || params.category === "foreign" ? params.category : "indian";
  const host = siteUrl();
  return <PublishedCatalogBoundary><>
    <JsonLd data={{ "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: host },
      { "@type": "ListItem", position: 2, name: "Document checklist", item: `${host}/tools/document-checklist` },
    ] }} />
    <section className="uv-page-hero uvt-page-hero" aria-labelledby="documents-title">
      <div className="uv-page-hero-inner">
        <ol className="uv-breadcrumb" aria-label="Breadcrumb">
          <li><Link href="/">Home</Link></li>
          <li><span>Tools</span></li>
          <li><span aria-current="page">Document checklist</span></li>
        </ol>
        <p className="uv-eyebrow">Free learner tool</p>
        <h1 id="documents-title" className="uv-h1">Admission document checklist</h1>
        <p className="uv-lede">See the documents your university lists for online admission, tick them off as you gather them, and print the list. No sign-up needed.</p>
      </div>
    </section>
    <div className="uv-shell uvt-page uvt-docs-page">
      <DocumentChecklist initialCourseId={initialCourseId} initialCategory={initialCategory} />
    </div>
  </></PublishedCatalogBoundary>;
}
