import type { Metadata } from "next";
import { RecommenderQuiz } from "@/components/recommender-quiz";
import { courses } from "@/data/catalog";

export const metadata: Metadata = {
  title: "AI Course Recommender",
  description: "Answer a few questions and shortlist online degree programs that fit your goal and budget.",
  alternates: { canonical: "/recommender" },
};

export default function RecommenderPage() {
  return <RecommenderQuiz courses={courses} />;
}
