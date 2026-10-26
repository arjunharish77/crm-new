export const dynamic = "force-dynamic";
import type { Metadata } from "next";
import { DegreeFamilyHub, type DegreeFamily } from "@/components/degree-family-hub";
import { PublishedCatalogBoundary } from "@/components/published-catalog-boundary";
import { getPublishedCatalog } from "@/lib/catalog-snapshot-server";
import { withSocial } from "@/lib/page-metadata";

export const metadata: Metadata = withSocial({
  title: "Online BCA, MCA, MSc Data Science and Mathematics: Which Fits You?",
  description: "Online BCA, MCA, MSc Data Science and MSc Mathematics at MUJ, SMU and Amity: entry requirements, fees, specialisations and roles, from the universities' own pages.",
  alternates: { canonical: "/online-degree-guides/computing" },
});

// Wave 5 cluster D2: computing, data and mathematics.
const family: DegreeFamily = {
  slug: "computing", tag: "Computing and data", crumb: "Computing, data and mathematics",
  title: "Online BCA, MCA, MSc Data Science and Mathematics: which fits you?",
  deck: "The computing, data and mathematics degrees we list at MUJ, SMU and Amity Online, side by side: who can join, what they cost, the specialisations and the roles the universities name.",
  groups: [
    { id: "after-12", title: "After Class 12", intro: "A bachelor's degree in computer applications. Entry is after Class 12; check each university's requirement for your subjects and marks.", keys: ["bca"] },
    { id: "after-degree", title: "After a bachelor's degree", intro: "Master's degrees in computer applications, data science and mathematics. Each asks for a bachelor's degree; some accept other streams with bridge courses or ask for mathematics.", keys: ["mca", "msc-data-science", "msc-mathematics"] },
  ],
  faqs: [
    ["Can I do an online MCA without a computing degree?", "At MUJ and SMU, graduates from other streams can join with compulsory bridge courses in computing, and in mathematics if they didn't study it. Amity prefers a BCA or equivalent, accepts science, commerce or arts graduates who studied mathematics at 10+2, and lets others apply after a bridge course. Check the current page for your session."],
    ["Is an online BCA or MCA equal to a regular one?", "Under regulation 22 of UGC's 2020 regulations, a degree earned online from an institution recognised for that program is treated as equivalent to the same degree in regular mode. Check the program's recognition for your session."],
    ["Which universities offer these degrees?", "BCA at MUJ and Amity; MCA at MUJ, SMU and Amity; MSc Data Science at Amity; MSc Mathematics at MUJ, among the programs we list."],
  ],
  related: [
    { href: "/tools/specialization-finder", label: "Find a specialisation by career goal" },
    { href: "/tools/eligibility-checker", label: "Eligibility checker" },
    { href: "/blog/mca-vs-mba-it-careers", label: "MBA or MCA if you work in IT" },
    { href: "/online-degree-guides/fees", label: "Online degree fees 2026-27" },
  ],
};

export default async function ComputingHubPage() {
  return <PublishedCatalogBoundary><Hub /></PublishedCatalogBoundary>;
}
async function Hub() { return <DegreeFamilyHub catalog={await getPublishedCatalog()} family={family} />; }
