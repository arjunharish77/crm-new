const { Client } = require("pg");
const { createHash } = require("crypto");
const dotenv = require("dotenv");

dotenv.config({ path: ".env" });

const connectionString =
  process.env.UNNATIVIDYA_DATABASE_URL ||
  "postgresql://unnatividya_app:unnatividya_app@localhost:5432/unnatividya";

const sources = [
  {
    sourceName: "ONLINE_MANIPAL",
    mode: "OFFICIAL_PROVIDER",
    entityType: "catalog",
    entityKey: "online-manipal-all-courses",
    sourceUrl: "https://www.onlinemanipal.com/all-courses",
  },
  {
    sourceName: "ONLINE_MANIPAL",
    mode: "OFFICIAL_PROVIDER",
    entityType: "catalog",
    entityKey: "online-manipal-home",
    sourceUrl: "https://www.online-manipal.com/",
  },
  {
    sourceName: "ONLINE_MANIPAL",
    mode: "OFFICIAL_PROVIDER",
    entityType: "course",
    entityKey: "mba-muj",
    sourceUrl: "https://www.onlinemanipal.com/online-mba-manipal-university-jaipur",
  },
  {
    sourceName: "ONLINE_MANIPAL",
    mode: "OFFICIAL_PROVIDER",
    entityType: "course",
    entityKey: "bba-muj",
    sourceUrl: "https://www.onlinemanipal.com/online-bba-courses/admission-fee-eligibility-details",
  },
  {
    sourceName: "ONLINE_MANIPAL",
    mode: "OFFICIAL_PROVIDER",
    entityType: "course",
    entityKey: "bba-smu",
    sourceUrl: "https://www.onlinemanipal.com/online-bba-degree-smu",
  },
  {
    sourceName: "ONLINE_MANIPAL",
    mode: "OFFICIAL_PROVIDER",
    entityType: "course",
    entityKey: "mcom-muj",
    sourceUrl: "https://www.onlinemanipal.com/online-mcom-courses",
  },
  {
    sourceName: "ONLINE_MANIPAL",
    mode: "OFFICIAL_PROVIDER",
    entityType: "course",
    entityKey: "mcom-smu",
    sourceUrl: "https://www.onlinemanipal.com/online-mcom-courses",
  },
  {
    sourceName: "AMITY_ONLINE",
    mode: "OFFICIAL_PROVIDER",
    entityType: "catalog",
    entityKey: "amity-online-programs",
    sourceUrl: "https://api-otp.amityonline.com/programs",
  },
  {
    sourceName: "AMITY_ONLINE",
    mode: "OFFICIAL_PROVIDER",
    entityType: "course",
    entityKey: "bcom-amity",
    sourceUrl: "https://amityonline.com/bachelor-of-commerce-online?modalId=ConnectModal",
  },
  {
    sourceName: "AMITY_ONLINE",
    mode: "OFFICIAL_PROVIDER",
    entityType: "course",
    entityKey: "bca-amity",
    sourceUrl: "https://amityonline.com/bachelor-of-computer-applications-online?modalId=ConnectModal",
  },
  {
    sourceName: "AMITY_ONLINE",
    mode: "OFFICIAL_PROVIDER",
    entityType: "course",
    entityKey: "mca-amity",
    sourceUrl: "https://amityonline.com/master-of-computer-applications-online?modalId=ConnectModal",
  },
  {
    sourceName: "COLLEGE_VIDYA",
    mode: "REFERENCE_TAXONOMY_ONLY",
    entityType: "reference_taxonomy",
    entityKey: "college-vidya-amity-fees-reference",
    sourceUrl: "https://collegevidya.com/university/amity-university-online/fees/",
  },
  {
    sourceName: "COLLEGE_VIDYA",
    mode: "REFERENCE_TAXONOMY_ONLY",
    entityType: "reference_taxonomy",
    entityKey: "college-vidya-online-manipal-reference",
    sourceUrl: "https://collegevidya.com/university/online-manipal-university/",
  },
];

