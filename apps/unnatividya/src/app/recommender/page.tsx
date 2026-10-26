export const dynamic = "force-dynamic";
import { PublishedCatalogBoundary } from "@/components/published-catalog-boundary";
import { getPublishedCatalog } from "@/lib/catalog-snapshot-server";
import type { Metadata } from "next";
import { JsonLd } from "@/components/json-ld";
import { FaqAccordion } from "@/components/faq-accordion";
import { RecommenderQuiz } from "@/components/recommender-quiz";
import { withSocial } from "@/lib/page-metadata";

export const metadata: Metadata = withSocial({
  title: "Find Your Online Course",
  description: "Answer a few questions and shortlist online degree programs that fit your goal and budget.",
  alternates: { canonical: "/recommender" },
});

const FAQS: Array<[string, string]> = [
  ["How are courses matched?", "The tool first filters published programs by degree level, completed qualification, subject and maximum listed tuition. It suggests up to three options, with a few more matching programs below them. Your cost or duration priority affects their order. It does not rank course quality or confirm admission eligibility."],
  ["Does this tool use AI?", "When configured and available, Groq helps order the filtered options and chooses explanations tied to published course facts. It cannot add programs outside your filters or change fees and source links. If unavailable, standard filter results remain visible."],
  ["Do I need to sign up?", "No. Matching is free and does not require contact details. Apply now opens a separate enquiry form. Usage analytics follow the site's privacy policy."],
  ["What if there are no matches?", "Edit your degree level, qualification, subject or budget, or browse the full catalog. The tool does not silently recommend courses outside your selected filters."],
  ["Can I ask follow-up questions?", "Yes. Ask about the shortlisted programs' listed tuition, duration, eligibility checks, recognition evidence or next steps. The answers stay within the published catalog and point to the course or official source; unrelated questions are declined."],
  ["How is the match percentage worked out?", "Each program you see gets up to 100 points from your own answers and listed facts: subject 35, degree level and qualification 25, budget headroom (how far the listed tuition is under your budget) 25, and your stated priority of lower tuition or shorter duration 15. Answers such as \"Explore all subjects\" or \"No budget limit yet\" score in the middle. It never uses ratings, reviews, placement or salary figures, does not change the AI order and does not predict admission."],
  ["Are these current university fee quotes?", "Results use listed catalog tuition. Confirm current fees, applicant category, additional charges and eligibility on the course and official university pages before applying."],
];

export default async function RecommenderPage() {
  const catalog = await getPublishedCatalog();
  const { courses } = catalog;
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQS.map(([question, answer]) => ({ "@type": "Question", name: question, acceptedAnswer: { "@type": "Answer", text: answer } })),
  };

  return <PublishedCatalogBoundary>{(
    <>
      <JsonLd data={faqJsonLd} />
      <RecommenderQuiz courses={courses} />
      <div className="uv-shell uvt-faq">
        <FaqAccordion items={FAQS} name="recommender-faq" title="Frequently asked questions" subtitle="Get quick answers about how Find my course works." id="sec-faq" />
      </div>
    </>
  )}</PublishedCatalogBoundary>;
}
