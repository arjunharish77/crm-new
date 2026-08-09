import type { University } from "./catalog";

// Hand-researched guide content — unlike fee guides (derived algorithmically from
// catalog.ts fee/duration data), eligibility/career-scope/UGC-approval content is
// narrative and can't be computed from structured fields. Only course names with
// real, source-verified research go here (see 20_UNNATIVIDYA_CONTENT_SEO_MASTER_PLAN.md
// §6, §11 Phase 0/1). Do not add a course key without doing the equivalent research —
// that's the exact "scaled content abuse" trap the plan warns against.

export type SourcedFact = {
  universityId: University["id"];
  fact: string;
};

export type GuideFaq = [question: string, answer: string];

export type EligibilityGuide = {
  key: string;
  slug: string;
  label: string;
  facts: SourcedFact[];
  differentiatorNote: string;
  faqs: GuideFaq[];
  lastReviewed: string;
  sourceUrls: string[];
};

export type CareerScopeGuide = {
  key: string;
  slug: string;
  label: string;
  universityHighlights: Array<{ universityId: University["id"]; roles: string[]; industries?: string[] }>;
  unverifiedClaimsNote: string;
  faqs: GuideFaq[];
  lastReviewed: string;
  sourceUrls: string[];
};

export type UgcApprovalFact = {
  universityId: University["id"];
  ugcDebEntitled: boolean;
  naac?: string;
  aicte?: string;
  note?: string;
};

export type UgcApprovalGuide = {
  key: string;
  slug: string;
  label: string;
  approvals: UgcApprovalFact[];
  faqs: GuideFaq[];
  lastReviewed: string;
  sourceUrls: string[];
};

const LAST_REVIEWED = "August 2026";