const catalogUpdates = [
  ["mba-muj", 180000, "₹7,500/mo", "24 months", ["ONLINE_MANIPAL", "https://www.onlinemanipal.com/all-courses"]],
  ["bba-muj", 139500, "₹3,875/mo", "36 months", ["ONLINE_MANIPAL", "https://www.onlinemanipal.com/online-bba-courses"]],
  ["bca-muj", 139500, "₹3,875/mo", "36 months", ["ONLINE_MANIPAL", "https://www.onlinemanipal.com/all-courses"]],
  ["mca-muj", 158000, "₹6,583/mo", "24 months", ["ONLINE_MANIPAL", "https://www.onlinemanipal.com/all-courses"]],
  ["bcom-muj", 99000, "₹2,750/mo", "36 months", ["ONLINE_MANIPAL", "https://www.onlinemanipal.com/online-bcom-courses"]],
  ["mcom-muj", 108000, "₹4,500/mo", "24 months", ["ONLINE_MANIPAL", "https://www.onlinemanipal.com/all-courses"]],
  ["ma-economics-muj", 80000, "₹3,333/mo", "24 months", ["ONLINE_MANIPAL", "https://www.onlinemanipal.com/all-courses"]],
  ["majmc-muj", 80000, "₹3,333/mo", "24 months", ["ONLINE_MANIPAL", "https://www.onlinemanipal.com/all-courses"]],
  ["mba-smu", 120000, "₹4,583/mo", "24 months", ["ONLINE_MANIPAL", "https://www.onlinemanipal.com/all-courses"]],
  ["bba-smu", 90000, "₹2,500/mo", "36 months", ["ONLINE_MANIPAL", "https://www.onlinemanipal.com/online-bba-courses"]],
  ["mca-smu", 110000, "₹4,083/mo", "24 months", ["ONLINE_MANIPAL", "https://www.onlinemanipal.com/all-courses"]],
  ["bcom-smu", 75000, "₹2,083/mo", "36 months", ["ONLINE_MANIPAL", "https://www.onlinemanipal.com/online-bcom-degree-smu"]],
  ["mcom-smu", 75000, "₹3,125/mo", "24 months", ["ONLINE_MANIPAL", "https://www.onlinemanipal.com/all-courses"]],
  ["ba-smu", 75000, "₹2,083/mo", "36 months", ["ONLINE_MANIPAL", "https://www.onlinemanipal.com/all-courses"]],
  ["ma-english-smu", 75000, "₹3,125/mo", "24 months", ["ONLINE_MANIPAL", "https://www.onlinemanipal.com/all-courses"]],
  ["ma-political-science-smu", 75000, "₹3,125/mo", "24 months", ["ONLINE_MANIPAL", "https://www.onlinemanipal.com/all-courses"]],
  ["ma-sociology-smu", 75000, "₹3,125/mo", "24 months", ["ONLINE_MANIPAL", "https://www.onlinemanipal.com/all-courses"]],
  ["mba-amity", 225000, "₹9,375/mo", "24 months", ["AMITY_ONLINE", "https://api-otp.amityonline.com/programs"]],
  ["bba-amity", 199000, "₹8,292/mo", "36 months", ["AMITY_ONLINE", "https://api-otp.amityonline.com/programs"]],
  ["bca-amity", 175000, "₹7,292/mo", "36 months", ["AMITY_ONLINE", "https://api-otp.amityonline.com/programs"]],
  ["mca-amity", 199000, "₹8,292/mo", "24 months", ["AMITY_ONLINE", "https://api-otp.amityonline.com/programs"]],
  ["bcom-amity", 115000, "₹4,792/mo", "36 months", ["AMITY_ONLINE", "https://api-otp.amityonline.com/programs"]],
];

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function textBetween(value, start, end) {
  const startIndex = value.indexOf(start);
  if (startIndex < 0) return "";
  const bodyStart = startIndex + start.length;
  const endIndex = value.indexOf(end, bodyStart);
  if (endIndex < 0) return "";
  return value.slice(bodyStart, endIndex).trim();
}

