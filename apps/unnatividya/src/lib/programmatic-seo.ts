import { courses, universities } from "@/data/catalog";
import { eligibilityGuides, careerScopeGuides, ugcApprovalGuides } from "@/data/guide-content";
import { allSpecializationPages } from "@/lib/specializations";

export type ProgrammaticSeoCandidate = {
  slug: string;
  title: string;
  intent: "COURSE" | "UNIVERSITY" | "FEE" | "ELIGIBILITY" | "CAREER" | "UGC" | "COMPARISON" | "SPECIALIZATION";
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
    const eligibilityLive = Boolean(eligibilityGuides[key]);
    const careerLive = Boolean(careerScopeGuides[key]);
    const ugcLive = Boolean(ugcApprovalGuides[key]);
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
        routeType: eligibilityLive ? ("LIVE" as const) : ("CANDIDATE" as const),
        indexable: eligibilityLive,
        reason: eligibilityLive
          ? "Live — real per-university eligibility differences researched and published (Phase 0/1 pilot)."
          : "Needs source-reviewed eligibility differences and admission notes before indexing.",
        sourceUrls: eligibilityLive ? [`/online-degree-guides/${key}-eligibility`] : relatedCourses,
      },
      {
        slug: `/online-degree-guides/${key}-career-scope`,
        title: `${label} career scope, roles, and outcomes`,
        intent: "CAREER" as const,
        entity: key,
        routeType: careerLive ? ("LIVE" as const) : ("CANDIDATE" as const),
        indexable: careerLive,
        reason: careerLive
          ? "Live — real roles/industries per university published, with unverified claims explicitly flagged (Phase 0/1 pilot)."
          : "Needs original career guidance, role data, and internal links before indexing.",
        sourceUrls: careerLive ? [`/online-degree-guides/${key}-career-scope`] : relatedCourses,
      },
      {
        slug: `/online-degree-guides/${key}-ugc-approval`,
        title: `Is ${label} UGC approved?`,
        intent: "UGC" as const,
        entity: key,
        routeType: ugcLive ? ("LIVE" as const) : ("CANDIDATE" as const),
        indexable: ugcLive,
        reason: ugcLive
          ? "Live — verified against the primary UGC-DEB entitlement list, not just university marketing claims (Phase 0/1 pilot)."
          : "Needs approval evidence and source-reviewed university list before indexing.",
        sourceUrls: ugcLive ? [`/online-degree-guides/${key}-ugc-approval`] : relatedCourses,
      },
    ];
  });

  const comparisonCandidates = uniqueCourseNames.flatMap((name) => {
    const key = courseKey(name);
    const matching = courses.filter((course) => course.name === name);
    const pairs: ProgrammaticSeoCandidate[] = [];
    matching.forEach((left, leftIndex) => {
      matching.slice(leftIndex + 1).forEach((right) => {
        const [a, b] = [left, right].sort((x, y) => x.universityId.localeCompare(y.universityId));
        const pairSlug = `${universitySlug(a.universityId)}-vs-${universitySlug(b.universityId)}`;
        pairs.push({
          slug: `/compare/${key}/${pairSlug}`,
          title: `${left.name}: ${universityShortName(left.universityId)} vs ${universityShortName(right.universityId)}`,
          intent: "COMPARISON",
          entity: `${left.id}:${right.id}`,
          routeType: "LIVE",
          indexable: true,
          reason: "Live comparison route built from verified catalog fee/placement/approval data.",
          sourceUrls: [`/compare/${key}/${pairSlug}`],
        });
      });
    });
    return pairs;
  });

  const specializationCandidates = allSpecializationPages().map((page) => ({
    slug: `/specializations/${page.slug}`,
    title: `${page.courseLabel} in ${page.specialization}`,
    intent: "SPECIALIZATION" as const,
    entity: page.slug,
    routeType: "LIVE" as const,
    indexable: true,
    reason: "Live specialization route built from verified catalog specialization/fee data.",
    sourceUrls: [`/specializations/${page.slug}`],
  }));

  return [...liveCoursePages, ...liveUniversityPages, ...guideCandidates, ...comparisonCandidates, ...specializationCandidates];
}

function universityShortName(id: string) {
  return universities.find((university) => university.id === id)?.shortName || id.toUpperCase();
}

function universitySlug(id: string) {
  return universities.find((university) => university.id === id)?.slug || id;
}