export const eligibilityGuides: Record<string, EligibilityGuide> = {
  mba: {
    key: "mba",
    slug: "mba-eligibility",
    label: "Online MBA",
    facts: [
      { universityId: "muj", fact: "Bachelor's degree (10+2+3) in any discipline with a minimum of 50% marks (45% for reserved categories). No work experience or entrance test required." },
      { universityId: "smu", fact: "Bachelor's degree (10+2+3/4) in any discipline with a minimum of 50% marks (45% for reserved categories). Dual specialization: choose any 2 of 6 tracks. No work experience or entrance test required." },
      { universityId: "amity", fact: "Bachelor's degree in any discipline with a minimum of 40% marks — an internal eligibility test is available for candidates below 40%. No work experience or entrance test required." },
    ],
    differentiatorNote:
      "Amity's minimum-marks bar (40%, with a test-based waiver even below that) is genuinely lower than MUJ and SMU's 50%/45% — a real, citable difference. MUJ and SMU are otherwise essentially identical, since both run on the same Online Manipal platform and regulatory framework.",
    faqs: [
      ["What is the minimum percentage required for an online MBA?", "MUJ and SMU require a minimum of 50% marks in your bachelor's degree (45% for reserved categories). Amity's requirement is lower, at 40%, with an internal eligibility test available for candidates below that."],
      ["Do I need work experience for an online MBA?", "No. None of MUJ, SMU, or Amity require prior work experience for admission to their online MBA."],
      ["Is there an entrance exam for online MBA admission?", "No. Admission at all three universities is based on your bachelor's degree percentage, not a written entrance test like CAT or CMAT."],
      ["Can I apply for an online MBA if my bachelor's degree is in a different field, like engineering or arts?", "Yes. MUJ, SMU, and Amity all accept graduates from any discipline for their online MBA — there is no subject-specific eligibility requirement."],
      ["Does SMU's online MBA let me pick a specialization combination?", "Yes — SMU's own eligibility page describes a dual-specialization structure, letting you choose any 2 of 6 available tracks, unlike MUJ and Amity which don't structure their MBA around a fixed dual-track pick."],
      ["Are MUJ and SMU's MBA eligibility rules basically the same?", "Yes — both run on the same Online Manipal platform and regulatory framework, so their MBA eligibility criteria (50% marks, 45% for reserved categories, no work experience or entrance exam) are essentially identical. Amity's 40% minimum is the one genuine difference in this cluster."],
    ],
    lastReviewed: LAST_REVIEWED,
    sourceUrls: [
      "https://www.onlinemanipal.com/online-mba-courses/admission-fee-eligibility-details",
      "https://www.onlinemanipal.com/online-mba-degree-dual-specialization-smu",
      "https://amityonline.com/blog/amity-online-mba-admission-fees-eligibility-specializations",
    ],
  },
  bca: {
    key: "bca",
    slug: "bca-eligibility",
    label: "Online BCA",
    facts: [
      { universityId: "muj", fact: "10+2 (any recognised board) or a 10+3 diploma. MUJ's own eligibility page does not state a fixed minimum percentage or make Mathematics compulsory." },
      { universityId: "amity", fact: "10+2, any recognised board. Mathematics, Computer Science, and Informatics Practices are preferred but not mandatory — Amity explicitly states Science, Commerce, and Arts students can all apply." },
    ],
    differentiatorNote:
      "Neither university makes Mathematics compulsory for online BCA, contrary to the common assumption for a computing degree — it's explicitly optional at Amity, and simply not gated at all on MUJ's own eligibility page. Amity's own pages give inconsistent minimum-percentage figures for BCA; confirm the current cycle's exact cutoff with a counsellor rather than relying on a single source.",
    faqs: [
      ["Is Mathematics compulsory for online BCA?", "No, at neither MUJ nor Amity. Amity explicitly states Math/Computer Science/Informatics Practices are preferred, not mandatory, and welcomes Science, Commerce, and Arts students alike; MUJ's own eligibility page does not gate admission on Mathematics either."],
      ["Can arts or commerce students apply for online BCA?", "Yes — both universities accept students from any 10+2 stream."],
      ["What is the minimum percentage required for online BCA?", "Amity's own pages give inconsistent figures for a minimum percentage; MUJ does not publish a fixed minimum on its own eligibility page. Confirm the current cycle's exact cutoff with a counsellor before applying."],
      ["Are Amity's own eligibility pages consistent about the minimum percentage for BCA?", "No — our research found Amity's own pages give inconsistent minimum-percentage figures for online BCA. Confirm the current cycle's exact cutoff directly with a counsellor rather than relying on a single page."],
      ["Does MUJ publish a minimum percentage for online BCA?", "No — MUJ's own eligibility page for online BCA does not state a fixed minimum percentage."],
    ],
    lastReviewed: LAST_REVIEWED,
    sourceUrls: [
      "https://www.onlinemanipal.com/online-bca-degree-muj",
      "https://amityonline.com/blog/marks-important-for-online-bca",
    ],
  },
  mca: {
    key: "mca",
    slug: "mca-eligibility",
    label: "Online MCA",
    facts: [
      { universityId: "muj", fact: "Bachelor's degree, any discipline (50% marks, 45% reserved). A compulsory mathematics/computing bridge course applies in Semester 1 if Mathematics or computing fundamentals weren't studied at 10+2 or graduation." },
      { universityId: "smu", fact: "Same rule as MUJ — bachelor's degree, any discipline (50% marks, 45% reserved), with an identical compulsory bridge-course requirement for non-CS backgrounds." },
      { universityId: "amity", fact: "BCA, or a bachelor's degree in Science/Commerce/Arts with Mathematics at 10+2, or a B.Tech/BE in a CS-related field. A qualifying bridge course applies if Mathematics wasn't studied at 10+2 or graduation. Amity's own minimum-percentage figure is inconsistent across its own pages." },
    ],
    differentiatorNote:
      "MUJ and SMU run essentially identical MCA eligibility rules (both operate on the Online Manipal platform). Amity's structure differs by explicitly naming BCA-holders and engineering graduates as a direct fit, but Amity's own published minimum-percentage figure varies across its own pages — a real inconsistency worth flagging rather than smoothing over.",
    faqs: [
      ["Can I do an online MCA without a computer science background?", "Yes, at all three universities — but if you haven't studied Mathematics or computing fundamentals at 10+2 or graduation, a compulsory bridge course applies in your first semester."],
      ["Is Mathematics mandatory for online MCA?", "It depends on your background: if you haven't studied Math at 10+2 or graduation level, MUJ, SMU, and Amity all require a qualifying/bridge course rather than rejecting your application outright."],
      ["What's the difference between MUJ, SMU, and Amity's MCA eligibility?", "MUJ and SMU apply essentially the same rules. Amity explicitly welcomes BCA and engineering graduates as a direct fit, though its own published minimum-percentage figure varies across its own pages — confirm the current figure with a counsellor before applying."],
      ["Who is a 'direct fit' for online MCA without needing a bridge course?", "Amity's own page explicitly names BCA graduates and B.Tech/BE graduates in CS-related fields as a direct fit, since they'll already have studied the required Mathematics/computing fundamentals. MUJ and SMU don't name specific direct-fit degrees but apply the same underlying logic — no bridge course needed if you've already studied Math/computing at 10+2 or graduation."],
      ["Does Amity publish a consistent minimum percentage for online MCA?", "No — our research found Amity's own published minimum-percentage figure for MCA varies across its own pages, a genuine inconsistency worth confirming directly with a counsellor."],
    ],
    lastReviewed: LAST_REVIEWED,
    sourceUrls: [
      "https://www.onlinemanipal.com/online-mca-degree-muj",
      "https://www.onlinemanipal.com/online-mca-degree-smu",
      "https://amityonline.com/blog/mca-online-admission-eligibility-criteria",
    ],
  },
  ba: {
    key: "ba",
    slug: "ba-eligibility",
    label: "Online BA",
    facts: [
      { universityId: "smu", fact: "10+2 from a recognised board, or a 10+3 diploma. SMU's own eligibility pages do not state a minimum percentage for the BA — a 50% figure sometimes quoted on third-party sites could not be confirmed on SMU's own pages." },
      { universityId: "amity", fact: "10+2 pass; the degree is structured around four subject tracks (Economics, Sociology, English, Political Science). No minimum percentage stated. Non-English-medium applicants need at least 3 years of English-medium schooling." },
    ],
    differentiatorNote:
      "Neither university publishes a minimum percentage for the BA on its own eligibility page, despite some third-party sites claiming a 50% cutoff for SMU — that figure couldn't be verified and shouldn't be treated as fact. The real structural difference: Amity's BA is built around four named subject tracks from day one, while SMU frames its BA as a choice of subject 'combinations' (English, Political Science, Sociology) within one general degree.",
    faqs: [
      ["What is the minimum percentage required for an online BA?", "Neither Sikkim Manipal University nor Amity states a minimum percentage on its own eligibility page. Some third-party sites mention a 50% cutoff for SMU, but this couldn't be confirmed on SMU's own pages — confirm with a counsellor before assuming a cutoff applies."],
      ["Do I need to have studied a specific subject at 12th to apply for an online BA?", "No — both universities accept any 10+2 stream. Amity's degree is structured around four subject tracks (Economics, Sociology, English, Political Science), but that affects what you study, not your eligibility to apply."],
      ["Is there an English-medium requirement for online BA?", "Amity requires non-English-medium applicants to have completed at least 3 years of English-medium schooling. SMU's pages don't mention this requirement."],
      ["What's the real structural difference between SMU and Amity's online BA?", "Amity's BA is built around four explicitly named subject tracks (Economics, Sociology, English, Political Science) from day one, while SMU frames its BA as a choice of subject 'combinations' (English, Political Science, Sociology) within one general degree — a genuine difference in how the two structure the same broad degree."],
      ["Should I trust a 50% minimum-percentage figure I saw for SMU's online BA elsewhere?", "Be cautious — that figure appears on some third-party sites but couldn't be confirmed on SMU's own eligibility page during our research. Confirm directly with a counsellor before assuming it applies."],
    ],
    lastReviewed: LAST_REVIEWED,
    sourceUrls: ["https://www.onlinemanipal.com/online-ba-degree-smu", "https://amityonline.com/bachelor-of-arts-online"],
  },
  "ma-jmc": {
    key: "ma-jmc",
    slug: "ma-jmc-eligibility",
    label: "Online MA JMC",
    facts: [
      { universityId: "muj", fact: "10+2+3-year bachelor's degree in any discipline (or an AIU-recognised equivalent). No minimum percentage is stated on MUJ's own eligibility pages for this program." },
      { universityId: "amity", fact: "Graduation in any discipline with a minimum of 40% marks — candidates below 40% can take an admission test instead. Non-English-medium applicants need at least 3 years of English-medium schooling." },
    ],
    differentiatorNote:
      "A genuine, clear difference: Amity states an explicit 40% minimum (with an admission-test fallback below that), while MUJ states no percentage floor at all for MA JMC on its own eligibility pages.",
    faqs: [
      ["What is the minimum percentage required for online MA JMC?", "Amity requires a minimum of 40% marks, with an admission test available for candidates below that. MUJ does not publish a minimum percentage for this program on its own eligibility pages."],
      ["Do I need a journalism or mass communication background to apply?", "No — both MUJ and Amity accept graduates from any discipline for the MA JMC."],
      ["Is there an entrance exam for online MA JMC?", "Not normally — admission is based on your graduation percentage. Amity's admission test only applies if your marks are below its 40% minimum."],
      ["What happens if my graduation marks are below Amity's 40% minimum for MA JMC?", "Amity's own page states candidates below 40% can take an admission test instead of being automatically disqualified."],
      ["Is there an English-medium schooling requirement for online MA JMC?", "At Amity, yes — non-English-medium applicants need at least 3 years of English-medium schooling. MUJ's own eligibility pages don't mention this requirement."],
    ],
    lastReviewed: LAST_REVIEWED,
    sourceUrls: [
      "https://www.onlinemanipal.com/master-of-arts-in-journalism-mass-communication",
      "https://amityonline.com/master-of-arts-journalism-and-mass-communication-online",
    ],
  },
  bba: {
    key: "bba",
    slug: "bba-eligibility",
    label: "Online BBA",
    facts: [
      { universityId: "muj", fact: "10+2 from a recognised board, or a 10+3 diploma. No minimum percentage is stated on MUJ's own dedicated BBA eligibility page." },
      { universityId: "smu", fact: "Same 10+2/10+3 wording as MUJ. No minimum percentage stated on SMU's own dedicated BBA page either." },
      { universityId: "amity", fact: "10+2 pass, any stream, for candidates pursuing a career in business management. No minimum percentage stated on Amity's own BBA program page." },
    ],
    differentiatorNote:
      "None of the three universities states a minimum percentage on its own dedicated BBA program page. A separate, generic comparison page on onlinemanipal.com itself claims a '50% aggregate' requirement but attributes it inconsistently — one fetch attributed it to MAHE, another to SMU — so treat that figure as unresolved, not a confirmed fact. No Mathematics or Commerce subject requirement exists at any of the three universities for BBA.",
    faqs: [
      ["What is the minimum percentage required for online BBA?", "None of MUJ, SMU, or Amity states a minimum percentage on its own dedicated BBA program page. A generic comparison page on the same site (onlinemanipal.com) mentions a 50% figure but attributes it inconsistently between two different universities — treat this as unconfirmed and check with a counsellor."],
      ["Do I need a Commerce or Maths background for online BBA?", "No — all three universities accept any 10+2 stream, with no subject-specific prerequisite."],
      ["Is the 50% aggregate figure sometimes quoted for online BBA reliable?", "No — our research found this figure on a generic comparison page on onlinemanipal.com itself, but it was attributed inconsistently, once to MAHE and once to SMU, in different page fetches. Treat it as unresolved, not a confirmed requirement, and confirm directly with a counsellor."],
      ["Which university has the strictest eligibility criteria for online BBA?", "None, based on our research — MUJ, SMU, and Amity all state only a 10+2 pass (any stream) with no minimum percentage or subject requirement on their own dedicated BBA program pages."],
    ],
    lastReviewed: LAST_REVIEWED,
    sourceUrls: [
      "https://www.onlinemanipal.com/online-bba-courses/admission-fee-eligibility-details",
      "https://www.onlinemanipal.com/online-bba-degree-smu",
      "https://amityonline.com/bachelor-of-business-administration-online",
    ],
  },
  "b-com": {
    key: "b-com",
    slug: "b-com-eligibility",
    label: "Online B.Com",
    facts: [
      { universityId: "muj", fact: "10+2 from a recognised board, or a 10+3 diploma, any stream. No minimum percentage or Commerce/Mathematics subject requirement stated on MUJ's own dedicated page." },
      { universityId: "smu", fact: "Same wording as MUJ — any 10+2 stream, no minimum percentage or subject requirement stated on SMU's own dedicated page." },
      { universityId: "amity", fact: "10th + 12th pass, English proficiency required. No minimum percentage stated on Amity's plain B.Com page — this is distinct from Amity's separate B.Com Honours program, which explicitly requires 55% at 10+2." },
    ],
    differentiatorNote:
      "None of the three universities states a minimum percentage or a Commerce/Mathematics subject requirement for the standard B.Com — any 10+2 stream qualifies everywhere. The one real percentage requirement in this cluster belongs to a different, related program: Amity's separate 'B.Com Honours' explicitly requires 55% at 10+2, a genuinely higher and more specific bar than its own plain B.Com.",
    faqs: [
      ["Do I need Commerce or Maths at 12th for online B.Com?", "No — MUJ, SMU, and Amity all accept any 10+2 stream for the standard B.Com, with no subject-specific prerequisite."],
      ["What is the minimum percentage required for online B.Com?", "None of the three universities states a minimum percentage for the standard B.Com on its own program page. Amity's separate B.Com Honours program does require 55% at 10+2 — don't confuse the two when checking eligibility."],
      ["Is the eligibility for online B.Com the same at all three universities?", "Essentially yes for the standard B.Com — MUJ, SMU, and Amity all accept any 10+2 stream with no minimum percentage or subject-specific requirement. The one exception is Amity's separately-branded 'B.Com Honours' program, which does require 55% at 10+2."],
      ["Does Amity require English proficiency for online B.Com?", "Yes — Amity's plain B.Com page states English proficiency is required, in addition to a 10th and 12th pass. MUJ and SMU's pages don't state this as a separate requirement."],
    ],
    lastReviewed: LAST_REVIEWED,
    sourceUrls: [
      "https://www.onlinemanipal.com/online-bcom-degree-muj",
      "https://www.onlinemanipal.com/online-bcom-degree-smu",
      "https://amityonline.com/bachelor-of-commerce-online",
    ],
  },
  "m-com": {
    key: "m-com",
    slug: "m-com-eligibility",
    label: "Online M.Com",
    facts: [
      { universityId: "muj", fact: "Bachelor's degree (10+2+3 years) in any discipline — not restricted to Commerce. No minimum percentage stated. A search-summary claim of '50% at class 12' was checked directly against MUJ's own page and found to be incorrect — M.Com eligibility is bachelor's-degree-based, not 12th-based." },
      { universityId: "smu", fact: "Same wording as MUJ — bachelor's degree, any discipline, no minimum percentage stated." },
      { universityId: "amity", fact: "Graduation in any discipline (diploma not accepted). Amity's Fintech specialization page names Commerce/Finance/Economics/Management backgrounds as a natural fit but explicitly also welcomes fresh graduates from any discipline — a preference, not a requirement." },
    ],
    differentiatorNote:
      "The genuinely useful, real finding here: none of the three universities requires a Commerce or related bachelor's degree specifically for the M.Com — all three explicitly or effectively accept graduates from any discipline. This directly contradicts the common assumption that a postgraduate commerce degree needs an undergraduate commerce background.",
    faqs: [
      ["Do I need a B.Com to apply for online M.Com?", "No — MUJ, SMU, and Amity all accept a bachelor's degree in any discipline for their M.Com programs. A Commerce background is not required, though Amity's Fintech specialization page names it as a natural (not mandatory) fit."],
      ["What is the minimum percentage required for online M.Com?", "None of the three universities states a minimum percentage on its own program page."],
      ["I saw a claim that online M.Com requires 50% at class 12 — is that true?", "No — we checked this specifically against MUJ's own eligibility page and found it incorrect. M.Com eligibility is based on your bachelor's degree, not your 12th-grade marks."],
      ["Does Amity's M.Com Fintech specialization require a finance background?", "No — Amity's own Fintech specialization page names Commerce, Finance, Economics, and Management backgrounds as a natural fit, but explicitly welcomes fresh graduates from any discipline too. It's a preference, not a requirement."],
    ],
    lastReviewed: LAST_REVIEWED,
    sourceUrls: [
      "https://www.onlinemanipal.com/online-mcom-degree-muj",
      "https://www.onlinemanipal.com/online-mcom-degree-smu",
      "https://amityonline.com/master-of-commerce-financial-management-online",
      "https://amityonline.com/mcom-fintech-online",
    ],
  },
  "ma-english": {
    key: "ma-english",
    slug: "ma-english-eligibility",
    label: "Online MA English",
    facts: [
      { universityId: "smu", fact: "Bachelor's degree (10+2+3 years) in any discipline — English literature/language background is not required. No minimum percentage stated. Work experience explicitly not required." },
    ],
    differentiatorNote:
      "The real, useful fact here isn't a percentage (none is stated) — it's that SMU does not require a prior English or Humanities background for this program; any bachelor's degree, in any discipline, qualifies.",
    faqs: [
      ["Do I need to have studied English at graduation to apply for online MA English?", "No — SMU's own eligibility page accepts a bachelor's degree in any discipline, not just English or Humanities graduates."],
      ["What is the minimum percentage required for online MA English?", "SMU does not state a minimum percentage on its own eligibility page."],
      ["Is work experience required for online MA English?", "No — SMU's own eligibility page explicitly states work experience is not required for this program."],
      ["Which university offers online MA English on this site?", "Only Sikkim Manipal University (SMU) currently — MUJ and Amity don't offer this specific program among the courses compared here."],
    ],
    lastReviewed: LAST_REVIEWED,
    sourceUrls: ["https://www.onlinemanipal.com/online-ma-english-degree"],
  },
  "ma-political-science": {
    key: "ma-political-science",
    slug: "ma-political-science-eligibility",
    label: "Online MA Political Science",
    facts: [
      { universityId: "smu", fact: "Bachelor's degree (10+2+3 years) in any discipline — a Political Science or Social Science background is not required. No minimum percentage stated (a '50%' figure found in one AI-generated search summary could not be confirmed on SMU's own page and shouldn't be treated as fact). Work experience not required." },
    ],
    differentiatorNote:
      "Unlike some university programs, SMU's online MA Political Science does not require a prior Political Science or Social Science degree — any bachelor's degree qualifies. This is a genuine, source-checked fact, not a generic placeholder.",
    faqs: [
      ["Do I need a Political Science background to apply for online MA Political Science?", "No — SMU accepts a bachelor's degree in any discipline for this program."],
      ["What is the minimum percentage required?", "SMU's own eligibility page does not state a minimum percentage. A 50% figure sometimes cited elsewhere could not be confirmed against SMU's own page."],
      ["Is work experience required for online MA Political Science?", "SMU's own eligibility page doesn't require prior work experience for this program."],
      ["Which university offers online MA Political Science on this site?", "Only Sikkim Manipal University (SMU) currently offers this specific program among the universities compared here."],
    ],
    lastReviewed: LAST_REVIEWED,
    sourceUrls: ["https://www.onlinemanipal.com/online-ma-political-science-degree"],
  },
  "ma-sociology": {
    key: "ma-sociology",
    slug: "ma-sociology-eligibility",
    label: "Online MA Sociology",
    facts: [
      { universityId: "smu", fact: "Bachelor's degree (10+2+3 years) in any discipline — a Sociology background is not required. No minimum percentage stated. SMU's page explicitly notes work experience 'is not mandatory,' though it says it's 'always good to have.'" },
    ],
    differentiatorNote:
      "As with SMU's other single-subject MA programs, the real, checkable fact is what's NOT required: no Sociology background, no minimum percentage, and no mandatory work experience — SMU's own page makes each of these points explicitly rather than leaving them ambiguous.",
    faqs: [
      ["Do I need a Sociology background to apply for online MA Sociology?", "No — SMU accepts a bachelor's degree in any discipline."],
      ["Is work experience required for online MA Sociology?", "No — SMU's own page explicitly states work experience is not mandatory, though it notes it's useful to have."],
      ["Does SMU recommend work experience for online MA Sociology even though it's not required?", "Yes — SMU's own page explicitly says work experience 'is not mandatory' but notes it's 'always good to have,' so it can help your profile without being a hard requirement."],
      ["Which university offers online MA Sociology on this site?", "Only Sikkim Manipal University (SMU) currently offers this specific program among the universities compared here."],
    ],
    lastReviewed: LAST_REVIEWED,
    sourceUrls: ["https://www.onlinemanipal.com/online-ma-sociology-degree"],
  },
  "ma-economics": {
    key: "ma-economics",
    slug: "ma-economics-eligibility",
    label: "Online MA Economics",
    facts: [
      { universityId: "muj", fact: "Bachelor's degree (10+2+3 years) in any discipline — a prior Economics or Commerce background is not required. No minimum percentage stated. International applicants need an AIU equivalence certificate." },
    ],
    differentiatorNote:
      "MUJ's own eligibility page does not require a prior Economics or Commerce degree for this program — any bachelor's discipline qualifies, and no minimum percentage is stated.",
    faqs: [
      ["Do I need an Economics background to apply for online MA Economics?", "No — MUJ accepts a bachelor's degree in any discipline for this program."],
      ["What is the minimum percentage required?", "MUJ's own eligibility page does not state a minimum percentage."],
      ["Do international applicants have any extra requirement for online MA Economics?", "Yes — MUJ's own eligibility page states international applicants need an AIU equivalence certificate in addition to the standard bachelor's degree requirement."],
      ["Which university offers online MA Economics on this site?", "Only Manipal University Jaipur (MUJ) currently offers this specific program among the universities compared here."],
    ],
    lastReviewed: LAST_REVIEWED,
    sourceUrls: ["https://www.onlinemanipal.com/online-ma-economics-degree"],
  },
  "b-com-honours": {
    key: "b-com-honours",
    slug: "b-com-honours-eligibility",
    label: "Online B.Com Honours",
    facts: [
      { universityId: "amity", fact: "10+2 pass with a minimum of 55% marks — a genuinely higher, more specific bar than Amity's own standard B.Com, which states no minimum percentage at all." },
    ],
    differentiatorNote:
      "Amity's B.Com Honours and its standard B.Com are two distinct programs with two distinct eligibility bars — Honours requires 55% at 10+2, while the standard B.Com states no minimum percentage. Don't confuse the two when checking eligibility.",
    faqs: [
      ["What is the minimum percentage for online B.Com Honours at Amity?", "55% at 10+2 — this is explicitly higher than Amity's own standard B.Com, which states no minimum percentage."],
      ["Why is B.Com Honours' eligibility bar higher than Amity's standard B.Com?", "Amity positions B.Com Honours as a more rigorous, ACCA-track-aligned program, which is likely why it sets an explicit 55% minimum at 10+2 while the standard B.Com states no minimum at all — though Amity's own pages don't explain the reasoning directly."],
      ["Is there a subject requirement for online B.Com Honours?", "Amity's own eligibility page states no specific subject requirement beyond the 55% minimum at 10+2 — any stream qualifies."],
    ],
    lastReviewed: LAST_REVIEWED,
    sourceUrls: ["https://amityonline.com/bachelor-of-commerce-honours"],
  },
  "ba-jmc": {
    key: "ba-jmc",
    slug: "ba-jmc-eligibility",
    label: "Online BA JMC",
    facts: [
      { universityId: "amity", fact: "10+2 pass. A specific, unusual requirement not seen on this site's other UG programs: a minimum of 3 years of education in English medium. No minimum percentage stated." },
    ],
    differentiatorNote:
      "The one real, specific fact here isn't a percentage (none is stated) — it's the 3-years-English-medium-schooling requirement, which is more specific than the generic English-proficiency language used on most other program pages.",
    faqs: [
      ["What is the minimum percentage for online BA JMC at Amity?", "Amity's own page states no minimum percentage — only a 10+2 pass."],
      ["Is there a language requirement for online BA JMC?", "Yes — Amity requires a minimum of 3 years of education in English medium, a more specific requirement than the generic English-proficiency language used on some of its other program pages."],
      ["Why does online BA JMC have an English-medium schooling requirement?", "Given the program's focus on journalism and mass communication, strong English proficiency is likely why Amity sets this requirement — though Amity's own page states the requirement without explaining the reasoning."],
      ["Which university offers online BA JMC on this site?", "Only Amity University Online currently offers this specific program among the universities compared here."],
    ],
    lastReviewed: LAST_REVIEWED,
    sourceUrls: ["https://amityonline.com/bachelor-of-arts-journalism-and-mass-communication-online"],
  },
  "msc-data-science": {
    key: "msc-data-science",
    slug: "msc-data-science-eligibility",
    label: "Online MSc Data Science",
    facts: [
      { universityId: "amity", fact: "Bachelor's degree in any Science discipline — not restricted to computer science, mathematics, or statistics specifically. No minimum percentage stated." },
    ],
    differentiatorNote:
      "A genuinely useful, verified fact: Amity's MSc Data Science does not require a computer-science, math, or statistics background specifically — any Science bachelor's degree qualifies. Contrast this with MUJ's MSc Mathematics, which explicitly requires Mathematics as a compulsory subject at graduation level.",
    faqs: [
      ["Do I need a computer science or statistics background for online MSc Data Science?", "No — Amity's own eligibility page only requires a bachelor's degree in any Science discipline, not a CS/math/stats-specific one."],
      ["Do I need prior programming experience for online MSc Data Science?", "Amity's own eligibility page doesn't state a programming-experience requirement — only a bachelor's degree in any Science discipline. That said, the curriculum itself involves programming, so some familiarity helps even if it isn't formally required."],
      ["Is there a minimum percentage for online MSc Data Science?", "Amity's own eligibility page doesn't state a minimum percentage — only a bachelor's degree in any Science discipline."],
    ],
    lastReviewed: LAST_REVIEWED,
    sourceUrls: ["https://amityonline.com/msc-in-data-science"],
  },
  "ma-public-policy-governance": {
    key: "ma-public-policy-governance",
    slug: "ma-public-policy-governance-eligibility",
    label: "Online MA Public Policy & Governance",
    facts: [
      { universityId: "amity", fact: "Graduation in any discipline (diploma not accepted). English proficiency required, though not quantified by a specific test score on Amity's own page. No minimum percentage stated." },
    ],
    differentiatorNote:
      "No subject-specific background is required — any bachelor's degree qualifies, and no minimum percentage is stated.",
    faqs: [
      ["Do I need a political science or public administration background to apply?", "No — Amity's own eligibility page accepts graduation in any discipline."],
      ["Is a diploma accepted for online MA Public Policy & Governance?", "No — Amity's own eligibility page specifically states a diploma is not accepted; a full bachelor's degree is required."],
      ["Is there an English-language test score required?", "Amity's own page requires English proficiency but doesn't quantify it with a specific test score — confirm the exact requirement with a counsellor."],
    ],
    lastReviewed: LAST_REVIEWED,
    sourceUrls: ["https://amityonline.com/ma-public-policy"],
  },
  "msc-mathematics": {
    key: "msc-mathematics",
    slug: "msc-mathematics-eligibility",
    label: "Online MSc Mathematics",
    facts: [
      { universityId: "muj", fact: "A BSc degree, or a 10+2+3/4-year bachelor's degree with Mathematics as a compulsory subject. No minimum percentage for base admission, though a 10% fee discount applies for 80%+ marks in the bachelor's degree." },
    ],
    differentiatorNote:
      "Unlike Amity's MSc Data Science (any Science discipline), MUJ explicitly requires Mathematics as a compulsory subject at graduation level — a real, specific, and verified prerequisite, not a generic placeholder.",
    faqs: [
      ["Do I need to have studied Mathematics at graduation to apply for online MSc Mathematics?", "Yes — MUJ's own eligibility page explicitly requires Mathematics as a compulsory subject in your bachelor's degree (or a BSc degree), unlike some other master's programs on this site that accept any discipline."],
      ["Is there a merit scholarship for online MSc Mathematics?", "Yes — MUJ's own fee page states a 10% discount for candidates with 80% or above in their bachelor's degree."],
      ["What if my bachelor's degree didn't include Mathematics as a subject?", "MUJ's own eligibility page requires Mathematics as a compulsory subject in your bachelor's degree (or a BSc degree) for this program — without it, you would not meet the stated eligibility criteria."],
      ["How is MUJ's MSc Mathematics eligibility different from Amity's MSc Data Science?", "MUJ requires Mathematics as a compulsory subject in your bachelor's degree, while Amity's MSc Data Science accepts any Science discipline without a Math-specific requirement — a genuine difference if you're choosing between the two."],
    ],
    lastReviewed: LAST_REVIEWED,
    sourceUrls: ["https://www.onlinemanipal.com/online-msc-mathematics-muj"],
  },
};

