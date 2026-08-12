import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/json-ld";
import { feeGuides, formatFee } from "@/lib/fee-guides";
import { allCareerScopeGuides, allEligibilityGuides, allUgcApprovalGuides } from "@/data/guide-content";

export const metadata: Metadata = {
  title: "Online Degree Guides",
  description: "Verified fee, eligibility, career-scope, and UGC-approval guides for online MBA, BBA, BCA, MCA, BCom, MCom, BA, and MA programs, compared across UGC-entitled universities.",
  alternates: { canonical: "/online-degree-guides" },
};

function levelBadge(level: "UG" | "PG") {
  return (
    <span style={{ fontSize: 11, fontWeight: 700, color: level === "PG" ? "#4D00FF" : "#0F5BB8", background: level === "PG" ? "rgba(77,0,255,0.10)" : "rgba(79,168,255,0.12)", borderRadius: 999, whiteSpace: "nowrap", padding: "3px 9px" }}>
      {level}
    </span>
  );
}

export default function FeeGuidesIndexPage() {
  const guides = feeGuides();
  const eligibilityGuides = allEligibilityGuides();
  const careerScopeGuides = allCareerScopeGuides();
  const ugcApprovalGuides = allUgcApprovalGuides();
  const levelByKey = new Map(guides.map((guide) => [guide.key, guide.courses[0].level]));
  const featured = guides.find((guide) => guide.key === "mba") || guides[0];
  const siteUrl = process.env.NEXT_PUBLIC_UNNATIVIDYA_SITE_URL || "https://unnatividya.com";

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: siteUrl },
      { "@type": "ListItem", position: 2, name: "Online Degree Guides", item: `${siteUrl}/online-degree-guides` },
    ],
  };
  const itemListJsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: [
      ...guides.map((guide) => ({ url: `${siteUrl}/online-degree-guides/${guide.slug}`, name: `${guide.label} fees` })),
      ...eligibilityGuides.map((guide) => ({ url: `${siteUrl}/online-degree-guides/${guide.slug}`, name: `${guide.label} eligibility` })),
      ...careerScopeGuides.map((guide) => ({ url: `${siteUrl}/online-degree-guides/${guide.slug}`, name: `${guide.label} career scope` })),
      ...ugcApprovalGuides.map((guide) => ({ url: `${siteUrl}/online-degree-guides/${guide.slug}`, name: `Is ${guide.label} UGC approved` })),
    ].map((item, index) => ({ "@type": "ListItem", position: index + 1, ...item })),
  };

  return (
    <>
      <JsonLd data={[breadcrumbJsonLd, itemListJsonLd]} />
      <div style={{ background: "#F7F8F9" }}>
        <div style={{ background: "#fff", borderBottom: "1px solid #EAEAEA" }}>
          <div className="container" style={{ paddingTop: 28, paddingBottom: 28 }}>
            <div className="breadcrumb" style={{ marginBottom: 8 }}>
              <Link href="/">Home</Link> &gt; Online Degree Guides
            </div>
            <h1 style={{ color: "#363634", fontSize: 28, fontWeight: 700, margin: 0 }}>Online degree guides</h1>
            <div style={{ color: "#696868", fontSize: 14, marginTop: 6 }}>
              {guides.length} verified fee guides, plus eligibility, career-scope, and UGC-approval guides for our most-researched programs
            </div>
          </div>
        </div>

        <div className="container" style={{ paddingTop: 28, paddingBottom: 56 }}>
          <p style={{ margin: "0 0 24px", color: "#555", fontSize: 15, lineHeight: 1.65, maxWidth: 760 }}>
            Each guide below shows the exact total fee, EMI, and duration for a program — compared across every UGC-entitled
            university we list when more than one offers it, or explained in detail (including scholarship categories) when
            only one does. All figures are pulled from the same verified data behind our individual course pages.
          </p>

          {featured ? (
            <Link
              href={`/online-degree-guides/${featured.slug}`}
              className="card uv-card"
              style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 20, alignItems: "center", padding: 24, color: "inherit", marginBottom: 32 }}
            >
              <span style={{ fontSize: 11, fontWeight: 700, color: "#544CC8", background: "rgba(84,76,200,0.10)", borderRadius: 999, padding: "4px 10px", whiteSpace: "nowrap" }}>MOST READ GUIDE</span>
              <div>
                <div style={{ fontSize: 19, fontWeight: 700, color: "#363634" }}>The complete guide to an online {featured.label} in India</div>
                <div style={{ fontSize: 14, color: "#555", marginTop: 6, maxWidth: 640 }}>
                  {featured.courses.length} universities, {formatFee(featured.lowestFee)} to {formatFee(featured.highestFee)}. What actually separates them, what the fee buys, and who should pick which.
                </div>
                <div style={{ fontSize: 13, color: "#707070", marginTop: 10 }}>
                  {featured.courses.length} universities compared · Read the guide →
                </div>
              </div>
            </Link>
          ) : null}

          <div className="grid three">
            {guides.map((guide) => (
              <Link href={`/online-degree-guides/${guide.slug}`} className="card uv-card" style={{ display: "block", padding: 18, color: "inherit" }} key={guide.slug}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "#363634" }}>{guide.label}</div>
                  {levelBadge(guide.courses[0].level)}
                </div>
                <div style={{ fontSize: 13, color: "#707070", marginTop: 4 }}>
                  {guide.isComparison
                    ? `${guide.courses.length} universities · ${formatFee(guide.lowestFee)} – ${formatFee(guide.highestFee)}`
                    : `${guide.courses[0].university.shortName} · ${formatFee(guide.lowestFee)}`}
                </div>
                <div style={{ fontSize: 13, color: "#544CC8", fontWeight: 700, marginTop: 10 }}>
                  {guide.isComparison ? "Compare fees" : "View fee breakdown"} →
                </div>
              </Link>
            ))}
          </div>

          <h2 style={{ marginTop: 48 }}>Eligibility, career-scope, and UGC-approval guides</h2>
          <p style={{ margin: "0 0 24px", color: "#555", fontSize: 15, lineHeight: 1.65, maxWidth: 760 }}>
            These go deeper than fees — real per-university eligibility differences, career outcomes with unverified claims
            explicitly flagged, and UGC-DEB approval evidence checked against the primary government source.
          </p>
          <div className="grid three">
            {eligibilityGuides.map((guide) => (
              <Link href={`/online-degree-guides/${guide.slug}`} className="card uv-card" style={{ display: "block", padding: 18, color: "inherit" }} key={guide.slug}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "#363634" }}>{guide.label}</div>
                  {levelByKey.has(guide.key) ? levelBadge(levelByKey.get(guide.key)!) : null}
                </div>
                <div style={{ fontSize: 13, color: "#707070", marginTop: 4 }}>Eligibility & admission</div>
                <div style={{ fontSize: 13, color: "#544CC8", fontWeight: 700, marginTop: 10 }}>Check eligibility →</div>
              </Link>
            ))}
            {careerScopeGuides.map((guide) => (
              <Link href={`/online-degree-guides/${guide.slug}`} className="card uv-card" style={{ display: "block", padding: 18, color: "inherit" }} key={guide.slug}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "#363634" }}>{guide.label}</div>
                  {levelByKey.has(guide.key) ? levelBadge(levelByKey.get(guide.key)!) : null}
                </div>
                <div style={{ fontSize: 13, color: "#707070", marginTop: 4 }}>Career scope & salary</div>
                <div style={{ fontSize: 13, color: "#544CC8", fontWeight: 700, marginTop: 10 }}>See career scope →</div>
              </Link>
            ))}
            {ugcApprovalGuides.map((guide) => (
              <Link href={`/online-degree-guides/${guide.slug}`} className="card uv-card" style={{ display: "block", padding: 18, color: "inherit" }} key={guide.slug}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "#363634" }}>Is {guide.label} UGC approved?</div>
                  {levelByKey.has(guide.key) ? levelBadge(levelByKey.get(guide.key)!) : null}
                </div>
                <div style={{ fontSize: 13, color: "#707070", marginTop: 4 }}>Validity & approval</div>
                <div style={{ fontSize: 13, color: "#544CC8", fontWeight: 700, marginTop: 10 }}>Check validity →</div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
