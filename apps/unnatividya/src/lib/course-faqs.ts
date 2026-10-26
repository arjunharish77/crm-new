import { formatFee } from "@/lib/catalog-format";
import { recognitionSummary } from "@/lib/program-facts";
import { type courseWithUniversity } from "@/data/catalog";

type EnrichedCourse = ReturnType<typeof courseWithUniversity>;

// Replaces the identical, catalog-wide boilerplate previously returned by
// commonCourseEnrichment().faqs in catalog.ts (same 4 questions on every one of the 30 course
// pages, none of them course-specific). Templated *questions*, but every answer is pulled from
// this course's own already-correct catalog fields, so the 30 pages stop being identical.
export function buildCourseFaqs(course: EnrichedCourse): Array<[string, string]> {
  const faqs: Array<[string, string]> = [
    [
      `Is the ${course.name} from ${course.university.name} UGC-entitled?`,
      // The published, dated UGC-DEB result; "being re-checked" until one is applied (plan T3, wave 2).
      recognitionSummary(course).answer,
    ],
    [
      `How much does the ${course.name} cost, and can I pay in EMI?`,
      `The total program fee is ${formatFee(course.fee)} for the full ${course.duration} program, with no-cost EMI available from ${course.emi} per month, subject to lender approval.`,
    ],
    [
      `What specializations does ${course.name} at ${course.university.shortName} offer?`,
      course.specializations.length
        ? `${course.university.shortName} offers ${course.specializations.length} specialization${course.specializations.length > 1 ? "s" : ""} within this program, including ${course.specializations.slice(0, 3).join(", ")}${course.specializations.length > 3 ? ", among others" : ""}.`
        : `${course.university.shortName} runs this as a general program without separate specialization tracks.`,
    ],
    [
      `What are the eligibility requirements for ${course.name}?`,
      `${course.eligibility} Confirm the exact requirement for your case with a counsellor before applying.`,
    ],
    [
      `What career roles can I pursue after ${course.name}?`,
      course.careerRoles.length
        ? `Graduates commonly move into roles such as ${course.careerRoles.slice(0, 4).join(", ")}, per ${course.university.shortName}'s own program pages — actual outcomes depend on your experience and specialization.`
        : `${course.university.shortName}'s program page outlines the career paths this degree supports — a counsellor can walk you through them.`,
    ],
    [
      `How long does ${course.name} take to complete?`,
      `The program runs for ${course.duration} at ${course.university.shortName}, and the exact schedule depends on your admission cycle. Confirm the exam format with the university.`,
    ],
  ];
  return faqs;
}
