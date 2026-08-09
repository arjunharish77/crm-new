import type { Metadata } from "next";
import { JsonLd } from "@/components/json-ld";
import { RecommenderQuiz } from "@/components/recommender-quiz";
import { courses } from "@/data/catalog";

export const metadata: Metadata = {
  title: "AI Course Recommender",
  description: "Answer a few questions and shortlist online degree programs that fit your goal and budget.",
  alternates: { canonical: "/recommender" },
};

const FAQS: Array<[string, string]> = [
  [
    "How does the recommender decide which programs to shortlist?",
    "It scores every program in our catalog against your 5 answers — degree level, stream of interest, budget, goal, and work status — adding points for a matching level or stream and for fitting your stated budget, then ranks the top 3 by that score, with rating and university placement rate as a small tie-breaker.",
  ],
  [
    "Is this an actual AI model, or a fixed set of rules?",
    "It's a rules-based matching engine tuned on your 5 answers, not a general AI model generating open-ended advice — we call it \"AI recommender\" because it personalizes results automatically, but the underlying logic is transparent scoring, not a black box.",
  ],
  [
    "Can I ask the recommender follow-up questions?",
    "Yes — after you see your shortlist, you can type questions like \"what's the cheapest option\" or \"which has better placements\", and it replies using the same catalog data behind your shortlist. For anything more nuanced, tap \"Enquire\" and a human counsellor will call you.",
  ],
  [
    "Does using the recommender cost anything or share my data with universities?",
    "No. The quiz runs entirely in your browser and doesn't share anything with universities — your answers are only submitted anywhere if you separately request a callback or enquire about a specific program.",
  ],
  [
    "What if none of the recommended programs feel right?",
    "Retake the quiz with different answers, ask the chat a follow-up question, or skip the recommender entirely and browse the full course catalog with filters at /courses.",
  ],
];

export default function RecommenderPage() {
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQS.map(([question, answer]) => ({ "@type": "Question", name: question, acceptedAnswer: { "@type": "Answer", text: answer } })),
  };

  return (
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
  );
}
