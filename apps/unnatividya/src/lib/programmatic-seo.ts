import { courses, universities } from "@/data/catalog";

export type ProgrammaticSeoCandidate = {
  slug: string;
  title: string;
  intent: "COURSE" | "UNIVERSITY" | "FEE" | "ELIGIBILITY" | "CAREER" | "UGC" | "COMPARISON";
  entity: string;
  routeType: "LIVE" | "CANDIDATE";
  indexable: boolean;
  reason: string;
  sourceUrls: string[];
};

export function courseKey(courseName: string) {
  return courseName.toLowerCase().replace(/^online\s+/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function courseLabel(courseName: string) {
  return courseName.replace(/^Online\s+/i, "Online ");
}

export function generateProgrammaticSeoCandidates(): ProgrammaticSeoCandidate[] {
  const liveCoursePages = courses.map((course) => ({
    slug: `/courses/${course.slug}`,
    title: `${course.name} from ${universities.find((university) => university.id === course.universityId)?.name || "University"}`,
    intent: "COURSE" as const,
    entity: course.id,
    routeType: "LIVE" as const,
    indexable: true,
    reason: "Live source-backed course detail route.",
    sourceUrls: [`/courses/${course.slug}`],
  }));

  const liveUniversityPages = universities.map((university) => ({
    slug: `/universities/${university.slug}`,
    title: `${university.name} online degrees`,
    intent: "UNIVERSITY" as const,
    entity: university.id,
    routeType: "LIVE" as const,
    indexable: true,
    reason: "Live university detail route.",
    sourceUrls: [`/universities/${university.slug}`],
  }));

  const uniqueCourseNames = [...new Set(courses.map((course) => course.name))];
  const guideCandidates = uniqueCourseNames.flatMap((name) => {
    const key = courseKey(name);
    const label = courseLabel(name);
    const relatedCourses = courses.filter((course) => course.name === name).map((course) => `/courses/${course.slug}`);
    return [
      {
        slug: `/online-degree-guides/${key}-fees`,
        title: `${label} fees across UGC-approved universities`,
        intent: "FEE" as const,
        entity: key,
        routeType: "LIVE" as const,
        indexable: true,
        reason: "Live fee guide route built from verified catalog data.",
        sourceUrls: relatedCourses,
      },
      {
        slug: `/online-degree-guides/${key}-eligibility`,
        title: `${label} eligibility and admission process`,
        intent: "ELIGIBILITY" as const,
        entity: key,
        routeType: "CANDIDATE" as const,
        indexable: false,
        reason: "Needs source-reviewed eligibility differences and admission notes before indexing.",
        sourceUrls: relatedCourses,
      },
      {
        slug: `/online-degree-guides/${key}-career-scope`,
        title: `${label} career scope, roles, and outcomes`,
        intent: "CAREER" as const,
        entity: key,
        routeType: "CANDIDATE" as const,
        indexable: false,
        reason: "Needs original career guidance, role data, and internal links before indexing.",
        sourceUrls: relatedCourses,
      },
      {
        slug: `/online-degree-guides/ugc-approved-${key}`,
        title: `UGC-approved ${label} programs`,
        intent: "UGC" as const,
        entity: key,
        routeType: "CANDIDATE" as const,
        indexable: false,
        reason: "Needs approval evidence and source-reviewed university list before indexing.",
        sourceUrls: relatedCourses,
      },
    ];
  });

  const comparisonCandidates = uniqueCourseNames.flatMap((name) => {
    const matching = courses.filter((course) => course.name === name);
    const pairs: ProgrammaticSeoCandidate[] = [];
    matching.forEach((left, leftIndex) => {
      matching.slice(leftIndex + 1).forEach((right) => {
        pairs.push({
          slug: `/compare/${left.slug}-vs-${right.slug}`,
          title: `${left.name}: ${universityShortName(left.universityId)} vs ${universityShortName(right.universityId)}`,
          intent: "COMPARISON",
          entity: `${left.id}:${right.id}`,
          routeType: "CANDIDATE",
          indexable: false,
          reason: "Needs a public comparison route with meaningful fee, eligibility, approval, and outcome differences.",
          sourceUrls: [`/courses/${left.slug}`, `/courses/${right.slug}`],
        });
      });
    });
    return pairs;
  });

  return [...liveCoursePages, ...liveUniversityPages, ...guideCandidates, ...comparisonCandidates];
}

function universityShortName(id: string) {
  return universities.find((university) => university.id === id)?.shortName || id.toUpperCase();
}
