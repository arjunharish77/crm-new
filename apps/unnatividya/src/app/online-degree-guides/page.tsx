export const dynamic = "force-dynamic";
import { PublishedCatalogBoundary } from "@/components/published-catalog-boundary";
import { getPublishedCatalog } from "@/lib/catalog-snapshot-server";
import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/json-ld";
import { GuideExplorer, type GuideListing } from "@/components/guide-explorer";
import { feeGuides, formatFee } from "@/lib/fee-guides";
import { allCareerScopeGuides, allEligibilityGuides, allUgcApprovalGuides } from "@/data/guide-content";

export const metadata: Metadata = {
  title: "Online Degree Guides",
  description: "Explore online degree guides by program and topic: fees, eligibility, career scope and recognition.",
  alternates: { canonical: "/online-degree-guides" },
};
export default async function FeeGuidesIndexPage() {
  const catalog = await getPublishedCatalog();
  const guides: GuideListing[] = [
    ...feeGuides(catalog).map(guide=>({slug:guide.slug,degree:guide.label,topic:"Fees & payments",description:`Listed tuition ${formatFee(guide.lowestFee)}–${formatFee(guide.highestFee)}. Explore program fees and payment details.`})),
    ...allEligibilityGuides().map(guide=>({slug:guide.slug,degree:guide.label,topic:"Eligibility & admission",description:"Explore entry requirements and points to confirm before applying."})),
    ...allCareerScopeGuides().map(guide=>({slug:guide.slug,degree:guide.label,topic:"Career scope",description:"Explore career paths and the context behind published outcome figures."})),
    ...allUgcApprovalGuides().map(guide=>({slug:guide.slug,degree:guide.label,topic:"Recognition & validity",description:"Understand recognition checks and the importance of program and admission-session evidence."})),
  ];
  const siteUrl=process.env.NEXT_PUBLIC_UNNATIVIDYA_SITE_URL||"https://unnatividya.com";
  const breadcrumb={"@context":"https://schema.org","@type":"BreadcrumbList",itemListElement:[{"@type":"ListItem",position:1,name:"Home",item:siteUrl},{"@type":"ListItem",position:2,name:"Online Degree Guides",item:`${siteUrl}/online-degree-guides`}]};
  const list={"@context":"https://schema.org","@type":"ItemList",itemListElement:guides.map((guide,index)=>({"@type":"ListItem",position:index+1,name:`${guide.degree}: ${guide.topic}`,url:`${siteUrl}/online-degree-guides/${guide.slug}`}))};
  return <PublishedCatalogBoundary><JsonLd data={[breadcrumb,list]} /><div className="guide-index">
    <header className="container"><p className="breadcrumb"><Link href="/">Home</Link> &gt; Online Degree Guides</p><h1>Online degree guides</h1><p>Find information by degree and topic, from tuition and entry requirements to careers and recognition.</p><p className="guide-index-note">By Content Team, Unnati Vidya. Confirm current fees, requirements and admission-session recognition with the university. <Link href="/how-we-verify">How we verify information</Link></p></header>
    <div className="container"><GuideExplorer guides={guides} /></div>
  </div></PublishedCatalogBoundary>;
}
