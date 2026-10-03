import type { CatalogReader } from "@/lib/catalog-snapshot";

import { courseLabel } from "@/lib/programmatic-seo";

export type LeadCourseOption = {
  label: string;
  stream: string;
  universities: Array<{ id: string; shortName: string; courseId: string }>;
};

const STREAM_ORDER = ["Management", "IT & Computers", "Commerce", "Arts & Humanities"];

// Groups the catalog's 30 courses into ~17 distinct course types (e.g. "Online MBA"), each
// carrying the specific university+course-id options that actually offer it -- used by the lead
// wizard's course selector so picking a type-only lead (no specific university narrowed down
// yet) is still possible, while picking both resolves to one exact catalog course id.
export function leadCourseOptions(catalog: CatalogReader): LeadCourseOption[] {
  const { courses, courseWithUniversity } = catalog;
  const byLabel = new Map<string, LeadCourseOption>();
  for (const course of courses) {
    const label = courseLabel(course.name);
    const enriched = courseWithUniversity(course);
    const entry = byLabel.get(label) || { label, stream: course.stream, universities: [] };
    entry.universities.push({ id: course.universityId, shortName: enriched.university.shortName, courseId: course.id });
    byLabel.set(label, entry);
  }
  return [...byLabel.values()].sort((a, b) => {
    const streamDiff = STREAM_ORDER.indexOf(a.stream) - STREAM_ORDER.indexOf(b.stream);
    return streamDiff !== 0 ? streamDiff : a.label.localeCompare(b.label);
  });
}
