import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/json-ld";
import { formatFee } from "@/data/catalog";
import { allSpecializationPages } from "@/lib/specializations";

const SITE_URL = process.env.NEXT_PUBLIC_UNNATIVIDYA_SITE_URL || "https://unnatividya.com";

export const metadata: Metadata = {
  title: "Online Degree Specializations",
  description: "Compare online MBA, BBA, BCA, MCA, and other degree specializations across UGC-entitled universities — fees, EMI, and duration for each.",
  alternates: { canonical: "/specializations" },
};

export default function SpecializationsIndexPage() {
  const pages = allSpecializationPages();

  const grouped = new Map<string, typeof pages>();
  for (const page of pages) {
    const list = grouped.get(page.courseLabel) || [];
    list.push(page);
    grouped.set(page.courseLabel, list);
  }

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

  return (
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
              {pages.length} real specialization tracks across our catalog, sourced from each university&apos;s own program pages
            </div>
          </div>
        </div>

        <div className="container" style={{ paddingTop: 28, paddingBottom: 56 }}>
          <p style={{ margin: "0 0 24px", color: "#555", fontSize: 15, lineHeight: 1.65, maxWidth: 760 }}>
            Every specialization below is a real elective track a university actually publishes on its own program page —
            compared across universities where more than one offers it, or shown on its own where only one does. Fee, EMI,
            and duration reflect the base degree program; the specialization is an elective track within it.
          </p>
          {[...grouped.entries()].map(([label, group]) => (
            <div key={label} style={{ marginBottom: 32 }}>
              <h2 style={{ fontSize: 18, marginBottom: 12 }}>{label}</h2>
              <div className="grid three">
                {group.map((page) => (
                  <Link href={`/specializations/${page.slug}`} className="card uv-card" style={{ display: "block", padding: 18, color: "inherit" }} key={page.slug}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "#363634" }}>{page.specialization}</div>
                    <div style={{ fontSize: 13, color: "#707070", marginTop: 4 }}>
                      {page.isComparison
                        ? `${page.courses.length} universities · from ${formatFee(page.courses[0].fee)}`
                        : `${page.courses[0].university.shortName} · ${formatFee(page.courses[0].fee)}`}
                    </div>
                    <div style={{ fontSize: 13, color: "#544CC8", fontWeight: 700, marginTop: 10 }}>
                      {page.isComparison ? "Compare universities" : "View details"} →
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