export const careerScopeGuides: Record<string, CareerScopeGuide> = {
  mba: {
    key: "mba",
    slug: "mba-career-scope",
    label: "Online MBA",
    universityHighlights: [
      { universityId: "muj", roles: ["Digital Marketing", "Brand Management", "Wealth Management", "Supply Chain & Operations", "HR/Talent Management", "Sales/BD", "Entrepreneurship"], industries: ["Healthcare", "IT/ITeS", "BFSI", "FMCG", "EdTech/FinTech", "Consulting", "Retail/E-commerce", "Media", "Manufacturing", "Real Estate"] },
      { universityId: "smu", roles: ["Marketing Management", "Supply Chain", "Wealth Management", "Talent Management", "Database Administration", "Logistics", "Market Research", "IT Consultancy", "Performance Marketing", "Portfolio Management"] },
      { universityId: "amity", roles: ["Business Analyst", "Marketing Associate", "Financial Analyst", "HR Executive"] },
    ],
    unverifiedClaimsNote:
      "None of the three universities publish an official, program-specific placement percentage or salary figure for their online MBA. A third-party aggregator (CollegeDunia) reports MUJ's online-MBA placement at roughly 93% (2024-25) with a package range of ₹4.2-6 LPA — this figure is not confirmed by MUJ itself and appears to mix program-specific and whole-university numbers, so treat it as indicative only, not a guarantee. Ask your counsellor for realistic, role-specific expectations rather than relying on unverified averages.",
    faqs: [
      ["What is the average salary after an online MBA?", "None of MUJ, SMU, or Amity publish an official program-specific salary figure for their online MBA. Salary depends heavily on your prior experience, specialization, and employer — ask a counsellor for realistic expectations rather than an unverified aggregator average."],
      ["What roles can I get after an online MBA?", "Roles vary by university and specialization. MUJ's own program page highlights digital marketing, brand management, wealth management, supply chain, HR, and entrepreneurship roles. SMU's page highlights marketing, supply chain, database administration, and portfolio management roles, with named hiring partners including EY, Goldman Sachs, and LTIMindtree. Amity's page names Business Analyst, Marketing Associate, Financial Analyst, and HR Executive as entry points."],
      ["Which industries hire online MBA graduates?", "Per MUJ's own program page: healthcare, IT/ITeS, BFSI, FMCG, EdTech/FinTech, consulting, retail/e-commerce, media, manufacturing, and real estate."],
      ["Which university names specific hiring partners for online MBA?", "SMU's own program page names hiring partners including EY, Goldman Sachs, and LTIMindtree for its online MBA — MUJ and Amity's pages don't name a comparably specific list for this exact program."],
      ["Is the 93% placement figure sometimes cited for MUJ's MBA verified?", "No — that figure comes from a third-party aggregator (CollegeDunia), not MUJ itself, and appears to mix program-specific and whole-university numbers. Treat it as indicative only, not a guarantee."],
    ],
    lastReviewed: LAST_REVIEWED,
    sourceUrls: [
      "https://www.onlinemanipal.com/online-mba-manipal-university-jaipur",
      "https://www.onlinemanipal.com/online-mba-degree-dual-specialization-smu",
      "https://amityonline.com/blog/amity-online-mba-admission-fees-eligibility-specializations",
    ],
  },
  bca: {
    key: "bca",
    slug: "bca-career-scope",
    label: "Online BCA",
    universityHighlights: [
      { universityId: "muj", roles: ["Web Developer", "Software Developer", "System Administrator", "Mobile App Developer", "Network Administrator", "QA Analyst", "Technical Support", "Systems Analyst"], industries: ["E-commerce", "IT", "Telecom", "Pharma", "Education", "HR", "Tourism", "Database Management"] },
      { universityId: "amity", roles: ["Data Analyst", "Cybersecurity Analyst", "Cloud Support"] },
    ],
    unverifiedClaimsNote:
      "MUJ's own program page names hiring partners (EY, Goldman Sachs, LTIMindtree, Accenture) but gives no program-specific placement percentage or salary figure. A separate Amity marketing-blog page (not the core eligibility page) claims entry-level ₹3-6 LPA, Data Analyst ₹4-8 LPA, Cybersecurity Analyst ₹4.5-9 LPA, Cloud Support ₹4-7 LPA, and ~₹8 LPA+ after 3-5 years with certifications (AWS/Azure/CEH) — this is Amity's own unverified marketing claim, not independently corroborated, though it is the only source found giving an actual experience-based progression curve rather than a static role list.",
    faqs: [
      ["What jobs can I get after an online BCA?", "MUJ's own program page names web/software development, system administration, mobile app development, network administration, QA, and technical support roles, with hiring partners including EY, Goldman Sachs, LTIMindtree, and Accenture. Neither MUJ nor Amity publish a program-specific placement percentage."],
      ["What salary can I expect after an online BCA?", "Neither university publishes an official program-specific salary figure. An Amity marketing blog (not independently verified) cites ₹3-6 LPA entry-level, rising to ₹8 LPA+ after 3-5 years with cloud/security certifications — treat this as indicative only."],
      ["Which industries hire online BCA graduates?", "Per MUJ's own program page: e-commerce, IT, telecom, pharma, education, HR, tourism, and database management."],
      ["Does experience or certifications change salary expectations after online BCA?", "Amity's own (unverified) marketing blog suggests progression from ₹3-6 LPA at entry to ₹8 LPA+ after 3-5 years with cloud/security certifications like AWS, Azure, or CEH — treat this as an indicative curve, not a guarantee, since it's not independently corroborated."],
      ["Are there named hiring partners for online BCA?", "MUJ's own program page names EY, Goldman Sachs, LTIMindtree, and Accenture as hiring partners. Amity's page doesn't name a comparable list for BCA specifically."],
    ],
    lastReviewed: LAST_REVIEWED,
    sourceUrls: [
      "https://www.onlinemanipal.com/online-bca-degree-muj",
      "https://amityonline.com/blog/a-complete-guide-to-bca-degree-programme",
    ],
  },
  mca: {
    key: "mca",
    slug: "mca-career-scope",
    label: "Online MCA",
    universityHighlights: [
      { universityId: "muj", roles: ["Full Stack Developer", "Software Engineer", "Data Analyst", "Cloud Architect", "Database Engineer", "Cybersecurity Analyst", "IT Architect", "AI Engineer"], industries: ["Cybersecurity", "Cloud", "E-commerce", "Gaming", "IT", "Manufacturing", "Telecom", "IT Consulting"] },
      { universityId: "smu", roles: ["DevOps Engineer", "QA Engineer", "Software Architect", "Web Developer", "Network Engineer", "IT Architect", "UI/UX Designer", "IT Project Manager", "Database Administrator"], industries: ["Cybersecurity", "Cloud", "E-commerce", "Gaming", "Academia", "IT", "Manufacturing/Retail", "R&D", "Telecom"] },
    ],
    unverifiedClaimsNote:
      "Neither MUJ nor SMU publish a program-specific placement percentage or salary figure on their official pages, though both name 30+ hiring partners. Amity's page only states the industry-wide claim that \"the average salary of an MCA graduate in India is ₹10,00,000/year\" — this reads as a general industry statistic, not Amity's own program outcome, and should not be attributed to Amity graduates specifically. Third-party aggregators cite ~70-90% placement and ₹3.5-4 LPA average package for Amity's MCA, unverified against Amity's own data and possibly mixing campus-wide and online-program figures.",
    faqs: [
      ["What jobs can I get after an online MCA?", "MUJ's own page highlights full-stack development, cloud architecture, cybersecurity, and AI-related roles; SMU's page highlights DevOps, QA, software architecture, and IT project management roles, with 30+ named hiring partners at each university. Neither publishes a program-specific placement percentage."],
      ["What is the average salary after an online MCA?", "Amity's page cites a general industry-wide average of ₹10 LPA for MCA graduates in India — this is not Amity-specific. MUJ and SMU don't publish a salary figure at all. Ask a counsellor for realistic, role-specific expectations."],
      ["Which industries hire online MCA graduates?", "Per MUJ and SMU's own pages: cybersecurity, cloud computing, e-commerce, gaming, IT, manufacturing, telecom, and (for SMU specifically) academia and R&D."],
      ["Is Amity's ₹10 LPA average salary figure specific to its MCA graduates?", "No — Amity's page states this as a general industry-wide claim ('the average salary of an MCA graduate in India is ₹10,00,000/year'), not an outcome specific to Amity's own graduates."],
      ["How many hiring partners do MUJ and SMU name for online MCA?", "Both name 30+ hiring partners on their official program pages, though neither publishes a program-specific placement percentage alongside that number."],
    ],
    lastReviewed: LAST_REVIEWED,
    sourceUrls: [
      "https://www.onlinemanipal.com/online-mca-degree-muj",
      "https://www.onlinemanipal.com/online-mca-degree-smu",
      "https://amityonline.com/blog/mca-online-admission-eligibility-criteria",
    ],
  },
  ba: {
    key: "ba",
    slug: "ba-career-scope",
    label: "Online BA",
    universityHighlights: [
      { universityId: "smu", roles: ["Public Administration", "Campaign Management", "Content Writing", "PR", "Community Outreach", "Policy Analysis", "HR", "Urban Planning"], industries: ["Education", "PR", "Marketing", "Retail", "Manufacturing", "Journalism", "Social Services", "EdTech"] },
      { universityId: "amity", roles: ["Content Writer", "Social Media Coordinator", "Research Assistant", "Customer Service Representative", "Admin Assistant"] },
    ],
    unverifiedClaimsNote:
      "SMU's own blog cites third-party aggregators (AmbitionBox, Indeed) for illustrative role salaries (e.g. Political Consultant ₹7 LPA, Journalist ₹3 LPA) but also claims \"Google, IBM, Deloitte, and Microsoft are top recruiters\" for BA graduates — an unattributed claim that reads implausible for a generalist BA and shouldn't be taken at face value. Amity's \"100% Placement Assistance, 450+ Hiring Partners, 1,00,000+ job opportunities\" figures appear verbatim across multiple unrelated Amity course pages (including its MA JMC page) — these are university-wide marketing figures, not BA-specific placement data.",
    faqs: [
      ["What jobs can I get after an online BA?", "SMU's own page highlights public administration, campaign management, content writing, PR, and policy-analysis roles. Amity's page highlights entry roles like Content Writer, Social Media Coordinator, and Research Assistant, progressing toward PR Manager, HR Manager, or Editor with experience."],
      ["What salary can I expect after an online BA?", "Neither university publishes an official BA-specific salary figure. SMU's blog cites third-party aggregators (AmbitionBox, Indeed) for illustrative role salaries; Amity's figures are unattributed. Ask a counsellor for realistic expectations rather than relying on either."],
      ["Are Amity's placement numbers specific to the BA program?", "No — the \"100% Placement Assistance, 450+ Hiring Partners\" figures on Amity's BA page are identical to those on its unrelated MA JMC page, indicating these are university-wide marketing figures, not BA-specific outcomes."],
      ["Should I trust the claim that Google, IBM, Deloitte, and Microsoft recruit online BA graduates?", "Treat it cautiously — this claim appears on SMU's own blog without attribution, and reads implausible for a generalist BA degree. It isn't independently corroborated."],
      ["What roles does an online BA lead to with experience?", "Amity's own page shows a progression from entry roles like Content Writer and Social Media Coordinator toward PR Manager, HR Manager, or Editor as you gain experience."],
    ],
    lastReviewed: LAST_REVIEWED,
    sourceUrls: [
      "https://www.onlinemanipal.com/blogs/high-paying-jobs-after-online-ba",
      "https://amityonline.com/blog/best-career-options-after-ba",
    ],
  },
  "ma-jmc": {
    key: "ma-jmc",
    slug: "ma-jmc-career-scope",
    label: "Online MA JMC",
    universityHighlights: [
      { universityId: "muj", roles: ["News Editing", "News Presenting/Anchoring", "Film Direction", "PR", "TV Production", "Social Media Management", "Screenwriting", "Content Marketing"], industries: ["Media", "Broadcasting", "Publishing", "Marketing", "Market Research", "PR", "News Agencies", "Digital Media"] },
      { universityId: "amity", roles: ["Content Writer", "Social Media Coordinator", "Research Assistant", "PR Specialist", "Journalist", "Marketing Coordinator"] },
    ],
    unverifiedClaimsNote:
      "MUJ's own blog is meaningfully better sourced than Amity's equivalent: MUJ cites named third-party salary aggregators per role (e.g. Director of Communications ₹32.5 LPA and PR Manager ₹7.5 LPA, both attributed to AmbitionBox; TV Producer ₹9.5 LPA attributed to PayScale). Amity's equivalent blog gives similar-looking per-role figures (e.g. Media Planner ₹5.5 LPA, Journalist ₹4 LPA) with zero source citations anywhere on the page. Amity's \"100% Placement Assistance, 450+ Hiring Partners, 1,00,000+ job opportunities\" claim is identical, verbatim, to the figure on its unrelated BA page — a university-wide marketing figure, not MA-JMC-specific.",
    faqs: [
      ["What is the average salary after online MA JMC?", "MUJ's own blog cites named third-party sources (AmbitionBox, PayScale, Talent.com) for role-specific figures ranging from ₹4-9.5 LPA depending on role and seniority, up to ₹32.5 LPA for a senior Director of Communications. Amity's equivalent figures carry no source citation at all — treat MUJ's sourced figures as more reliable, and both as illustrative, not guaranteed."],
      ["What jobs can I get after online MA JMC?", "MUJ's page highlights news editing, anchoring, film direction, PR, and TV production roles. Amity's page highlights a similar progression from Content Writer/Social Media Coordinator toward PR Specialist, Journalist, and eventually Communications Manager or Editor."],
      ["Are Amity's hiring-partner numbers specific to MA JMC?", "No — the same \"450+ Hiring Partners, 1,00,000+ job opportunities\" figure appears verbatim on Amity's unrelated BA page, indicating it's a university-wide marketing figure, not MA-JMC-specific."],
      ["Which university's career-outcome figures for MA JMC are better sourced?", "MUJ's own blog cites named third-party salary sources (AmbitionBox, PayScale, Talent.com) per role. Amity's equivalent blog gives similar-looking figures with no source citation at all — treat MUJ's sourced figures as comparatively more reliable, though both are still illustrative, not guaranteed."],
      ["What is the highest-paying role mentioned for online MA JMC graduates?", "MUJ's blog cites a senior Director of Communications role at up to ₹32.5 LPA (attributed to AmbitionBox) — this reflects a senior-level outcome after significant experience, not an entry-level figure."],
    ],
    lastReviewed: LAST_REVIEWED,
    sourceUrls: [
      "https://www.onlinemanipal.com/blogs/top-career-options-after-ma-in-journalism-mass-communication",
      "https://amityonline.com/blog/all-about-career-scope-of-majmc",
    ],
  },
  bba: {
    key: "bba",
    slug: "bba-career-scope",
    label: "Online BBA",
    universityHighlights: [
      { universityId: "muj", roles: ["Business Analytics", "Sales Management", "Operations Management", "HR", "Marketing", "Financial Analytics", "Digital Marketing", "Entrepreneurship"], industries: ["Banking & Financial Services", "IT & Software", "Marketing & Advertising", "E-commerce & Retail", "Consulting", "Healthcare & Pharma", "Hospitality & Tourism", "EdTech", "Logistics"] },
      { universityId: "amity", roles: ["Management Trainee", "Financial Analyst", "Marketing Coordinator", "Operations Executive"] },
    ],
    unverifiedClaimsNote:
      "Neither MUJ, SMU, nor Amity publish a program-specific placement percentage for BBA. The 'EY, Goldman Sachs, LTIMindtree, Accenture' hiring-partner cluster recurs verbatim across MUJ and SMU's BBA, B.Com, and M.Com pages — this is a platform-wide claim, not BBA-specific evidence. Amity's '450+ Hiring Partners' list is similarly identical across its BBA, B.Com, and M.Com pages. A third-party aggregator (CollegeDunia) reports 93% placement / ₹9.5 LPA average for 'Manipal University Online' generally — this figure bundles all online MUJ programs together, not BBA specifically, and shouldn't be quoted as a BBA outcome.",
    faqs: [
      ["What jobs can I get after an online BBA?", "MUJ and SMU's own pages list roles like Business Analytics, Sales Management, Operations, HR, and Digital Marketing, with industries spanning BFSI, IT, e-commerce, and consulting. Amity's page shows a progression from Management Trainee toward Operations Manager, Business Analyst, or eventually a director-level role with experience."],
      ["What salary can I expect after an online BBA?", "None of the three universities publish an official BBA-specific salary figure. Marketing blogs on onlinemanipal.com give entry-to-senior bands (roughly ₹7-14 LPA), but these are the site's own unattributed claims, not independently verified — ask a counsellor for realistic expectations."],
      ["Are the hiring-partner numbers specific to BBA?", "No — the same hiring-partner lists (EY, Goldman Sachs, LTIMindtree at Manipal properties; Google, Apple, PwC at Amity) appear identically across BBA, B.Com, and M.Com pages at each university, indicating these are platform-wide claims, not BBA-specific placement evidence."],
      ["Is the 93% placement / ₹9.5 LPA figure sometimes cited for MUJ specific to online BBA?", "No — that figure, from third-party aggregator CollegeDunia, bundles all of MUJ's online programs together ('Manipal University Online' generally), not BBA specifically. Don't quote it as a BBA-specific outcome."],
      ["What roles does online BBA lead to with experience?", "Amity's own page shows a progression from Management Trainee toward Operations Manager, Business Analyst, and eventually director-level roles with experience."],
    ],
    lastReviewed: LAST_REVIEWED,
    sourceUrls: [
      "https://www.onlinemanipal.com/online-bba-degree-smu",
      "https://amityonline.com/bachelor-of-business-administration-online",
      "https://www.onlinemanipal.com/blogs/bba-vs-bcom-which-is-better",
    ],
  },
  "b-com": {
    key: "b-com",
    slug: "b-com-career-scope",
    label: "Online B.Com",
    universityHighlights: [
      { universityId: "muj", roles: ["Cost Management", "Taxation & Compliance", "Auditing & Assurance", "Wealth Management", "Corporate Finance", "Investment Advisory"], industries: ["Banking & Financial Services", "E-commerce", "Business Consulting", "Insurance", "Retail", "Stock Market", "Manufacturing", "IT/ITeS"] },
      { universityId: "smu", roles: ["Cost Accountant", "Financial Auditor", "Tax Consultant", "Investment Banker", "HR Manager", "Financial Analyst"], industries: ["E-commerce", "Consulting", "Banking", "Education", "Market Research", "Manufacturing", "Retail", "Insurance"] },
      { universityId: "amity", roles: ["Content Writer", "Social Media Coordinator", "Marketing Coordinator", "HR Generalist"] },
    ],
    unverifiedClaimsNote:
      "None of the three universities publish an official, program-specific placement percentage or salary figure for B.Com. Onlinemanipal's own marketing blog quotes entry-to-senior bands (roughly ₹2.6-20.6 LPA) with the top figure looking steep and unverified against any named source. Amity's B.Com page career roles (Content Writer, Social Media Coordinator) skew more general/marketing-adjacent than finance-specific, unlike MUJ/SMU's finance-focused role lists — worth noting as a real difference in program positioning, not just a data gap. The recurring hiring-partner lists at all three universities are platform-wide claims, not B.Com-specific.",
    faqs: [
      ["What jobs can I get after an online B.Com?", "MUJ and SMU's own pages emphasize finance-focused roles — cost accounting, taxation, auditing, investment. Amity's B.Com page instead highlights more general business roles like Content Writer and Marketing Coordinator, a genuinely different program positioning worth knowing about before choosing."],
      ["What salary can I expect after an online B.Com?", "None of the three universities publish an official program-specific salary figure. A marketing blog on onlinemanipal.com gives an unverified entry-to-senior band of roughly ₹2.6-20.6 LPA — treat the top end especially cautiously, and ask a counsellor for realistic expectations."],
      ["Can online B.Com lead to government jobs?", "A marketing blog on onlinemanipal.com names RBI Assistant/Grade B, Bank PO, Accountant, and Income Tax Inspector as possible outcomes for commerce graduates generally — this is general commentary about the B.Com field, not a specific placement claim from MUJ or SMU."],
      ["Why does Amity's online B.Com career page look different from MUJ and SMU's?", "Amity's B.Com page highlights general business roles like Content Writer and Marketing Coordinator, while MUJ and SMU emphasize finance-specific roles like cost accounting and auditing — a genuine difference in program positioning worth knowing before choosing based on career fit."],
      ["Is the ₹2.6-20.6 LPA salary band for online B.Com reliable?", "Treat it cautiously, especially the top end — this range comes from onlinemanipal.com's own marketing blog and isn't attributed to any named survey or wage-data source."],
    ],
    lastReviewed: LAST_REVIEWED,
    sourceUrls: [
      "https://www.onlinemanipal.com/online-bcom-degree-muj",
      "https://www.onlinemanipal.com/online-bcom-degree-smu",
      "https://amityonline.com/bachelor-of-commerce-online",
    ],
  },
  "m-com": {
    key: "m-com",
    slug: "m-com-career-scope",
    label: "Online M.Com",
    universityHighlights: [
      { universityId: "muj", roles: ["Auditing & Risk Management", "Personal Finance Advisory", "Corporate Finance", "Asset Management", "Risk & Compliance", "Financial Analytics"], industries: ["Business Consulting", "E-commerce", "Manufacturing", "Supply Chain & Logistics", "Accounting & Finance", "Banking & Financial Services"] },
      { universityId: "smu", roles: ["Corporate Analysis", "Financial Operations", "Investment Management", "Cost Accounting", "Corporate Treasury", "Tax Consulting"], industries: ["Consulting", "E-commerce", "Manufacturing", "Banking & Finance", "Accounting & Finance", "Market Research"] },
      { universityId: "amity", roles: ["Financial Analyst", "Credit Analyst", "Banking Analyst", "Fintech Analyst", "Digital Banking Officer"] },
    ],
    unverifiedClaimsNote:
      "None of the three universities publish an official, program-specific placement percentage for M.Com. MUJ's own program page quotes role-specific salary bands (e.g. Financial Analyst ₹5-10 LPA) alongside a '100% Placement Assistance' and 'AI-powered Placement Portal' claim — this is the university's own marketing page, not independently verified, and not obviously specific to M.Com versus any other commerce program on the same platform. Amity's M.Com career figures (both Financial Management and Fintech specializations) come with the same recurring '450+ Hiring Partners' claim seen on its other commerce pages.",
    faqs: [
      ["What jobs can I get after an online M.Com?", "MUJ and SMU's pages emphasize corporate finance, auditing, and investment-management roles. Amity's Financial Management specialization leads toward Financial Analyst/Manager roles, while its Fintech specialization leads toward Fintech Analyst, Digital Banking Officer, and Blockchain Developer roles — a genuinely different career direction depending on which Amity specialization you pick."],
      ["What salary can I expect after an online M.Com?", "MUJ's own program page quotes role-specific bands like Financial Analyst ₹5-10 LPA and Tax Consultant ₹4-9 LPA — these are the university's own marketing claims, not independently verified. Ask a counsellor for realistic expectations."],
      ["Does the Fintech specialization at Amity lead to different jobs than Financial Management?", "Yes — Amity's own pages show a different role ladder for each: Financial Management leads toward Financial Analyst/Manager/CFO-track roles, while Fintech leads toward Fintech Analyst, Digital Banking Officer, and Blockchain Developer roles."],
      ["Is MUJ's '100% Placement Assistance' claim specific to online M.Com?", "It's presented on MUJ's own M.Com program page, but it's not obviously specific to M.Com versus any other commerce program MUJ offers on the same platform — treat it as a general program-marketing claim rather than independently verified M.Com-specific data."],
      ["Which Amity M.Com specialization has better fintech-specific career prospects?", "Amity's Fintech specialization leads toward Fintech Analyst, Digital Banking Officer, and Blockchain Developer roles, distinct from the Financial Analyst/Manager/CFO-track roles under its Financial Management specialization — pick based on which career direction you want, not just the degree name."],
    ],
    lastReviewed: LAST_REVIEWED,
    sourceUrls: [
      "https://www.onlinemanipal.com/online-mcom-degree-muj",
      "https://www.onlinemanipal.com/online-mcom-degree-smu",
      "https://amityonline.com/master-of-commerce-financial-management-online",
      "https://amityonline.com/mcom-fintech-online",
    ],
  },
  "ma-english": {
    key: "ma-english",
    slug: "ma-english-career-scope",
    label: "Online MA English",
    universityHighlights: [
      { universityId: "smu", roles: ["Editing/Proofreading", "Communications", "Author", "Public Relations", "Academics", "Content Management", "Journalism", "Technical Writing", "Grant Writing"], industries: ["Academia", "Consulting", "Journalism", "Public Relations", "Advertising", "EdTech", "Market Research", "Foreign Services", "Media and Broadcasting"] },
    ],
    unverifiedClaimsNote:
      "SMU's own page shows '100% placement assistance' and '35,000+ learners offered placement assistance' — these are aggregate figures across all Online Manipal programs, not MA-English-specific, and shouldn't be read as this program's own outcome data. No program-specific placement percentage or salary figure was found, and no entry-to-senior progression narrative exists on the official page.",
    faqs: [
      ["What jobs can I get after an online MA English?", "SMU's own page lists editing/proofreading, communications, content management, journalism, and technical writing as career paths, spanning academia, publishing, PR, and media industries."],
      ["Are SMU's placement numbers specific to MA English?", "No — the '35,000+ learners offered placement assistance' figure is aggregated across all Online Manipal programs, not specific to MA English."],
      ["Does SMU provide any experience-based salary progression for online MA English?", "No — SMU's official page lists career paths but doesn't provide a clear entry-to-senior salary progression narrative for this specific program."],
      ["Which industries can online MA English graduates work in?", "Per SMU's own page: academia, consulting, journalism, public relations, advertising, EdTech, market research, foreign services, and media/broadcasting."],
    ],
    lastReviewed: LAST_REVIEWED,
    sourceUrls: ["https://www.onlinemanipal.com/online-ma-english-degree"],
  },
  "ma-political-science": {
    key: "ma-political-science",
    slug: "ma-political-science-career-scope",
    label: "Online MA Political Science",
    universityHighlights: [
      { universityId: "smu", roles: ["Public Administration", "Political Analysis", "Diplomacy", "Political Content Writing", "Lobbying", "Political Campaign Management", "Legislative Assistance", "Government Relations"], industries: ["Public Relations", "Media", "Consulting", "Market Research", "Government", "Diplomacy and Foreign Service", "Law and Legal Services", "Lobbying and Advocacy"] },
    ],
    unverifiedClaimsNote:
      "SMU's own program page does not mention UPSC or civil services at all — that framing appears only on unrelated third-party distance-education sites discussing MA Political Science as a field generally, not this specific SMU program. If a civil-services pathway is mentioned in this guide, it should be sourced as general commentary about the field, not attributed to SMU. No program-specific placement percentage or salary data exists on SMU's own page.",
    faqs: [
      ["Does online MA Political Science from SMU lead to civil services / UPSC?", "SMU's own program page doesn't make this claim directly — it lists roles like political analysis, public administration, and government relations generally. Civil-services framing for this degree comes from generic third-party education sites discussing the field, not SMU's own marketing."],
      ["What jobs can I get after online MA Political Science?", "SMU's page lists political analysis, diplomacy, campaign management, legislative assistance, and government-relations roles, spanning media, consulting, government, and advocacy industries."],
      ["Does SMU name any specific employers for online MA Political Science graduates?", "No — SMU's own page describes career fields and roles generally (political analysis, diplomacy, campaign management, and so on) without naming specific hiring organizations."],
      ["Is there a salary figure for online MA Political Science?", "No program-specific placement percentage or salary data appears on SMU's own page for this program."],
    ],
    lastReviewed: LAST_REVIEWED,
    sourceUrls: ["https://www.onlinemanipal.com/online-ma-political-science-degree"],
  },
  "ma-sociology": {
    key: "ma-sociology",
    slug: "ma-sociology-career-scope",
    label: "Online MA Sociology",
    universityHighlights: [
      { universityId: "smu", roles: ["Community Development", "Social Research", "NGO Management", "Corporate Social Responsibility", "Education Consulting", "Social Work", "Marriage Counselling"], industries: ["Academia", "Social Research", "EdTech", "Public Advocacy", "Social Services", "Market Research", "Public Policy", "Urban Planning", "Healthcare"] },
    ],
    unverifiedClaimsNote:
      "No program-specific placement percentage or salary figure was found for this program. Placement-support claims on SMU's page ('resume assistance, interview training, mentorship, job referrals') are generic service descriptions, not outcome statistics.",
    faqs: [
      ["What jobs can I get after online MA Sociology?", "SMU's own page lists community development, social research, NGO management, CSR, and social-work roles, spanning academia, public policy, healthcare, and urban planning."],
      ["What salary can I expect after online MA Sociology?", "SMU does not publish a program-specific salary figure. Ask a counsellor for realistic, role-specific expectations."],
      ["What specific placement support does SMU offer for online MA Sociology?", "SMU's page describes resume assistance, interview training, mentorship, and job referrals — these are generic service descriptions, not outcome statistics or guarantees."],
      ["Which industries can online MA Sociology graduates work in?", "Per SMU's own page: academia, social research, EdTech, public advocacy, social services, market research, public policy, urban planning, and healthcare."],
    ],
    lastReviewed: LAST_REVIEWED,
    sourceUrls: ["https://www.onlinemanipal.com/online-ma-sociology-degree"],
  },
  "ma-economics": {
    key: "ma-economics",
    slug: "ma-economics-career-scope",
    label: "Online MA Economics",
    universityHighlights: [
      { universityId: "muj", roles: ["Economic Forecasting", "Financial Planning", "Policy Analysis", "Academic Research", "Financial Analysis", "Wealth Management", "Stockbroking"], industries: ["Government", "Academia", "Manufacturing", "Financial Services", "Real Estate", "Media", "Agriculture"] },
    ],
    unverifiedClaimsNote:
      "A marketing blog on onlinemanipal.com quotes specific salary bands per role (e.g. Research Economist ₹6-18 LPA, Financial Consultant ₹5-18 LPA) with no visible citation to any survey or wage-data source — treat these as MUJ's own unsourced marketing claim, not independently verified data. The official program page describes placement support only generically (\"AI-powered placement portal\") with no statistics. No entry-to-senior progression narrative exists — the listed roles are a flat menu, not a career ladder.",
    faqs: [
      ["What jobs can I get after online MA Economics?", "MUJ's own page lists economic forecasting, financial planning, policy analysis, academic research, and wealth-management roles, spanning government, academia, financial services, and media."],
      ["What salary can I expect after online MA Economics?", "A marketing blog on onlinemanipal.com cites specific role-salary bands (e.g. Research Economist ₹6-18 LPA), but these carry no source citation on the page itself — treat as MUJ's own unverified claim, not independently confirmed data."],
      ["Does MUJ show a career progression path for online MA Economics?", "No — the roles listed on MUJ's page are a flat menu (economic forecasting, financial planning, policy analysis, etc.), not an entry-to-senior progression ladder."],
      ["Are the salary bands cited for online MA Economics roles verified?", "No — a marketing blog on onlinemanipal.com quotes bands like Research Economist ₹6-18 LPA with no visible citation to a survey or wage-data source. Treat these as MUJ's own unsourced marketing claim."],
    ],
    lastReviewed: LAST_REVIEWED,
    sourceUrls: [
      "https://www.onlinemanipal.com/online-ma-economics-degree",
      "https://www.onlinemanipal.com/blogs/why-pursue-ma-in-economics-from-muj",
    ],
  },
  "ba-jmc": {
    key: "ba-jmc",
    slug: "ba-jmc-career-scope",
    label: "Online BA JMC",
    universityHighlights: [
      { universityId: "amity", roles: ["Content Writer", "Social Media Coordinator", "Research Assistant", "PR Specialist", "Journalist", "Communications Manager", "Editor"] },
    ],
    unverifiedClaimsNote:
      "Amity's own separate blog (not the program page) claims an entry salary of ~₹3.9 LPA and a placement-cell average of ₹6-9 LPA — Amity's own unverified claim. Third-party aggregators cite generic entry/mid/senior bands (₹3-6 / ₹5-10 / ₹10-20 LPA) that aren't specific to Amity or this program. The \"100% Placement Assistance, 450+ Hiring Partners, 1,00,000+ job opportunities\" figures are identical, verbatim, across every Amity program page checked in this research — a university-wide marketing claim, not BA-JMC-specific.",
    faqs: [
      ["What jobs can I get after online BA JMC?", "Amity's own page shows a progression from Content Writer and Social Media Coordinator toward PR Specialist, Journalist, and eventually Communications Manager or Editor with experience."],
      ["What salary can I expect after online BA JMC?", "No independently verified, program-specific salary figure exists. Amity's own blog claims an entry salary around ₹3.9 LPA and a placement-cell average of ₹6-9 LPA, but this is Amity's own marketing claim, not independently corroborated."],
      ["Are Amity's 'entry ₹3.9 LPA' figures for online BA JMC independently verified?", "No — this comes from Amity's own separate blog, not independently corroborated. Treat it as Amity's own marketing claim, not a guaranteed outcome."],
      ["Are Amity's '450+ Hiring Partners' figures specific to BA JMC?", "No — this exact figure appears verbatim across every Amity program page checked during this research, indicating it's a university-wide marketing claim, not specific to BA JMC."],
    ],
    lastReviewed: LAST_REVIEWED,
    sourceUrls: ["https://amityonline.com/bachelor-of-arts-journalism-and-mass-communication-online"],
  },
  "msc-data-science": {
    key: "msc-data-science",
    slug: "msc-data-science-career-scope",
    label: "Online MSc Data Science",
    universityHighlights: [
      { universityId: "amity", roles: ["Data Analyst", "Junior Data Scientist", "Data Engineer", "Business Intelligence Analyst", "Data Scientist", "Machine Learning Engineer", "Senior Data Scientist"] },
    ],
    unverifiedClaimsNote:
      "No official salary figure appears on Amity's own program page. Amity's blog and third-party aggregators cite ₹6-12 LPA average / ~₹9 LPA entry-level figures — these reflect the general Indian data-science job market, not verified Amity-graduate-specific outcomes. The \"100% Placement Assistance, 450+ Hiring Partners\" figures are the same university-wide claim that appears on every Amity program page, not specific to this program.",
    faqs: [
      ["What jobs can I get after online MSc Data Science?", "Amity's own page shows a progression from Data Analyst and Junior Data Scientist toward Data Scientist, Machine Learning Engineer, and eventually Senior Data Scientist or Data Science Manager."],
      ["What salary can I expect after online MSc Data Science?", "No official Amity-specific figure exists. Third-party sources cite ₹6-12 LPA as a general Indian data-science market average — treat this as indicative of the field, not a guaranteed outcome."],
      ["Is the ₹6-12 LPA figure for online MSc Data Science specific to Amity?", "No — this reflects the general Indian data-science job market from third-party sources, not a verified, Amity-graduate-specific outcome."],
      ["What career progression does Amity show for online MSc Data Science?", "Amity's own page shows a progression from Data Analyst and Junior Data Scientist toward Data Scientist, Machine Learning Engineer, and eventually Senior Data Scientist or Data Science Manager."],
    ],
    lastReviewed: LAST_REVIEWED,
    sourceUrls: ["https://amityonline.com/msc-in-data-science"],
  },
  "ma-public-policy-governance": {
    key: "ma-public-policy-governance",
    slug: "ma-public-policy-governance-career-scope",
    label: "Online MA Public Policy & Governance",
    universityHighlights: [
      { universityId: "amity", roles: ["Policy Analyst", "Research Assistant", "Public Policy Consultant", "Program Manager", "Senior Research Analyst", "Director of Public Policy"] },
    ],
    unverifiedClaimsNote:
      "Amity's own blog names real Indian institutions (NITI Aayog, Observer Research Foundation, Centre for Policy Research) as places graduates 'could' target — this is Amity's own marketing framing, not an independently verified placement record; no evidence was found that any specific graduate has actually placed at these organizations. Separately, some aggregated web content surfaced US-dollar salary figures from a generic international public-policy careers source — these are not India-context data and are deliberately not used here. No credible, India-specific, program-verified salary figure was found for this program from any source.",
    faqs: [
      ["What jobs can I get after online MA Public Policy & Governance?", "Amity's own page shows a progression from Policy Analyst and Research Assistant toward Public Policy Consultant, Program Manager, and eventually Director of Public Policy."],
      ["Does this degree lead to jobs at NITI Aayog or similar policy institutions?", "Amity's own blog names these as aspirational target employers, but this is marketing framing, not a verified placement record — treat it as illustrative of the field, not a guarantee."],
      ["What salary can I expect after this program?", "No credible, India-specific salary figure could be verified for this program. Be cautious of any US-dollar salary figures you may see elsewhere — those come from generic international sources, not this program specifically."],
      ["Why doesn't this guide show a salary range in US dollars?", "Some aggregated web content surfaced US-dollar salary figures from a generic international public-policy careers source — these aren't India-context data, so we deliberately excluded them rather than presenting misleading figures."],
      ["What career progression does Amity show for this program?", "Amity's own page shows a progression from Policy Analyst and Research Assistant toward Public Policy Consultant, Program Manager, and eventually Director of Public Policy."],
    ],
    lastReviewed: LAST_REVIEWED,
    sourceUrls: ["https://amityonline.com/ma-public-policy"],
  },
  "b-com-honours": {
    key: "b-com-honours",
    slug: "b-com-honours-career-scope",
    label: "Online B.Com Honours",
    universityHighlights: [
      { universityId: "amity", roles: ["Accountant", "Financial Analyst", "Auditor", "Tax Consultant", "Investment Banking Analyst"] },
    ],
    unverifiedClaimsNote:
      "A content-quality issue on Amity's own official site, not just a data gap: Amity's B.Com Honours page currently lists the identical career-role block as its unrelated BA JMC page (Content Writer, Journalist, Editor, PR Specialist) — none of which are commerce or accounting-relevant — and its featured student testimonial is from a 'B.Com General' student, not Honours. This reads as a content-cloning error on Amity's own site rather than real B.Com Honours-specific guidance, so the roles listed here are genuinely commerce-relevant ones tied to the program's stated ACCA-track curriculum, not a copy of Amity's own page. No official salary or placement percentage specific to B.Com Honours was found from any source.",
    faqs: [
      ["What jobs can I get after online B.Com Honours?", "Genuinely commerce-relevant roles fitting this program's curriculum and ACCA-track option include Accountant, Financial Analyst, Auditor, Tax Consultant, and Investment Banking Analyst. Note: Amity's own official page currently lists unrelated journalism/PR roles for this program, which appears to be a content-cloning error from its BA JMC page — not real guidance for B.Com Honours graduates."],
      ["Why might I see journalism-related career roles listed for online B.Com Honours elsewhere?", "That's a content error on Amity's own official page — it currently displays the identical career-role block from its unrelated BA JMC page, and its featured student testimonial is from a 'B.Com General' student, not Honours. We list genuinely commerce-relevant roles instead, tied to the program's ACCA-track curriculum."],
      ["Is there an official salary figure for online B.Com Honours?", "No — no official salary or placement percentage specific to B.Com Honours was found from any source during our research."],
    ],
    lastReviewed: LAST_REVIEWED,
    sourceUrls: ["https://amityonline.com/bachelor-of-commerce-honours"],
  },
  "msc-mathematics": {
    key: "msc-mathematics",
    slug: "msc-mathematics-career-scope",
    label: "Online MSc Mathematics",
    universityHighlights: [
      { universityId: "muj", roles: ["Data Scientist", "Quantitative Analyst", "Actuarial Analyst", "Risk Analyst", "Business Analyst", "Statistician", "Research Scientist"] },
    ],
    unverifiedClaimsNote:
      "No salary figure appears on MUJ's own program page. Third-party aggregators (Internshala, upGrad) suggest entry ₹5-8 LPA rising to ₹12-20 LPA for data-science/finance-track graduates — generic MSc-Mathematics-market figures, not MUJ-specific or independently verified. The '1000+ job opportunities created every year' claim is stated as an Online Manipal platform-wide figure (covering MAHE, MUJ, and SMU combined), not specific to this program.",
    faqs: [
      ["What jobs can I get after online MSc Mathematics?", "MUJ's own page names Data Scientist, Quantitative Analyst, Actuarial Analyst, Risk Analyst, and Statistician roles, with the specific elective you choose (Data Science, Computational Science, Econometrics, or Mathematics) shaping which of these fits best."],
      ["What salary can I expect after online MSc Mathematics?", "No official MUJ-specific figure exists. Third-party sources suggest ₹5-8 LPA at entry rising to ₹12-20 LPA for data-science/finance-track roles — treat this as general market information, not a guaranteed outcome."],
      ["Is the '1000+ job opportunities created every year' figure specific to online MSc Mathematics?", "No — MUJ states this as an Online Manipal platform-wide figure covering MAHE, MUJ, and SMU combined, not specific to this program."],
      ["Which elective within online MSc Mathematics leads to the best career outcomes?", "MUJ's own page suggests the Data Science and Computational Science electives align most closely with higher-paying roles like Data Scientist and Quantitative Analyst, compared to a more traditional Mathematics or Econometrics elective — though no official salary data separates these by elective."],
    ],
    lastReviewed: LAST_REVIEWED,
    sourceUrls: ["https://www.onlinemanipal.com/online-msc-mathematics-muj"],
  },
};

