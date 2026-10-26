export const dynamic = "force-dynamic";
import { PublishedCatalogBoundary } from "@/components/published-catalog-boundary";
import { getPublishedCatalog } from "@/lib/catalog-snapshot-server";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpenText, ClipboardCheck, Globe, IndianRupee, Laptop, MonitorPlay } from "lucide-react";
import { JsonLd } from "@/components/json-ld";
import { GuideExplorer, GuideTopicPills, type GuideListing } from "@/components/guide-explorer";
import { Breadcrumb } from "@/components/reading-page";
import { ToolTiles } from "@/components/hub-tool-tiles";
import { feeGuides, formatFee } from "@/lib/fee-guides";
import { allCareerScopeGuides, allEligibilityGuides, allUgcApprovalGuides } from "@/data/guide-content";
import { withSocial } from "@/lib/page-metadata";

export const metadata: Metadata = withSocial({
  title: "Online Degree Guides",
  description: "Explore online degree guides by program and topic: fees, eligibility, career scope and recognition.",
  alternates: { canonical: "/online-degree-guides" },
});

// Guides hub in the design's hub layout (Guides.dc.html; plan §10 Q11: two hubs). The featured
// guide is the Online MBA fee comparison when it exists (the design's pick), else the first fee guide.
export default async function FeeGuidesIndexPage() {
  const catalog = await getPublishedCatalog();
  const guides: GuideListing[] = [
    ...feeGuides(catalog).map(guide => ({ slug: guide.slug, degree: guide.label, topic: "Fees & payments", title: `${guide.label} fees`, description: `Listed tuition ${formatFee(guide.lowestFee)}–${formatFee(guide.highestFee)}. Explore program fees and payment details.` })),
    ...allEligibilityGuides().map(guide => ({ slug: guide.slug, degree: guide.label, topic: "Eligibility & admission", title: `${guide.label} eligibility`, description: "Explore entry requirements and points to confirm before applying.", date: guide.lastReviewed })),
    ...allCareerScopeGuides().map(guide => ({ slug: guide.slug, degree: guide.label, topic: "Career scope", title: `${guide.label} career scope`, description: "Explore career paths and the context behind published outcome figures.", date: guide.lastReviewed })),
    ...allUgcApprovalGuides().map(guide => ({ slug: guide.slug, degree: guide.label, topic: "Recognition & validity", title: `Is ${guide.label} UGC approved?`, description: "Understand recognition checks and the importance of program and admission-session evidence." })),
  ];
  const featuredSlug = (guides.find(guide => guide.slug === "mba-fees") || guides[0])?.slug;
  const siteUrl = process.env.NEXT_PUBLIC_UNNATIVIDYA_SITE_URL || "https://unnatividya.com";
  const breadcrumb = { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "Home", item: siteUrl }, { "@type": "ListItem", position: 2, name: "Online Degree Guides", item: `${siteUrl}/online-degree-guides` }] };
  const list = { "@context": "https://schema.org", "@type": "ItemList", itemListElement: guides.map((guide, index) => ({ "@type": "ListItem", position: index + 1, name: `${guide.degree}: ${guide.topic}`, url: `${siteUrl}/online-degree-guides/${guide.slug}` })) };
  return <PublishedCatalogBoundary><JsonLd data={[breadcrumb, list]} />
    <div className="uv-g-hub">
      <section className="uv-page-hero" aria-labelledby="guides-title">
        <div className="uv-page-hero-inner uv-g-hero">
          <Breadcrumb items={[{ label: "Home", href: "/" }, { label: "Online degree guides" }]} />
          <h1 id="guides-title" className="uv-h1">Online degree guides</h1>
          <p className="uv-lede">Find information by degree and topic, from tuition and entry requirements to careers and recognition.</p>
          <p className="uv-g-note">By <Link href="/authors/content-team">Content Team, Unnati Vidya</Link>. Confirm current fees, requirements and admission-session recognition with the university. <Link href="/how-we-verify">How we verify information</Link> · <Link href="/blog">Browse articles</Link></p>
          <GuideTopicPills guides={guides} />
        </div>
      </section>
      <div className="uv-shell uv-g-main">
        <div className="uv-g-hublinks">
        <Link href="/online-degree-guides/fees" className="uv-g-hublink">
          <span className="uv-g-hublink-icon" aria-hidden="true"><IndianRupee size={20} /></span>
          <span><strong>Online degree fees 2026-27</strong><span>Listed tuition for all {catalog.courses.length} programs at MUJ, SMU and Amity, on one page.</span></span>
          <ArrowRight size={18} aria-hidden="true" className="uv-g-hublink-arrow" />
        </Link>
        <Link href="/online-degree-guides/admissions" className="uv-g-hublink">
          <span className="uv-g-hublink-icon" aria-hidden="true"><ClipboardCheck size={20} /></span>
          <span><strong>How to apply</strong><span>Eligibility, documents and each university&apos;s admission steps, in order.</span></span>
          <ArrowRight size={18} aria-hidden="true" className="uv-g-hublink-arrow" />
        </Link>
          <Link href="/online-degree-guides/international" className="uv-g-hublink">
            <span className="uv-g-hublink-icon" aria-hidden="true"><Globe size={20} /></span>
            <span><strong>NRIs and international learners</strong><span>Fees outside India, documents, exams from abroad and the DEB-ID.</span></span>
            <ArrowRight size={18} aria-hidden="true" className="uv-g-hublink-arrow" />
          </Link>
          <Link href="/online-degree-guides/computing" className="uv-g-hublink">
            <span className="uv-g-hublink-icon" aria-hidden="true"><Laptop size={20} /></span>
            <span><strong>Computing, data and mathematics</strong><span>BCA, MCA, MSc Data Science and MSc Mathematics side by side.</span></span>
            <ArrowRight size={18} aria-hidden="true" className="uv-g-hublink-arrow" />
          </Link>
          <Link href="/online-degree-guides/commerce-humanities" className="uv-g-hublink">
            <span className="uv-g-hublink-icon" aria-hidden="true"><BookOpenText size={20} /></span>
            <span><strong>Commerce, humanities and media</strong><span>B.Com, BBA, BA, M.Com, MA and JMC side by side.</span></span>
            <ArrowRight size={18} aria-hidden="true" className="uv-g-hublink-arrow" />
          </Link>
          <Link href="/online-degree-guides/online-learning" className="uv-g-hublink">
            <span className="uv-g-hublink-icon" aria-hidden="true"><MonitorPlay size={20} /></span>
            <span><strong>How online learning works</strong><span>Classes, exams, UGC&apos;s rules and planning your time.</span></span>
            <ArrowRight size={18} aria-hidden="true" className="uv-g-hublink-arrow" />
          </Link>
        </div>
        <GuideExplorer guides={guides} featuredSlug={featuredSlug} />
        <ToolTiles tools={["recommender", "emi", "eligibility"]} />
      </div>
    </div>
  </PublishedCatalogBoundary>;
}