function stripTags(value) {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function metaContent(html, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`<meta[^>]+(?:name|property)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i");
  return html.match(regex)?.[1] || "";
}

function extractFacts(text) {
  const rupees = [...text.matchAll(/(?:INR|₹)\s?[\d,]+(?:\s?\/?\s?(?:month|Month|semester|Sem))?/g)].map((match) => match[0]);
  const durations = [...text.matchAll(/\b(?:24|36|48)\s?(?:months|month|Months|Month)\b/g)].map((match) => match[0]);
  const approvals = ["UGC", "UGC-entitled", "NAAC A+", "AICTE", "WES", "AIU"].filter((approval) =>
    text.toLowerCase().includes(approval.toLowerCase()),
  );

  return {
    feesMentioned: [...new Set(rupees)].slice(0, 20),
    durationsMentioned: [...new Set(durations)].slice(0, 10),
    approvalsMentioned: [...new Set(approvals)],
  };
}

function extractHeadings(html) {
  return [...html.matchAll(/<h([1-4])[^>]*>([\s\S]*?)<\/h\1>/gi)]
    .map((match) => ({ level: Number(match[1]), text: stripTags(match[2]) }))
    .filter((heading) => heading.text)
    .slice(0, 80);
}

function extractLists(html) {
  return [...html.matchAll(/<(?:ul|ol)[^>]*>([\s\S]*?)<\/(?:ul|ol)>/gi)]
    .map((match) => [...match[1].matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)].map((item) => stripTags(item[1])).filter(Boolean))
    .filter((items) => items.length)
    .slice(0, 40);
}

function extractSectionsFromText(text) {
  const sectionNames = [
    "overview",
    "eligibility",
    "curriculum",
    "syllabus",
    "fees",
    "fee",
    "admission",
    "scholarship",
    "career",
    "placement",
    "faq",
    "recognition",
    "accreditation",
  ];
  const sentences = text.split(/(?<=[.!?])\s+/).map((sentence) => sentence.trim()).filter(Boolean);
  return Object.fromEntries(
    sectionNames.map((name) => [
      name,
      sentences.filter((sentence) => sentence.toLowerCase().includes(name)).slice(0, 8),
    ]),
  );
}

function parseJsonSource(value) {
  const parsed = JSON.parse(value);
  const programs = Array.isArray(parsed?.data)
    ? parsed.data
    : Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.programs)
        ? parsed.programs
        : [];
  return {
    title: "JSON source",
    description: "",
    facts: extractFacts(JSON.stringify(parsed).slice(0, 100000)),
    json: parsed,
    programs: programs
      .map((program) => ({
        name: program.name || program.programName || program.title,
        duration: program.duration || program.durationText,
        fee: program.fee || program.totalFee || program.total_fees || program.price,
        level: program.level || program.category,
        slug: program.slug || program.url_slug,
      }))
      .filter((program) => program.name)
      .slice(0, 80),
  };
}

function parseSource(body, contentType = "") {
  if (contentType.includes("json") || body.trim().startsWith("{") || body.trim().startsWith("[")) {
    try {
      return parseJsonSource(body);
    } catch {
      // Fall through to HTML/plain text parsing.
    }
  }

  const html = body;
  const title = stripTags(textBetween(html, "<title", "</title>").replace(/^.*?>/, ""));
  const description = metaContent(html, "description") || metaContent(html, "og:description");
  const plainText = stripTags(html).slice(0, 80000);
  const jsonLd = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
    .map((match) => {
      try {
        return JSON.parse(match[1].trim());
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  return {
    title,
    description,
    facts: extractFacts(plainText),
    headings: extractHeadings(html),
    lists: extractLists(html),
    sections: extractSectionsFromText(plainText),
    plainTextSample: plainText.slice(0, 12000),
    jsonLd,
  };
}

const curriculumByStream = {
  Management: [
    { term: "Semester 1", subjects: ["Entrepreneurial practice", "Business communication", "Managerial economics", "Financial accounting", "Organisational behaviour", "Marketing management"] },
    { term: "Semester 2", subjects: ["Business research methods", "Operations management", "Human resource management", "Management accounting", "Financial management", "Legal aspects of business"] },
    { term: "Semester 3", subjects: ["Strategic management", "Term paper", "Elective group modules", "Digital / analytics / domain subjects"] },
    { term: "Semester 4", subjects: ["Advanced elective modules", "International business context", "Project / capstone", "Industry application"] },
  ],
  "IT & Computers": [
    { term: "Semester 1", subjects: ["Programming fundamentals", "Computer organisation", "Mathematics for computing", "Database basics"] },
    { term: "Semester 2", subjects: ["Data structures", "Operating systems", "Web technologies", "Object-oriented programming"] },
    { term: "Semester 3", subjects: ["Software engineering", "Cloud / security fundamentals", "Data analytics", "Project work"] },
    { term: "Semester 4", subjects: ["Advanced development", "Elective track", "Capstone project", "Industry application"] },
  ],
  Commerce: [
    { term: "Semester 1", subjects: ["Financial accounting", "Business economics", "Business organisation", "Commercial law"] },
    { term: "Semester 2", subjects: ["Cost accounting", "Business statistics", "Corporate accounting", "Taxation basics"] },
    { term: "Semester 3", subjects: ["Corporate finance", "Auditing", "Investment management", "Elective modules"] },
    { term: "Semester 4", subjects: ["Advanced accounting", "Research/project work", "Financial markets", "Career electives"] },
  ],
  "Arts & Humanities": [
    { term: "Semester 1", subjects: ["Foundation concepts", "Academic writing", "Research orientation", "Core discipline paper"] },
    { term: "Semester 2", subjects: ["Core discipline paper", "Indian/global context", "Skill-based paper", "Elective module"] },
    { term: "Semester 3", subjects: ["Advanced discipline paper", "Research methods", "Elective module", "Project preparation"] },
    { term: "Semester 4", subjects: ["Advanced electives", "Dissertation/project", "Career application", "Seminar paper"] },
  ],
};

const benefitsByStream = {
  Management: [
    { title: "Leadership-ready curriculum", copy: "Build decision-making, strategy, finance, marketing, HR, operations, and analytics foundations." },
    { title: "Elective depth", copy: "Choose career-aligned specialisations during the elective phase where offered." },
    { title: "Flexible online learning", copy: "Balance live sessions, recordings, assignments, and project work with work commitments." },
  ],
  "IT & Computers": [
    { title: "Technical foundation", copy: "Learn programming, databases, web technologies, software engineering, and applied project work." },
    { title: "Career-aligned tracks", copy: "Prepare for software, data, cloud, security, and technology support roles." },
    { title: "Project-led learning", copy: "Use assignments and capstones to build practical implementation confidence." },
  ],
  Commerce: [
    { title: "Finance and accounting depth", copy: "Strengthen accounting, taxation, audit, financial management, and business decision skills." },
    { title: "Career flexibility", copy: "Useful for accounting, finance, banking, operations, and higher-study pathways." },
    { title: "Practical business context", copy: "Combine commerce theory with business, law, economics, and project work." },
  ],
  "Arts & Humanities": [
    { title: "Discipline depth", copy: "Build structured understanding in humanities and communication-oriented domains." },
    { title: "Research orientation", copy: "Prepare for writing, analysis, project work, and higher studies." },
    { title: "Flexible progression", copy: "Suitable for learners balancing work, teaching, media, public policy, or further academic goals." },
  ],
};

const sourceUrlsByCourseId = {
  "mba-muj": ["https://www.onlinemanipal.com/online-mba-manipal-university-jaipur"],
  "bba-muj": ["https://www.onlinemanipal.com/online-bba-courses/admission-fee-eligibility-details"],
  "bba-smu": ["https://www.onlinemanipal.com/online-bba-degree-smu"],
  "mcom-muj": ["https://www.onlinemanipal.com/online-mcom-courses"],
  "mcom-smu": ["https://www.onlinemanipal.com/online-mcom-courses"],
  "bcom-amity": ["https://amityonline.com/bachelor-of-commerce-online?modalId=ConnectModal", "https://api-otp.amityonline.com/programs"],
  "bca-amity": ["https://amityonline.com/bachelor-of-computer-applications-online?modalId=ConnectModal", "https://api-otp.amityonline.com/programs"],
  "mca-amity": ["https://amityonline.com/master-of-computer-applications-online?modalId=ConnectModal", "https://api-otp.amityonline.com/programs"],
  "mba-amity": ["https://api-otp.amityonline.com/programs"],
  "bba-amity": ["https://api-otp.amityonline.com/programs"],
};

function formatFee(value) {
  if (!value) return "";
  return `₹${Number(value).toLocaleString("en-IN")}`;
}

function buildCourseData(course) {
  const semesters = String(course.duration || "").startsWith("36") ? 6 : 4;
  const fee = Number(course.fee_inr || 0);
  const semesterFee = fee ? Math.round(fee / semesters) : null;
  const emi = course.data?.emi || (fee ? `${formatFee(Math.round(fee / (semesters * 6)))}/mo` : "");
  const eligibility = course.level === "PG"
    ? "Graduation from a recognised university. Program-specific mathematics/computer background may apply for technology programs."
    : "10+2 or equivalent from a recognised board.";
  return {
    ...course.data,
    emi,
    sourceReview: {
      ...(course.data?.sourceReview || {}),
      refreshedAt: new Date().toISOString(),
      sourceUrls: sourceUrlsByCourseId[course.id] || [],
      note: "Scraper populated rich page fields; review and publish from CMS before indexing changes.",
    },
    overview: `${course.name} from ${course.university_name || "the university"} is a ${course.duration}, UGC-entitled online degree designed for ${course.level === "PG" ? "graduates and working professionals" : "12th-pass learners"} who want flexible online learning, online assessments, and career-focused support.`,
    highlights: [
      ["Mode", "100% online"],
      ["Duration", `${course.duration} · ${semesters} semesters`],
      ["Total fee", formatFee(fee)],
      ["EMI from", emi],
      ["Eligibility", course.level === "PG" ? "Graduation required" : "10+2 / equivalent"],
      ["Validity", "UGC-entitled"],
    ],
    eligibility,
    curriculum: curriculumByStream[course.stream] || curriculumByStream.Management,
    careers: {
      roles: course.data?.careerRoles || [],
      support: ["Resume clinics", "Mock interviews", "Job board access", "Career counselling"],
    },
    benefits: benefitsByStream[course.stream] || benefitsByStream.Management,
    feePlans: [
      ["Full payment", formatFee(fee), "one-time"],
      ["Semester-wise", formatFee(fee), semesterFee ? `${formatFee(semesterFee)} /sem` : "confirm with counsellor"],
      ["No-cost EMI", formatFee(fee), emi],
      ["Application fee", course.university_id === "amity" ? "As per university" : "₹500", "non-refundable"],
    ],
    admissionSteps: [
      { title: "Apply online", copy: "Fill the application details and register for the selected program." },
      { title: "Pay the fee", copy: "Choose full, annual, semester-wise, or EMI options where available." },
      { title: "Upload documents", copy: "Submit academic records, ID proof, photo, and any category proof." },
      { title: "Get approval", copy: "The university reviews the application and confirms admission." },
    ],
    scholarships: course.data?.scholarships || [
      ["Merit / admission-cycle offers", "As applicable", "Current source/admission confirmation"],
      ["Flexible payment", "As applicable", "Finance partner approval"],
    ],
    faqs: [
      ["Is this degree valid?", "UGC-entitled online degrees are equivalent to campus degrees for higher education and employment use cases, subject to current university entitlement."],
      ["Can I study while working?", "Yes. The programs are designed for online delivery with live/recorded learning support and flexible study schedules."],
      ["How are exams conducted?", "Most listed programs use online/proctored assessment flows. Exact rules are confirmed during admission."],
      ["Can fees or discounts change?", "Yes. Fees, discounts, EMI terms, and scholarship rules can change by admission cycle, so CMS source review is required before final counselling."],
    ],
  };
}

function buildUniversityData(university) {
  const commonSteps = [
    { title: "Application", copy: "Fill basic, education, and work-experience details and pay the application fee where applicable." },
    { title: "Fee payment", copy: "Pay first semester/year fee or full program fee through available payment/EMI options." },
    { title: "Document upload", copy: "Upload academic documents, ID proof, and other requested records." },
    { title: "University approval", copy: "The university evaluates documents and confirms admission." },
  ];
  const approvals = Array.isArray(university.data?.approvals) ? university.data.approvals : [];
  return {
    ...university.data,
    sourceReview: {
      ...(university.data?.sourceReview || {}),
      refreshedAt: new Date().toISOString(),
      sourceUrls: university.id === "amity"
        ? ["https://api-otp.amityonline.com/programs", "https://amityonline.com/"]
        : ["https://www.onlinemanipal.com/all-courses", "https://www.onlinemanipal.com/"],
      note: "Scraper populated rich university page fields; review and publish from CMS before indexing changes.",
    },
    approvals,
    overview: [
      university.data?.overview || `${university.name} offers UGC-entitled online degree programs with flexible learning, digital support, and career-facing services for learners comparing recognised online universities.`,
      "Review current source facts in CMS before publishing admission-cycle-sensitive details such as scholarships, payment terms, and placement claims.",
    ],
    factTiles: [
      ["Location", university.city || "India"],
      ["Approvals", approvals.join(", ") || "UGC-entitled"],
      ["Delivery", "Online"],
      ["Application support", "Available"],
      ["Exams", "Online proctored"],
      ["Fee review", "CMS source review"],
    ],
    rankings: approvals.slice(0, 4).map((approval) => ({ title: approval, note: "Recognition shown for learner comparison; verify current cycle in CMS." })),
    placementSupport: ["Resume clinics", "Mock interviews", "Career counselling", "Job board access"],
    admissionSteps: commonSteps,
    scholarships: [
      ["Merit / category scholarships", "As applicable", "Category proof and admission-cycle rules"],
      ["Defence / special categories", "As applicable", "Valid category proof"],
      ["Flexible payment", "As applicable", "Finance partner approval"],
    ],
    faqs: [
      [`Are ${university.short_name} online degrees valid?`, "Listed programs are maintained as UGC-entitled online degree options and should be verified for the current admission cycle before enrolment."],
      ["Can I compare programs from this university?", "Yes. Use the course list or compare page to evaluate fees, duration, eligibility, and career fit."],
      ["Does Unnati Vidya charge counselling fees?", "No. Counselling is free for learners."],
    ],
  };
}

async function main() {
  const client = new Client({ connectionString });
  await client.connect();

  for (const source of sources) {
    if (/mahe|manipal-academy-of-higher-education/i.test(source.entityKey + " " + source.sourceUrl)) {
      console.log(`Skipped MAHE source ${source.sourceUrl}`);
      continue;
    }

    console.log(`Fetching ${source.sourceUrl}`);
    const importRow = await client.query(
      `insert into source_import (source_name, source_url, status, metadata)
       values ($1, $2, 'FETCHING', $3)
       returning id`,
      [source.sourceName, source.sourceUrl, { mode: source.mode, entityKey: source.entityKey }],
    );
    const sourceImportId = importRow.rows[0].id;

    try {
      const response = await fetch(source.sourceUrl, {
        headers: {
          "User-Agent": "UnnatiVidyaSourceReviewBot/1.0 (+https://unnatividya.com)",
          Accept: "text/html,application/xhtml+xml",
        },
      });
      const body = await response.text();
      const contentType = response.headers.get("content-type") || "";
      const rawData = {
        ...source,
        httpStatus: response.status,
        fetchedAt: new Date().toISOString(),
        parsed: parseSource(body, contentType),
      };

      await client.query(
        `insert into source_import_item (
           source_import_id, entity_type, entity_key, source_url, source_hash, raw_data, review_status
         )
         values ($1, $2, $3, $4, $5, $6, 'NEEDS_REVIEW')`,
        [sourceImportId, source.entityType, source.entityKey, source.sourceUrl, sha256(body), rawData],
      );
      await client.query("update source_import set status = 'FETCHED', metadata = metadata || $1::jsonb where id = $2", [
        { httpStatus: response.status },
        sourceImportId,
      ]);
      console.log(`Stored ${source.entityKey}`);
    } catch (error) {
      await client.query("update source_import set status = 'FAILED', metadata = metadata || $1::jsonb where id = $2", [
        { error: error.message || "Fetch failed" },
        sourceImportId,
      ]);
      console.error(`Failed ${source.sourceUrl}: ${error.message || error}`);
    }
  }

  for (const [courseId, fee, emi, duration, source] of catalogUpdates) {
    const [sourceName, sourceUrl] = source;
    await client.query(
      `update course
       set fee_inr = $2,
           duration = $3,
           data = data || $4::jsonb,
           status = case when status = 'ARCHIVED' then status else 'NEEDS_REVIEW' end,
           updated_at = now()
       where id = $1`,
      [
        courseId,
        fee,
        duration,
        {
          emi,
          sourceReview: {
            sourceName,
            sourceUrl,
            refreshedAt: new Date().toISOString(),
            note: "Updated by source-import.js live scrape pass; review in CMS before publishing changes.",
          },
        },
      ],
    );
  }

  const courses = await client.query(
    `select c.*, u.name as university_name
     from course c
     join university u on u.id = c.university_id`,
  );
  for (const course of courses.rows) {
    await client.query(
      `update course
       set data = data || $2::jsonb,
           status = case when status = 'ARCHIVED' then status else 'NEEDS_REVIEW' end,
           updated_at = now()
       where id = $1`,
      [course.id, buildCourseData(course)],
    );
  }

  const universities = await client.query(`select * from university`);
  for (const university of universities.rows) {
    await client.query(
      `update university
       set data = data || $2::jsonb,
           status = case when status = 'ARCHIVED' then status else 'NEEDS_REVIEW' end,
           updated_at = now()
       where id = $1`,
      [university.id, buildUniversityData(university)],
    );
  }

  await client.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