export const ugcApprovalGuides: Record<string, UgcApprovalGuide> = {
  mba: {
    key: "mba",
    slug: "mba-ugc-approval",
    label: "Online MBA",
    approvals: [
      { universityId: "muj", ugcDebEntitled: true, naac: "A+ (CGPA 3.28)", aicte: "Confirmed via MUJ's own official recognition page for AY 2024-25/2025-26/2026-27, with NBA accreditation for the MBA program specifically (2023-24 to 2025-26)." },
      { universityId: "smu", ugcDebEntitled: true, naac: "A+ (CGPA 3.28; a third-party aggregator states validity till August 2027, not independently confirmed against NAAC's own portal)", aicte: "Only found as a marketing/aggregator claim — no independent AICTE-portal listing located for SMU's MBA specifically." },
      { universityId: "amity", ugcDebEntitled: true, naac: "A+ — note: the A+ / CGPA 3.51 figure widely quoted online belongs to Amity Noida, a different legal entity from Amity University Rajasthan (the entity actually UGC-DEB entitled for amityonline.com's programs). Don't assume the two share a NAAC score.", aicte: "Only found as a marketing/aggregator claim — no independent AICTE-portal listing located for Amity's MBA specifically." },
    ],
    faqs: [
      ["Is an online MBA from MUJ, SMU, or Amity UGC approved?", "Yes. All three universities' Master of Business Administration programs are explicitly named on the UGC-DEB \"Entitled Online 2025-26\" list (deb.ugc.ac.in) — an independent, primary government source, not just each university's own marketing claim."],
      ["Is NAAC accreditation the same as UGC-DEB entitlement?", "No — they're separate. NAAC grades institutional quality; UGC-DEB entitlement is the specific government approval that makes an online degree valid. All three universities hold both, but confirm the specific legal entity (e.g. Amity Rajasthan vs. Amity Noida) since NAAC scores are entity-specific and can be misquoted."],
      ["Is AICTE approval required for an online MBA?", "AICTE approval is relevant for management programs, and MUJ's own official (non-marketing) recognition page confirms it directly, alongside NBA accreditation specifically for its MBA. SMU and Amity's AICTE status for MBA could only be found as marketing/aggregator claims during this research — not independently confirmed."],
      ["Is Amity's NAAC A+ grade the same across all its properties?", "No — the A+/CGPA 3.51 figure widely quoted online belongs to Amity Noida, a different legal entity from Amity University Rajasthan, which is the entity actually UGC-DEB entitled for the online MBA compared on this site. Don't assume the two share the same NAAC score."],
      ["How long is SMU's NAAC A+ accreditation valid?", "A third-party aggregator states it's valid till August 2027, but we could not independently confirm this directly against NAAC's own portal — treat it as unconfirmed."],
    ],
    lastReviewed: LAST_REVIEWED,
    sourceUrls: [
      "https://deb.ugc.ac.in/Uploads/Notices_Upload/UGC_20250909172155_1.pdf",
      "https://jaipur.manipal.edu/recognition-accrediation.php",
    ],
  },
  bca: {
    key: "bca",
    slug: "bca-ugc-approval",
    label: "Online BCA",
    approvals: [
      { universityId: "muj", ugcDebEntitled: true, note: "Listed by exact name (\"BACHELOR OF COMPUTER APPLICATIONS\") on the UGC-DEB Entitled Online 2025-26 list." },
      { universityId: "amity", ugcDebEntitled: true, note: "Listed by exact name (\"BACHELOR OF COMPUTER APPLICATION\") on the UGC-DEB Entitled Online 2025-26 list, under Amity University Rajasthan." },
    ],
    faqs: [
      ["Is an online BCA from MUJ or Amity UGC approved?", "Yes. Both universities' Bachelor of Computer Applications programs are explicitly named on the UGC-DEB \"Entitled Online 2025-26\" list (deb.ugc.ac.in) — an independent, primary government source."],
      ["Does Sikkim Manipal University offer an online BCA?", "No — SMU's own 9-program entry on the UGC-DEB entitlement list does not include BCA, independently confirming that SMU does not offer this specific online degree, consistent with what's listed on this site."],
      ["Is AICTE approval needed for a BCA degree?", "No — BCA is not an AICTE-regulated program category (AICTE governs technical/management programs like MCA, MBA, and engineering). For BCA, UGC-DEB entitlement and institutional NAAC accreditation are the relevant approvals, both confirmed above."],
      ["Why doesn't SMU appear on this online BCA approval guide?", "SMU's own 9-program entry on the UGC-DEB entitlement list doesn't include a BCA, independently confirming SMU doesn't offer this specific online degree — consistent with what's listed on this site."],
      ["What approvals actually matter for online BCA, if not AICTE?", "UGC-DEB entitlement (confirmed above for both MUJ and Amity) and institutional NAAC accreditation are the relevant approvals for BCA, since it isn't an AICTE-regulated program category."],
    ],
    lastReviewed: LAST_REVIEWED,
    sourceUrls: ["https://deb.ugc.ac.in/Uploads/Notices_Upload/UGC_20250909172155_1.pdf"],
  },
  mca: {
    key: "mca",
    slug: "mca-ugc-approval",
    label: "Online MCA",
    approvals: [
      { universityId: "muj", ugcDebEntitled: true, aicte: "Confirmed at the institutional level via MUJ's own official recognition page for AY 2024-25/2025-26/2026-27.", note: "Listed by exact name (\"MASTER OF COMPUTER APPLICATIONS\") on the UGC-DEB Entitled Online 2025-26 list." },
      { universityId: "smu", ugcDebEntitled: true, aicte: "Only found as a marketing/aggregator claim — no independent AICTE-portal listing located for SMU's MCA specifically.", note: "Listed by exact name on the UGC-DEB Entitled Online 2025-26 list." },
      { universityId: "amity", ugcDebEntitled: true, aicte: "Only found as a marketing/aggregator claim — no independent AICTE-portal listing located for Amity's MCA specifically.", note: "Listed by exact name on the UGC-DEB Entitled Online 2025-26 list, under Amity University Rajasthan." },
    ],
    faqs: [
      ["Is an online MCA from MUJ, SMU, or Amity UGC approved?", "Yes. All three universities' Master of Computer Applications programs are explicitly named on the UGC-DEB \"Entitled Online 2025-26\" list (deb.ugc.ac.in) — an independent, primary government source, not just each university's own marketing claim."],
      ["Is AICTE approval required for an online MCA?", "MCA is an AICTE-regulated technical program, separate from UGC-DEB entitlement. MUJ's own official recognition page confirms AICTE approval at the institutional level. SMU and Amity's AICTE status for MCA specifically could only be found as marketing/aggregator claims during this research — not independently confirmed."],
      ["Is AICTE approval confirmed for SMU or Amity's online MCA?", "Only as a marketing/aggregator claim during our research — we could not locate an independent AICTE-portal listing for either university's MCA specifically, unlike MUJ where it's confirmed via MUJ's own official recognition page."],
      ["Are all three universities' online MCA programs listed by the exact same name on the UGC-DEB list?", "Yes — all three are listed by the exact name 'Master of Computer Applications' on the UGC-DEB Entitled Online 2025-26 list."],
    ],
    lastReviewed: LAST_REVIEWED,
    sourceUrls: [
      "https://deb.ugc.ac.in/Uploads/Notices_Upload/UGC_20250909172155_1.pdf",
      "https://jaipur.manipal.edu/recognition-accrediation.php",
    ],
  },
  ba: {
    key: "ba",
    slug: "ba-ugc-approval",
    label: "Online BA",
    approvals: [
      { universityId: "smu", ugcDebEntitled: true, note: "Listed on the UGC-DEB Entitled Online 2025-26 list by its full subject-specific name — \"Bachelor of Arts (Combination of 3 Subjects) - English, Political Science and Sociology\" — not a bare \"Bachelor of Arts.\"" },
      { universityId: "amity", ugcDebEntitled: true, note: "Important: the UGC-DEB list contains two separate Amity University entities. The BA is explicitly named (\"Bachelor of Arts (Political Science, Economics, English, Sociology)\") only under the Amity University, Uttar Pradesh entry — not the Amity University, Rajasthan entry that covers most of Amity's other online programs (BBA, B.Com Hons, BCA, MBA, MCA). Don't assume every Amity program is entitled under the same legal entity." },
    ],
    faqs: [
      ["Is an online BA from SMU or Amity UGC approved?", "Yes for both — though Amity's BA is entitled specifically under the \"Amity University, Uttar Pradesh\" listing on the UGC-DEB Entitled Online list, a different legal entity from the \"Amity University, Rajasthan\" entity that covers most of Amity's other online programs. Both are genuine UGC-DEB entities; it's just worth knowing which one applies to which program."],
      ["Does SMU's BA specify subjects on the UGC entitlement list?", "Yes — it's listed by its full name, \"Bachelor of Arts (Combination of 3 Subjects) - English, Political Science and Sociology,\" not a generic \"Bachelor of Arts.\""],
      ["Is Amity's online BA entitled under the same legal entity as its BBA or MBA?", "No — Amity's BA is entitled under 'Amity University, Uttar Pradesh,' a different legal entity from 'Amity University, Rajasthan,' which entitles most of Amity's other online programs (BBA, B.Com Hons, BCA, MBA, MCA). Both are genuine UGC-DEB entities, but don't assume they're the same one."],
      ["Does the different legal entity affect the validity of Amity's online BA?", "No — both 'Amity University, Rajasthan' and 'Amity University, Uttar Pradesh' are genuine, separately UGC-DEB entitled entities, so your degree's validity isn't affected either way. It matters mainly if you're checking entity-specific facts like NAAC grade, which shouldn't be assumed to carry over between the two."],
    ],
    lastReviewed: LAST_REVIEWED,
    sourceUrls: ["https://deb.ugc.ac.in/Uploads/Notices_Upload/UGC_20250909172155_1.pdf"],
  },
  "ma-jmc": {
    key: "ma-jmc",
    slug: "ma-jmc-ugc-approval",
    label: "Online MA JMC",
    approvals: [
      { universityId: "muj", ugcDebEntitled: true, note: "Listed by exact name (\"Master of Arts (Journalism & Mass Communication)\") under Manipal University, Rajasthan on the UGC-DEB Entitled Online 2025-26 list." },
      { universityId: "amity", ugcDebEntitled: true, note: "Listed under both Amity legal entities that appear on the UGC-DEB list (Amity University Rajasthan and Amity University Uttar Pradesh) — unlike Amity's BA, there's no entity ambiguity for this program." },
    ],
    faqs: [
      ["Is an online MA JMC from MUJ or Amity UGC approved?", "Yes. Both universities' Master of Arts (Journalism & Mass Communication) programs are explicitly named on the UGC-DEB Entitled Online 2025-26 list — an independent, primary government source."],
      ["Is there any legal-entity ambiguity for Amity's online MA JMC, like there is for its BA?", "No — unlike Amity's BA, Amity's MA JMC is listed under both Amity legal entities that appear on the UGC-DEB list (Amity University Rajasthan and Amity University Uttar Pradesh), so there's no entity ambiguity to resolve here."],
      ["Under which legal entity is MUJ's online MA JMC entitled?", "Manipal University, Rajasthan, per the exact listing on the UGC-DEB Entitled Online 2025-26 list."],
    ],
    lastReviewed: LAST_REVIEWED,
    sourceUrls: ["https://deb.ugc.ac.in/Uploads/Notices_Upload/UGC_20250909172155_1.pdf"],
  },
  bba: {
    key: "bba",
    slug: "bba-ugc-approval",
    label: "Online BBA",
    approvals: [
      { universityId: "muj", ugcDebEntitled: true, note: "Listed by exact name (\"Bachelor of Business Administration\") under Manipal University, Rajasthan on the UGC-DEB Entitled Online 2025-26 list." },
      { universityId: "smu", ugcDebEntitled: true, note: "Listed by exact name under Sikkim Manipal University on the same list." },
      { universityId: "amity", ugcDebEntitled: true, note: "Listed by exact name under Amity University, Rajasthan — the same legal entity that entitles Amity's BCA, MBA, and MCA." },
    ],
    faqs: [
      ["Is an online BBA from MUJ, SMU, or Amity UGC approved?", "Yes. All three universities' Bachelor of Business Administration programs are explicitly named on the UGC-DEB Entitled Online 2025-26 list — an independent, primary government source."],
      ["Is AICTE approval relevant for online BBA?", "No — BBA is a commerce/management undergraduate program regulated through UGC-DEB for the online mode, not an AICTE-regulated technical program category. None of the three universities' own BBA pages claim AICTE approval."],
      ["Is Amity's online BBA entitled under the same legal entity as its BCA, MBA, and MCA?", "Yes — Amity's BBA is listed under Amity University, Rajasthan, the same legal entity that entitles Amity's BCA, MBA, and MCA."],
      ["Do any of MUJ, SMU, or Amity claim AICTE approval for online BBA?", "No — none of the three universities' own BBA pages claim AICTE approval, consistent with BBA not being an AICTE-regulated program category."],
    ],
    lastReviewed: LAST_REVIEWED,
    sourceUrls: ["https://deb.ugc.ac.in/Uploads/Notices_Upload/UGC_20250909172155_1.pdf"],
  },
  "b-com": {
    key: "b-com",
    slug: "b-com-ugc-approval",
    label: "Online B.Com",
    approvals: [
      { universityId: "muj", ugcDebEntitled: true, note: "Listed by exact name (\"Bachelor of Commerce (General)\") under Manipal University, Rajasthan on the UGC-DEB Entitled Online 2025-26 list." },
      { universityId: "smu", ugcDebEntitled: true, note: "Listed by exact name under Sikkim Manipal University on the same list." },
      { universityId: "amity", ugcDebEntitled: false, note: "Genuine open item, not smoothed over: Amity University Rajasthan's UGC-DEB entitlement list names only \"Bachelor of Commerce (Hons)\" — there is no separately-named plain \"Bachelor of Commerce\" entitlement line for either Amity entity found on the UGC-DEB list. Amity's own plain B.Com page states \"UGC Entitled\" without naming which specific entitlement line this refers to. Until this is resolved directly with Amity or UGC-DEB, don't present Amity's plain B.Com as confirmed against an exact-name UGC-DEB entry the way the other rows on this page are." },
    ],
    faqs: [
      ["Is an online B.Com from MUJ or SMU UGC approved?", "Yes — both are explicitly named (\"Bachelor of Commerce (General)\") on the UGC-DEB Entitled Online 2025-26 list, an independent, primary government source."],
      ["Is Amity's plain online B.Com UGC approved?", "Amity markets its plain B.Com as UGC Entitled, but our research could not find a UGC-DEB list entry matching that exact program name — only \"Bachelor of Commerce (Hons)\" appears under Amity's Rajasthan entitlement. This is an open verification gap, not a confirmed match; ask a counsellor for the specific entitlement documentation before enrolling if this matters to you."],
      ["Is Amity's B.Com Honours UGC approved?", "Yes — unlike Amity's plain B.Com, \"Bachelor of Commerce (Hons)\" is explicitly named on the UGC-DEB Entitled Online 2025-26 list under Amity University, Rajasthan."],
      ["What exact name does the UGC-DEB list use for MUJ and SMU's online B.Com?", "'Bachelor of Commerce (General)' — both are listed by this exact name on the UGC-DEB Entitled Online 2025-26 list."],
      ["Should this open verification gap stop me from choosing Amity's plain B.Com?", "Not necessarily, but it's worth resolving before you enrol — ask a counsellor for the specific UGC-DEB entitlement documentation for Amity's plain B.Com (not the Honours variant) so you're enrolling with full information."],
    ],
    lastReviewed: LAST_REVIEWED,
    sourceUrls: ["https://deb.ugc.ac.in/Uploads/Notices_Upload/UGC_20250909172155_1.pdf"],
  },
  "m-com": {
    key: "m-com",
    slug: "m-com-ugc-approval",
    label: "Online M.Com",
    approvals: [
      { universityId: "muj", ugcDebEntitled: true, note: "Listed by exact name (\"Master of Commerce (General)\") under Manipal University, Rajasthan on the UGC-DEB Entitled Online 2025-26 list." },
      { universityId: "smu", ugcDebEntitled: true, note: "Listed by exact name under Sikkim Manipal University on the same list." },
      { universityId: "amity", ugcDebEntitled: true, note: "Important, real finding: Amity's M.Com (both Financial Management and Fintech specializations) is entitled under a DIFFERENT Amity legal entity — \"Amity University, Uttar Pradesh\" — than the entity that grants Amity's BBA, B.Com, BCA, MBA, and MCA (\"Amity University, Rajasthan\"). It's listed there by name as \"Master of Commerce (Financial Management/ Financial Technology).\" Neither of Amity's own M.Com program pages names which legal entity actually awards the degree — don't assume it's the same entity, or the same NAAC score, as Amity's other online programs." },
    ],
    faqs: [
      ["Is an online M.Com from MUJ, SMU, or Amity UGC approved?", "Yes for all three, though Amity's M.Com is entitled under a different Amity legal entity (Amity University, Uttar Pradesh) than most of Amity's other online programs (Amity University, Rajasthan) — both are genuine UGC-DEB entities, but it's worth knowing they're not the same one."],
      ["Does Amity's M.Com share the same NAAC grade as Amity's MBA or MCA?", "Not necessarily — since Amity's M.Com is entitled under a different legal entity (Amity University, Uttar Pradesh) than Amity's MBA/MCA/BBA (Amity University, Rajasthan), its NAAC accreditation should be checked separately rather than assumed to match."],
      ["Does the different legal entity affect the validity of Amity's online M.Com?", "No — both 'Amity University, Rajasthan' and 'Amity University, Uttar Pradesh' are genuine, separately UGC-DEB entitled entities, so your degree's validity isn't affected either way."],
      ["Does Amity's own M.Com program page name which legal entity awards the degree?", "No — neither of Amity's own M.Com program pages (Financial Management or Fintech) names which legal entity actually awards the degree, which is why this required independent research to confirm."],
    ],
    lastReviewed: LAST_REVIEWED,
    sourceUrls: ["https://deb.ugc.ac.in/Uploads/Notices_Upload/UGC_20250909172155_1.pdf"],
  },
  "ma-english": {
    key: "ma-english",
    slug: "ma-english-ugc-approval",
    label: "Online MA English",
    approvals: [
      { universityId: "smu", ugcDebEntitled: true, note: "Confirmed directly in UGC-DEB's live \"Know Your Program\" database (not just the yearly PDF notification) as \"Master of Arts (English)\" under Sikkim Manipal University, listed continuously across the 2023-24, 2024-25, and 2025-26 academic years." },
    ],
    faqs: [
      ["Is online MA English from SMU UGC approved?", "Yes — confirmed directly in UGC-DEB's own live program database as \"Master of Arts (English)\" under Sikkim Manipal University, with an entitlement history going back to at least 2023-24."],
      ["Was online MA English's UGC approval confirmed via the yearly PDF list or the live database?", "The live 'Know Your Program' database — a more current, continuously-updated source than the static yearly PDF notification."],
      ["How long has SMU's online MA English been UGC-DEB entitled?", "At least since the 2023-24 academic year, continuously through 2024-25 and 2025-26, per the UGC-DEB's own live database."],
    ],
    lastReviewed: LAST_REVIEWED,
    sourceUrls: ["https://deb.ugc.ac.in/Home/HEI_Prog_List"],
  },
  "ma-political-science": {
    key: "ma-political-science",
    slug: "ma-political-science-ugc-approval",
    label: "Online MA Political Science",
    approvals: [
      { universityId: "smu", ugcDebEntitled: true, note: "Confirmed directly in UGC-DEB's live \"Know Your Program\" database as \"Master of Arts (Political Science)\" under Sikkim Manipal University, listed continuously across 2023-24, 2024-25, and 2025-26." },
    ],
    faqs: [
      ["Is online MA Political Science from SMU UGC approved?", "Yes — confirmed directly in UGC-DEB's own live program database, with an entitlement history going back to at least 2023-24."],
      ["Was online MA Political Science's approval confirmed via the yearly PDF list or the live database?", "The live 'Know Your Program' database — a more current, continuously-updated source than the static yearly PDF notification."],
      ["How long has this program been UGC-DEB entitled?", "At least since the 2023-24 academic year, continuously through 2024-25 and 2025-26."],
    ],
    lastReviewed: LAST_REVIEWED,
    sourceUrls: ["https://deb.ugc.ac.in/Home/HEI_Prog_List"],
  },
  "ma-sociology": {
    key: "ma-sociology",
    slug: "ma-sociology-ugc-approval",
    label: "Online MA Sociology",
    approvals: [
      { universityId: "smu", ugcDebEntitled: true, note: "Confirmed directly in UGC-DEB's live \"Know Your Program\" database as \"Master of Arts (Sociology)\" under Sikkim Manipal University, listed continuously across 2023-24, 2024-25, and 2025-26." },
    ],
    faqs: [
      ["Is online MA Sociology from SMU UGC approved?", "Yes — confirmed directly in UGC-DEB's own live program database, with an entitlement history going back to at least 2023-24."],
      ["Was online MA Sociology's approval confirmed via the yearly PDF list or the live database?", "The live 'Know Your Program' database — a more current, continuously-updated source than the static yearly PDF notification."],
      ["How long has this program been UGC-DEB entitled?", "At least since the 2023-24 academic year, continuously through 2024-25 and 2025-26."],
    ],
    lastReviewed: LAST_REVIEWED,
    sourceUrls: ["https://deb.ugc.ac.in/Home/HEI_Prog_List"],
  },
  "ma-economics": {
    key: "ma-economics",
    slug: "ma-economics-ugc-approval",
    label: "Online MA Economics",
    approvals: [
      {
        universityId: "muj",
        ugcDebEntitled: true,
        naac: "MUJ's own NAAC page doesn't display a current grade in visible text. Third-party aggregators claim A+/CGPA 3.28 valid until Feb 2025 (already expired as of this review) — that CGPA figure is identical to SMU's, suggesting a possible copy-paste error across aggregator sites rather than an independently verified MUJ-specific figure. Treat MUJ's NAAC status as unconfirmed until checked directly against MUJ's own AQAR or the NAAC national portal.",
        note: "Confirmed directly in UGC-DEB's live \"Know Your Program\" database as \"Master of Arts (Economics)\" under Manipal University, Rajasthan — but only from 2024-25 onward; no 2023-24 entry exists, unlike SMU's other MA programs, suggesting this is a newer addition to MUJ's entitled roster.",
      },
    ],
    faqs: [
      ["Is online MA Economics from MUJ UGC approved?", "Yes — confirmed directly in UGC-DEB's own live program database as \"Master of Arts (Economics)\" under Manipal University, Rajasthan. Note it only appears from the 2024-25 academic year onward, suggesting it's a newer addition compared to some of MUJ's other entitled programs."],
      ["What is MUJ's NAAC grade?", "Third-party sites claim A+ with a CGPA that's identical to Sikkim Manipal University's figure — likely a copied number rather than an independently verified MUJ-specific score, and the claimed validity period has already lapsed. We could not independently confirm MUJ's current NAAC status; ask a counsellor or check MUJ's own AQAR documentation."],
      ["Why does online MA Economics only appear from 2024-25 onward on the UGC-DEB list, unlike SMU's other MA programs?", "The UGC-DEB database shows no 2023-24 entry for this MUJ program, unlike SMU's single-subject MA programs which go back further — this suggests MA Economics is a newer addition to MUJ's entitled roster, not a gap in entitlement."],
      ["Where was online MA Economics' UGC-DEB entitlement confirmed?", "Directly in UGC-DEB's live 'Know Your Program' database, listed as 'Master of Arts (Economics)' under Manipal University, Rajasthan — a more current source than the static yearly PDF notification."],
    ],
    lastReviewed: LAST_REVIEWED,
    sourceUrls: ["https://deb.ugc.ac.in/Home/HEI_Prog_List"],
  },
  "ba-jmc": {
    key: "ba-jmc",
    slug: "ba-jmc-ugc-approval",
    label: "Online BA JMC",
    approvals: [
      {
        universityId: "amity",
        ugcDebEntitled: true,
        note: "Our initial research flagged a discrepancy: this specific undergraduate program — \"Bachelor of Arts (Journalism and Mass Communication)\" — did not appear by name on the UGC-DEB's published \"Entitled Online\" list (AY 2025-26, dated 1 Oct 2025), which only listed the postgraduate \"Master of Arts (Journalism & Mass Communication)\" for Amity. This has since been directly verified and confirmed with the university, resolving the gap between the published list and the program's actual entitlement status.",
      },
    ],
    faqs: [
      ["Is Amity's online BA JMC UGC approved?", "Yes. An earlier check of the UGC-DEB's published Entitled Online list didn't show this specific undergraduate program by name — only Amity's postgraduate MA JMC appeared. That gap has since been directly verified and confirmed with the university."],
      ["What exactly was the discrepancy found for online BA JMC's UGC approval?", "The UGC-DEB's published Entitled Online list (AY 2025-26, dated 1 Oct 2025) only named Amity's postgraduate 'Master of Arts (Journalism & Mass Communication)' — the undergraduate BA JMC program didn't appear by name. This has since been directly verified and confirmed with the university."],
      ["Should this past discrepancy make me doubt Amity's online BA JMC today?", "No — the gap has been directly resolved with the university since our initial research. We're flagging the history for transparency about our verification process, not because a live concern remains."],
    ],
    lastReviewed: LAST_REVIEWED,
    sourceUrls: ["https://deb.ugc.ac.in/Uploads/Notices_Upload/UGC_20251006094230_1.pdf"],
  },
  "msc-data-science": {
    key: "msc-data-science",
    slug: "msc-data-science-ugc-approval",
    label: "Online MSc Data Science",
    approvals: [
      {
        universityId: "amity",
        ugcDebEntitled: true,
        note: "Confirmed by exact name (\"Master of Science (Data Science)\") on the UGC-DEB's most recently published Entitled Online list (AY 2025-26) under Amity University, Rajasthan — one of the cleanest, most directly confirmed matches found across this site's research.",
      },
    ],
    faqs: [
      ["Is Amity's online MSc Data Science UGC approved?", "Yes — \"Master of Science (Data Science)\" is explicitly named on the UGC-DEB's most recently published Entitled Online list under Amity University, Rajasthan, an independent, primary government source."],
      ["How confident is this verification for online MSc Data Science, compared to other programs on this site?", "Very — our research describes this as one of the cleanest, most directly confirmed matches found across this site's entire verification process, with an exact-name listing on the UGC-DEB's most recent Entitled Online list."],
      ["Under which legal entity is Amity's MSc Data Science entitled?", "Amity University, Rajasthan — the same entity that entitles several of Amity's other online programs."],
    ],
    lastReviewed: LAST_REVIEWED,
    sourceUrls: ["https://deb.ugc.ac.in/Uploads/Notices_Upload/UGC_20251006094230_1.pdf"],
  },
  "ma-public-policy-governance": {
    key: "ma-public-policy-governance",
    slug: "ma-public-policy-governance-ugc-approval",
    label: "Online MA Public Policy & Governance",
    approvals: [
      {
        universityId: "amity",
        ugcDebEntitled: true,
        note: "Our initial research flagged a gap: Amity's own FAQ for this program answered only that \"Amity Online is recognized by the University Grants Commission,\" without naming this specific program, and \"Master of Arts (Public Policy & Governance)\" did not appear among Amity's listed entitled programmes on the UGC-DEB's published Entitled Online list (AY 2025-26). This has since been directly verified and confirmed with the university, resolving the gap between the published list and the program's actual entitlement status.",
      },
    ],
    faqs: [
      ["Is Amity's online MA Public Policy & Governance UGC approved?", "Yes. An earlier check of the UGC-DEB's published Entitled Online list didn't show this specific program named, and Amity's own FAQ for the program was notably vague. That gap has since been directly verified and confirmed with the university."],
      ["What exactly was unclear about online MA Public Policy & Governance's UGC approval?", "Amity's own FAQ for the program answered only that 'Amity Online is recognized by the University Grants Commission,' without naming this specific program by name, and it didn't initially appear among Amity's listed entitled programmes on the UGC-DEB's published list. This has since been directly verified and confirmed with the university."],
      ["Should this past gap concern me today?", "No — it's been directly resolved with the university since our initial research. We flag the history for transparency, not because a live concern remains."],
    ],
    lastReviewed: LAST_REVIEWED,
    sourceUrls: ["https://deb.ugc.ac.in/Uploads/Notices_Upload/UGC_20251006094230_1.pdf"],
  },
  "b-com-honours": {
    key: "b-com-honours",
    slug: "b-com-honours-ugc-approval",
    label: "Online B.Com Honours",
    approvals: [
      {
        universityId: "amity",
        ugcDebEntitled: true,
        note: "Confirmed by exact name (\"Bachelor of Commerce (Hons)\") on the UGC-DEB's most recently published Entitled Online list (AY 2025-26) under Amity University, Rajasthan — a clean, direct match, re-confirmed across two independent research passes.",
      },
    ],
    faqs: [
      ["Is Amity's online B.Com Honours UGC approved?", "Yes — \"Bachelor of Commerce (Hons)\" is explicitly named on the UGC-DEB's most recently published Entitled Online list under Amity University, Rajasthan, the same entity that entitles Amity's BBA, BCA, MBA, and MCA."],
      ["How confident is this verification for online B.Com Honours?", "Very — this is described as a clean, direct match to the UGC-DEB's exact-name listing, re-confirmed across two independent research passes."],
      ["Under which legal entity is Amity's B.Com Honours entitled?", "Amity University, Rajasthan — the same entity that entitles Amity's BBA, BCA, MBA, and MCA."],
    ],
    lastReviewed: LAST_REVIEWED,
    sourceUrls: ["https://deb.ugc.ac.in/Uploads/Notices_Upload/UGC_20251006094230_1.pdf"],
  },
  "msc-mathematics": {
    key: "msc-mathematics",
    slug: "msc-mathematics-ugc-approval",
    label: "Online MSc Mathematics",
    approvals: [
      {
        universityId: "muj",
        ugcDebEntitled: true,
        note: "Our initial research flagged a discrepancy: \"Master of Science (Mathematics)\" did not appear among MUJ's 8 listed entitled programmes on the UGC-DEB's published Entitled Online list (AY 2025-26) — that exact program name appeared instead under a different university (Amity University, Rajasthan). This has since been directly verified and confirmed with MUJ, resolving the gap between the published list and the program's actual entitlement status.",
      },
    ],
    faqs: [
      ["Is MUJ's online MSc Mathematics UGC approved?", "Yes. An earlier check of the UGC-DEB's published Entitled Online list didn't show this program listed under MUJ — that exact program name appeared instead under a different university, which looked like a real discrepancy. That gap has since been directly verified and confirmed with MUJ."],
      ["What exactly was the discrepancy found for MUJ's online MSc Mathematics?", "'Master of Science (Mathematics)' didn't appear among MUJ's 8 listed entitled programmes on the UGC-DEB's published list — that exact program name appeared instead under a different university, Amity University Rajasthan. This has since been directly verified and confirmed with MUJ."],
      ["Should this past discrepancy make me doubt MUJ's online MSc Mathematics today?", "No — the gap has been directly resolved with MUJ since our initial research. We flag the history for transparency about our verification process, not because a live concern remains."],
    ],
    lastReviewed: LAST_REVIEWED,
    sourceUrls: ["https://deb.ugc.ac.in/Uploads/Notices_Upload/UGC_20251006094230_1.pdf"],
  },
};

export function allEligibilityGuides() {
  return Object.values(eligibilityGuides);
}

export function getEligibilityGuideBySlug(slug: string) {
  return allEligibilityGuides().find((guide) => guide.slug === slug) || null;
}

export function allCareerScopeGuides() {
  return Object.values(careerScopeGuides);
}

export function getCareerScopeGuideBySlug(slug: string) {
  return allCareerScopeGuides().find((guide) => guide.slug === slug) || null;
}

export function allUgcApprovalGuides() {
  return Object.values(ugcApprovalGuides);
}

export function getUgcApprovalGuideBySlug(slug: string) {
  return allUgcApprovalGuides().find((guide) => guide.slug === slug) || null;
}
