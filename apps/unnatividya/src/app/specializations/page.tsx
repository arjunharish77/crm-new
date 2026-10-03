export const dynamic = "force-dynamic";
import { PublishedCatalogBoundary } from "@/components/published-catalog-boundary";
import { getPublishedCatalog } from "@/lib/catalog-snapshot-server";
import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/json-ld";
import { SpecializationExplorer } from "@/components/specialization-explorer";
import { allSpecializationPages } from "@/lib/specializations";

const SITE_URL = process.env.NEXT_PUBLIC_UNNATIVIDYA_SITE_URL || "https://unnatividya.com";

export const metadata: Metadata = {
  title: "Online Degree Specializations",
  description: "Explore listed online degree specializations by subject, degree and university, with links to course details and tuition.",
  alternates: { canonical: "/specializations" },
};

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

  return <PublishedCatalogBoundary>{(
    <>
      <JsonLd data={[breadcrumbJsonLd, itemListJsonLd]} />
      <div style={{ background: "#F7F8F9" }}>
        <div style={{ background: "#fff", borderBottom: "1px solid #EAEAEA" }}>
          <div className="container" style={{ paddingTop: 28, paddingBottom: 28 }}>
            <div className="breadcrumb" style={{ marginBottom: 8 }}>
              <Link href="/">Home</Link> &gt; Specializations
            </div>
            <h1 style={{ color: "#363634", fontSize: 28, fontWeight: 700, margin: 0 }}>Online degree specializations</h1>
            <div style={{ color: "#696868", fontSize: 14, marginTop: 6 }}>
              {pages.length} listed specializations to explore by subject, degree and university
            </div>
          </div>
        </div>

        <div className="container" style={{ paddingTop: 28, paddingBottom: 56 }}>
          <p style={{ margin: "0 0 24px", color: "#555", fontSize: 15, lineHeight: 1.65, maxWidth: 760 }}>
            Explore the specializations listed in our catalog. Fees and duration refer to the base degree; confirm current elective availability, selection timing and any additional fees with the university.
          </p>
          <SpecializationExplorer pages={pages} />
        </div>
      </div>
    </>
  )}</PublishedCatalogBoundary>;
}
