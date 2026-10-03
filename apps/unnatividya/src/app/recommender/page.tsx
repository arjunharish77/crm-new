export const dynamic = "force-dynamic";
import { PublishedCatalogBoundary } from "@/components/published-catalog-boundary";
import { getPublishedCatalog } from "@/lib/catalog-snapshot-server";
import type { Metadata } from "next";
import { JsonLd } from "@/components/json-ld";
import { RecommenderQuiz } from "@/components/recommender-quiz";

export const metadata: Metadata = {
  title: "Find Your Online Course",
  description: "Answer a few questions and shortlist online degree programs that fit your goal and budget.",
  alternates: { canonical: "/recommender" },
};

const FAQS: Array<[string, string]> = [
  ["How are courses matched?", "The tool filters listed programs by your chosen degree level, subject and maximum tuition budget. It shows up to three matches ordered by listed tuition, with a link to all matching courses. It does not rank course quality."],
  ["Does this tool use AI?", "The current tool uses fixed filters, not a live AI model. It does not generate advice or verify eligibility, class schedules or admission availability."],
  ["Do I need to sign up?", "No. Matching is free and does not require contact details. Apply now opens a separate enquiry form. Usage analytics follow the site's privacy policy."],
  ["What if there are no matches?", "Edit your degree level, subject or budget, or browse the full catalog. The tool does not silently recommend courses outside your selected filters."],
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
      <div style={{ maxWidth: 840, margin: "0 auto", padding: "0 24px 64px", width: "100%", boxSizing: "border-box" }}>
        <section className="detail-section">
          <h2>Frequently asked questions</h2>
          <div className="faq-list">
            {FAQS.map(([question, answer]) => (
              <details className="faq-item" name="recommender-faq" key={question}>
                <summary>{question}</summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </section>
      </div>
    </>
  )}</PublishedCatalogBoundary>;
}
