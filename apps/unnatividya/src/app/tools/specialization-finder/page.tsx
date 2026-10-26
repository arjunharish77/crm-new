export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import Link from "next/link";
import { FaqAccordion } from "@/components/faq-accordion";
import { JsonLd } from "@/components/json-ld";
import { PublishedCatalogBoundary } from "@/components/published-catalog-boundary";
import { SpecializationFinder } from "@/components/specialization-finder";
import { getPublishedCatalog } from "@/lib/catalog-snapshot-server";
import { allSpecializationPages } from "@/lib/specializations";
import type { FinderProgram, FinderSpecialization } from "@/lib/specialization-finder";
import { withSocial } from "@/lib/page-metadata";
import { siteUrl } from "@/lib/seo-config";

export const metadata: Metadata = withSocial({
  title: "Specialization Finder by Career Goal: Online Degrees",
  description: "Pick a career area to see the online degree specializations at MUJ, SMU and Amity whose names match it, and the programs that list related career roles.",
  alternates: { canonical: "/tools/specialization-finder" },
});

const faqs: Array<[string, string]> = [
  ["How does the finder choose specializations?", "It matches each career area against the names the universities give their specializations and the career roles they list. It does not rank programs or say which is better."],
  ["Does a matching specialization guarantee a job in that area?", "No. Universities list career roles their programs prepare you for; outcomes depend on your experience and effort. Check the curriculum on each program page."],
  ["Why isn't my specialization shown?", "Its name may not use the words this finder matches. Browse all specializations, or ask a counsellor about your goal."],
];

// Wave 5 B5: the specialization finder, from the published catalog.
export default function SpecializationFinderPage() {
  return <PublishedCatalogBoundary><FinderPage /></PublishedCatalogBoundary>;
}

async function FinderPage() {
  const catalog = await getPublishedCatalog();
  const specializations: FinderSpecialization[] = allSpecializationPages(catalog).map(page => ({
    slug: page.slug, specialization: page.specialization, courseLabel: page.courseLabel, level: page.courses[0]?.level || "",
    universities: [...new Set(page.courses.map(course => course.university.shortName))],
  }));
  const programs: FinderProgram[] = catalog.courses.map(catalog.courseWithUniversity).map(course => ({ slug: course.slug, name: course.name, university: course.university.shortName, level: course.level, roles: course.careerRoles || [] }));
  const host = siteUrl();
  return <>
    <JsonLd data={[
      { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: host },
        { "@type": "ListItem", position: 2, name: "Specialization finder", item: `${host}/tools/specialization-finder` },
      ] },
      { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faqs.map(([question, answer]) => ({ "@type": "Question", name: question, acceptedAnswer: { "@type": "Answer", text: answer } })) },
    ]} />
    <section className="uv-page-hero uvt-page-hero" aria-labelledby="finder-title">
      <div className="uv-page-hero-inner">
        <ol className="uv-breadcrumb" aria-label="Breadcrumb">
          <li><Link href="/">Home</Link></li>
          <li><span>Tools</span></li>
          <li><span aria-current="page">Specialization finder</span></li>
        </ol>
        <p className="uv-eyebrow">Free learner tool</p>
        <h1 id="finder-title" className="uv-h1">Find a specialization by career goal</h1>
        <p className="uv-lede">Choose the area you want to work in. You&apos;ll see the specializations and programs at MUJ, SMU and Amity whose names match it, with links to compare them. <Link href="/specializations" className="uv-link">Browse all specializations</Link></p>
      </div>
    </section>
    <div className="uv-shell uvt-page">
      <SpecializationFinder specializations={specializations} programs={programs} />
      <div className="uvt-faq">
        <FaqAccordion items={faqs} name="specialization-finder-faq" title="Questions about the finder" subtitle={null} id="sec-faq" />
      </div>
    </div>
  </>;
}
