export const dynamic = "force-dynamic";
import { PublishedCatalogBoundary } from "@/components/published-catalog-boundary";
import { getPublishedCatalog } from "@/lib/catalog-snapshot-server";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { JsonLd } from "@/components/json-ld";
import { SpecializationFilters, SpecializationResults } from "@/components/specialization-explorer";
import { allSpecializationPages } from "@/lib/specializations";
import { withSocial } from "@/lib/page-metadata";

const SITE_URL = process.env.NEXT_PUBLIC_UNNATIVIDYA_SITE_URL || "https://unnatividya.com";

export const metadata: Metadata = withSocial({
  title: "Online Degree Specializations",
  description: "Explore listed online degree specializations by subject, degree and university, with links to course details and tuition.",
  alternates: { canonical: "/specializations" },
});

export default async function SpecializationsIndexPage() {
  const catalog = await getPublishedCatalog();
  const pages = allSpecializationPages(catalog).map((page) => ({ ...page, stream: page.courses[0].stream }));

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Specializations", item: `${SITE_URL}/specializations` },
    ],
  };
  const itemListJsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: pages.map((page, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: `${SITE_URL}/specializations/${page.slug}`,
      name: `${page.courseLabel} in ${page.specialization}`,
    })),
  };

  // Degree names for the sub-heading, most specializations first, computed from the catalog.
  const degreeCounts = new Map<string, number>();
  for (const page of pages) degreeCounts.set(page.courseLabel, (degreeCounts.get(page.courseLabel) || 0) + 1);
  const topDegrees = [...degreeCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([label]) => label.replace(/^Online /, ""));
  const degreeList = topDegrees.length > 5 ? `${topDegrees.slice(0, 5).join(", ")} and more` : topDegrees.join(", ");

  return <PublishedCatalogBoundary>{(
    <div className="uvs-page">
      <JsonLd data={[breadcrumbJsonLd, itemListJsonLd]} />
      <section className="uv-page-hero">
        <div className="uv-page-hero-inner uvs-hero-inner">
          <nav aria-label="Breadcrumb">
            <ol className="uv-breadcrumb">
              <li><Link href="/">Home</Link></li>
              <li><span aria-current="page">Specializations</span></li>
            </ol>
          </nav>
          <h1 className="uv-h1">Explore specializations</h1>
          <p className="uvu-hero-sub">{pages.length} specializations across {degreeList}. See which universities offer each one.</p>
          <SpecializationFilters pages={pages} />
          <p className="uvs-note">Fees and duration refer to the base degree; confirm current elective availability, selection timing and any additional fees with the university.</p>
        </div>
      </section>

      <div className="uv-shell">
        <SpecializationResults pages={pages} />

        <section className="uvu-navy-strip uvs-cta" aria-labelledby="spec-cta-title">
          <div>
            <h2 id="spec-cta-title">Not sure which specialization fits?</h2>
            <p>Answer five quick questions and see programs that match your answers.</p>
          </div>
          <div className="uvu-navy-actions">
            <Link href="/recommender" className="btn on-navy">Find my course <ArrowRight size={18} aria-hidden="true" /></Link>
          </div>
        </section>
      </div>
    </div>
  )}</PublishedCatalogBoundary>;
}
