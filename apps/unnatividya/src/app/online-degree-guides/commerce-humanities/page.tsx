export const dynamic = "force-dynamic";
import type { Metadata } from "next";
import { DegreeFamilyHub, type DegreeFamily } from "@/components/degree-family-hub";
import { PublishedCatalogBoundary } from "@/components/published-catalog-boundary";
import { getPublishedCatalog } from "@/lib/catalog-snapshot-server";
import { withSocial } from "@/lib/page-metadata";

export const metadata: Metadata = withSocial({
  title: "Online B.Com, BBA, BA, M.Com and MA: Options and Fees",
  description: "Online commerce, business, humanities and media degrees at MUJ, SMU and Amity: entry requirements, fees, specialisations and roles, from the universities' own pages.",
  alternates: { canonical: "/online-degree-guides/commerce-humanities" },
});

// Wave 5 cluster D3: commerce, business, humanities and media. BBA sits here because no other hub
// covers it (the MBA has its own hub article).
const family: DegreeFamily = {
  slug: "commerce-humanities", tag: "Commerce and humanities", crumb: "Commerce, humanities and media",
  title: "Online B.Com, BBA, BA, M.Com and MA: options and fees",
  deck: "The commerce, business, humanities and media degrees we list at MUJ, SMU and Amity Online, side by side: who can join, what they cost, the specialisations and the roles the universities name.",
  groups: [
    { id: "commerce-business", title: "Commerce and business", intro: "Bachelor's degrees after Class 12 and the M.Com after a degree.", keys: ["b-com", "b-com-honours", "bba", "m-com"] },
    { id: "humanities", title: "Humanities and social sciences", intro: "The BA after Class 12, and master's degrees in English, political science, sociology, economics and public policy after a degree.", keys: ["ba", "ma-english", "ma-political-science", "ma-sociology", "ma-economics", "ma-public-policy-governance"] },
    { id: "media", title: "Journalism and mass communication", intro: "BA JMC after Class 12 and MA JMC after a degree.", keys: ["ba-jmc", "ma-jmc"] },
  ],
  faqs: [
    ["Is an online B.Com or BA equal to a regular one?", "Under regulation 22 of UGC's 2020 regulations, a degree earned online from an institution recognised for that program is treated as equivalent to the same degree in regular mode. Check the program's recognition for your session."],
    ["What's the difference between a B.Com and a B.Com Honours?", "They are different programs, with different curricula and fees. Amity offers the B.Com Honours among the programs we list; compare the curriculum on each program page, and see our article on the two Amity programs."],
    ["Can I join a master's in a subject I didn't study at degree level?", "It depends on the university and the program. Each degree's eligibility guide lists the requirement as the university states it; confirm your case before you apply."],
  ],
  related: [
    { href: "/blog/online-bcom-vs-bcom-honours-amity", label: "B.Com or B.Com Honours at Amity" },
    { href: "/tools/specialization-finder", label: "Find a specialisation by career goal" },
    { href: "/tools/eligibility-checker", label: "Eligibility checker" },
    { href: "/online-degree-guides/fees", label: "Online degree fees 2026-27" },
  ],
};

export default async function CommerceHumanitiesHubPage() {
  return <PublishedCatalogBoundary><Hub /></PublishedCatalogBoundary>;
}
async function Hub() { return <DegreeFamilyHub catalog={await getPublishedCatalog()} family={family} />; }
