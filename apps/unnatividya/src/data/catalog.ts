export type University = {
  id: "muj" | "smu" | "amity";
  slug: string;
  name: string;
  shortName: string;
  city: string;
  established: number;
  rating: number;
  reviews: number;
  learners: string;
  approvals: string[];
  placement: number;
  avgPackage: string;
  highestPackage: string;
  partners: number;
  feeFrom: string;
  about: string;
};

export type UniversityEnrichment = {
  overview?: string[];
  factTiles?: Array<[string, string]>;
  rankings?: Array<{ title: string; note: string }>;
  placementSupport?: string[];
  admissionSteps?: Array<{ title: string; copy: string }>;
  scholarships?: Array<[string, string, string]>;
  faqs?: Array<[string, string]>;
  sourceUrls?: string[];
};

export type Course = {
  id: string;
  slug: string;
  universityId: University["id"];
  name: string;
  shortName: string;
  level: "UG" | "PG";
  programType: "DEGREE";
  ugcApproved: true;
  stream: string;
  duration: string;
  fee: number;
  emi: string;
  rating: number;
  reviews: number;
  specializations: string[];
  eligibility: string;
  careerRoles: string[];
};

export type CourseEnrichment = {
  overview?: string;
  highlights?: Array<[string, string]>;
  sourceUrls?: string[];
  feePlans?: Array<[string, string, string]>;
  curriculum?: Array<{ term: string; subjects: string[] }>;
  scholarships?: Array<[string, string, string]>;
  faqs?: Array<[string, string]>;
  weeklyHours?: string;
  credits?: string;
  applicationFee?: string;
  lastAdmissionDate?: string;
};

export const universities: University[] = [
  {
    id: "muj",
    slug: "manipal-university-jaipur",
    name: "Manipal University Jaipur",
    shortName: "MUJ",
    city: "Jaipur, Rajasthan",
    established: 2011,
    rating: 4.7,
    reviews: 3240,
    learners: "52,000+",
    approvals: ["UGC-entitled", "NAAC A+", "AICTE", "WES recognised"],
    placement: 88,
    avgPackage: "₹7.2 LPA",
    highestPackage: "₹24 LPA",
    partners: 320,
    feeFrom: "₹75,000",
    about:
      "Manipal University Jaipur brings the Manipal education legacy to flexible online degrees with digital learning support, placement assistance, and recognised programs for working learners.",
  },
  {
    id: "smu",
    slug: "sikkim-manipal-university",
    name: "Sikkim Manipal University",
    shortName: "SMU",
    city: "Gangtok, Sikkim",
    established: 1995,
    rating: 4.5,
    reviews: 2110,
    learners: "38,000+",
    approvals: ["UGC-entitled", "NAAC A+", "AIU member"],
    placement: 81,
    avgPackage: "₹5.1 LPA",
    highestPackage: "₹15 LPA",
    partners: 210,
    feeFrom: "₹55,000",
    about:
      "Sikkim Manipal University offers affordable online UG and PG degrees with flexible schedules, learner support, and a practical path for students and working professionals.",
  },
  {
    id: "amity",
    slug: "amity-online",
    name: "Amity University Online",
    shortName: "Amity",
    city: "Noida, Uttar Pradesh",
    established: 2005,
    rating: 4.4,
    reviews: 4870,
    learners: "85,000+",
    approvals: ["UGC-entitled", "NAAC A+", "WES recognised", "QS ranked"],
    placement: 84,
    avgPackage: "₹6.5 LPA",
    highestPackage: "₹21 LPA",
    partners: 400,
    feeFrom: "₹99,000",
    about:
      "Amity Online offers UGC-entitled online degrees with flexible learning, industry-oriented curriculum, and a large alumni and learner network.",
  },
];

export const courses: Course[] = [
  {
    id: "mba-muj",
    slug: "online-mba-manipal-university-jaipur",
    universityId: "muj",
    name: "Online MBA",
    shortName: "MBA",
    level: "PG",
    programType: "DEGREE",
    ugcApproved: true,
    stream: "Management",
    duration: "24 months",
    fee: 180000,
    emi: "₹7,500/mo",
    rating: 4.7,
    reviews: 1420,
    specializations: ["Finance", "Marketing", "HRM", "Analytics & Data Science", "BFSI", "Operations"],
    eligibility: "Graduation from a recognised university. Exact criteria should be verified from source before admission.",
    careerRoles: ["Business Manager", "Marketing Manager", "Finance Analyst", "Operations Lead"],
  },
  {
    id: "mba-smu",
    slug: "online-mba-sikkim-manipal-university",
    universityId: "smu",
    name: "Online MBA",
    shortName: "MBA",
    level: "PG",
    programType: "DEGREE",
    ugcApproved: true,
    stream: "Management",
    duration: "24 months",
    fee: 120000,
    emi: "₹4,583/mo",
    rating: 4.5,
    reviews: 860,
    specializations: ["Finance", "Marketing", "HRM", "Retail Operations"],
    eligibility: "Graduation from a recognised university. Exact criteria should be verified from source before admission.",
    careerRoles: ["Team Lead", "Sales Manager", "HR Executive", "Retail Operations Manager"],
  },
  {
    id: "mba-amity",
    slug: "online-mba-amity-online",
    universityId: "amity",
    name: "Online MBA",
    shortName: "MBA",
    level: "PG",
    programType: "DEGREE",
    ugcApproved: true,
    stream: "Management",
    duration: "24 months",
    fee: 225000,
    emi: "₹9,375/mo",
    rating: 4.4,
    reviews: 2210,
    specializations: ["Finance", "Marketing", "International Business", "Business Analytics"],
    eligibility: "Graduation from a recognised university. Exact criteria should be verified from source before admission.",
    careerRoles: ["Product Manager", "Business Analyst", "Marketing Strategist", "International Business Executive"],
  },
  {
    id: "bba-muj",
    slug: "online-bba-manipal-university-jaipur",
    universityId: "muj",
    name: "Online BBA",
    shortName: "BBA",
    level: "UG",
    programType: "DEGREE",
    ugcApproved: true,
    stream: "Management",
    duration: "36 months",
    fee: 139500,
    emi: "₹3,875/mo",
    rating: 4.6,
    reviews: 640,
    specializations: ["General", "Digital Marketing"],
    eligibility: "10+2 or equivalent from a recognised board.",
    careerRoles: ["Business Associate", "Sales Executive", "Marketing Associate", "Operations Coordinator"],
  },
  {
    id: "bba-amity",
    slug: "online-bba-amity-online",
    universityId: "amity",
    name: "Online BBA",
    shortName: "BBA",
    level: "UG",
    programType: "DEGREE",
    ugcApproved: true,
    stream: "Management",
    duration: "36 months",
    fee: 199000,
    emi: "₹8,292/mo",
    rating: 4.3,
    reviews: 910,
    specializations: ["General", "Retail"],
    eligibility: "10+2 or equivalent from a recognised board.",
    careerRoles: ["Management Trainee", "Retail Associate", "Sales Executive", "Customer Success Associate"],
  },
  {
    id: "bca-muj",
    slug: "online-bca-manipal-university-jaipur",
    universityId: "muj",
    name: "Online BCA",
    shortName: "BCA",
    level: "UG",
    programType: "DEGREE",
    ugcApproved: true,
    stream: "IT & Computers",
    duration: "36 months",
    fee: 139500,
    emi: "₹3,875/mo",
    rating: 4.6,
    reviews: 730,
    specializations: ["General", "Cloud & Security"],
    eligibility: "10+2 or equivalent from a recognised board.",
    careerRoles: ["Software Developer", "Web Developer", "Cloud Support Associate", "QA Analyst"],
  },
  {
    id: "bca-amity",
    slug: "online-bca-amity-online",
    universityId: "amity",
    name: "Online BCA",
    shortName: "BCA",
    level: "UG",
    programType: "DEGREE",
    ugcApproved: true,
    stream: "IT & Computers",
    duration: "36 months",
    fee: 175000,
    emi: "₹7,292/mo",
    rating: 4.3,
    reviews: 820,
    specializations: ["General", "Data Analytics"],
    eligibility: "10+2 or equivalent from a recognised board.",
    careerRoles: ["Software Developer", "Data Analyst", "Technical Support Engineer", "Database Assistant"],
  },
  {
    id: "mca-muj",
    slug: "online-mca-manipal-university-jaipur",
    universityId: "muj",
    name: "Online MCA",
    shortName: "MCA",
    level: "PG",
    programType: "DEGREE",
    ugcApproved: true,
    stream: "IT & Computers",
    duration: "24 months",
    fee: 158000,
    emi: "₹6,583/mo",
    rating: 4.7,
    reviews: 560,
    specializations: ["Full Stack Development", "Data Science", "Cyber Security"],
    eligibility: "Graduation with relevant mathematics/computer background as per university criteria.",
    careerRoles: ["Full Stack Developer", "Data Engineer", "Cybersecurity Analyst", "Application Developer"],
  },
  {
    id: "mca-amity",
    slug: "online-mca-amity-online",
    universityId: "amity",
    name: "Online MCA",
    shortName: "MCA",
    level: "PG",
    programType: "DEGREE",
    ugcApproved: true,
    stream: "IT & Computers",
    duration: "24 months",
    fee: 199000,
    emi: "₹8,292/mo",
    rating: 4.4,
    reviews: 690,
    specializations: ["Machine Learning", "Cloud Computing"],
    eligibility: "Graduation with relevant mathematics/computer background as per university criteria.",
    careerRoles: ["Machine Learning Associate", "Cloud Engineer", "Software Engineer", "Systems Analyst"],
  },
  {
    id: "bcom-muj",
    slug: "online-bcom-manipal-university-jaipur",
    universityId: "muj",
    name: "Online B.Com",
    shortName: "B.Com",
    level: "UG",
    programType: "DEGREE",
    ugcApproved: true,
    stream: "Commerce",
    duration: "36 months",
    fee: 99000,
    emi: "₹2,750/mo",
    rating: 4.5,
    reviews: 480,
    specializations: ["General", "International Finance & Accounting"],
    eligibility: "10+2 or equivalent from a recognised board.",
    careerRoles: ["Account Executive", "Finance Associate", "Tax Assistant", "Audit Assistant"],
  },
  {
    id: "bcom-smu",
    slug: "online-bcom-sikkim-manipal-university",
    universityId: "smu",
    name: "Online B.Com",
    shortName: "B.Com",
    level: "UG",
    programType: "DEGREE",
    ugcApproved: true,
    stream: "Commerce",
    duration: "36 months",
    fee: 75000,
    emi: "₹2,083/mo",
    rating: 4.4,
    reviews: 350,
    specializations: ["General"],
    eligibility: "10+2 or equivalent from a recognised board.",
    careerRoles: ["Accounts Assistant", "Finance Executive", "Banking Associate", "Tax Associate"],
  },
  {
    id: "mcom-muj",
    slug: "online-mcom-manipal-university-jaipur",
    universityId: "muj",
    name: "Online M.Com",
    shortName: "M.Com",
    level: "PG",
    programType: "DEGREE",
    ugcApproved: true,
    stream: "Commerce",
    duration: "24 months",
    fee: 108000,
    emi: "₹4,500/mo",
    rating: 4.6,
    reviews: 290,
    specializations: ["General", "Financial Technology"],
    eligibility: "Graduation in commerce or related discipline as per university criteria.",
    careerRoles: ["Finance Manager", "Accountant", "Tax Consultant", "Fintech Associate"],
  },
  {
    id: "ba-smu",
    slug: "online-ba-sikkim-manipal-university",
    universityId: "smu",
    name: "Online BA",
    shortName: "BA",
    level: "UG",
    programType: "DEGREE",
    ugcApproved: true,
    stream: "Arts & Humanities",
    duration: "36 months",
    fee: 75000,
    emi: "₹2,083/mo",
    rating: 4.4,
    reviews: 310,
    specializations: ["English", "Political Science", "Sociology"],
    eligibility: "10+2 or equivalent from a recognised board.",
    careerRoles: ["Content Associate", "Public Policy Assistant", "Research Assistant", "Civil Services Aspirant"],
  },
  {
    id: "bba-smu",
    slug: "online-bba-sikkim-manipal-university",
    universityId: "smu",
    name: "Online BBA",
    shortName: "BBA",
    level: "UG",
    programType: "DEGREE",
    ugcApproved: true,
    stream: "Management",
    duration: "36 months",
    fee: 90000,
    emi: "₹2,500/mo",
    rating: 4.6,
    reviews: 420,
    specializations: ["Human Resource Management", "Marketing", "Finance", "Operations"],
    eligibility: "10+2 or equivalent from a recognised board.",
    careerRoles: ["Business Associate", "Sales Executive", "Marketing Associate", "Operations Coordinator"],
  },
  {
    id: "mca-smu",
    slug: "online-mca-sikkim-manipal-university",
    universityId: "smu",
    name: "Online MCA",
    shortName: "MCA",
    level: "PG",
    programType: "DEGREE",
    ugcApproved: true,
    stream: "IT & Computers",
    duration: "24 months",
    fee: 110000,
    emi: "₹4,083/mo",
    rating: 4.6,
    reviews: 410,
    specializations: ["Computer Applications", "Software Development"],
    eligibility: "Graduation with relevant mathematics/computer background as per university criteria.",
    careerRoles: ["Software Developer", "Systems Analyst", "Database Assistant", "Technical Support Engineer"],
  },
  {
    id: "mcom-smu",
    slug: "online-mcom-sikkim-manipal-university",
    universityId: "smu",
    name: "Online M.Com",
    shortName: "M.Com",
    level: "PG",
    programType: "DEGREE",
    ugcApproved: true,
    stream: "Commerce",
    duration: "24 months",
    fee: 75000,
    emi: "₹3,125/mo",
    rating: 4.4,
    reviews: 260,
    specializations: ["General", "Accounting", "Finance"],
    eligibility: "Graduation in commerce or related discipline as per university criteria.",
    careerRoles: ["Accountant", "Finance Executive", "Tax Consultant", "Banking Associate"],
  },
  {
    id: "ma-english-smu",
    slug: "online-ma-english-sikkim-manipal-university",
    universityId: "smu",
    name: "Online MA English",
    shortName: "MA English",
    level: "PG",
    programType: "DEGREE",
    ugcApproved: true,
    stream: "Arts & Humanities",
    duration: "24 months",
    fee: 75000,
    emi: "₹3,125/mo",
    rating: 4.4,
    reviews: 210,
    specializations: ["English Literature", "Language Studies"],
    eligibility: "Graduation from a recognised university.",
    careerRoles: ["Content Strategist", "Teacher", "Editor", "Research Associate"],
  },
  {
    id: "ma-political-science-smu",
    slug: "online-ma-political-science-sikkim-manipal-university",
    universityId: "smu",
    name: "Online MA Political Science",
    shortName: "MA Political Science",
    level: "PG",
    programType: "DEGREE",
    ugcApproved: true,
    stream: "Arts & Humanities",
    duration: "24 months",
    fee: 75000,
    emi: "₹3,125/mo",
    rating: 4.4,
    reviews: 190,
    specializations: ["Political Science", "Public Policy"],
    eligibility: "Graduation from a recognised university.",
    careerRoles: ["Policy Assistant", "Research Associate", "Civil Services Aspirant", "Public Affairs Associate"],
  },
  {
    id: "ma-sociology-smu",
    slug: "online-ma-sociology-sikkim-manipal-university",
    universityId: "smu",
    name: "Online MA Sociology",
    shortName: "MA Sociology",
    level: "PG",
    programType: "DEGREE",
    ugcApproved: true,
    stream: "Arts & Humanities",
    duration: "24 months",
    fee: 75000,
    emi: "₹3,125/mo",
    rating: 4.5,
    reviews: 180,
    specializations: ["Sociology", "Social Research"],
    eligibility: "Graduation from a recognised university.",
    careerRoles: ["Social Researcher", "Program Associate", "Policy Assistant", "Community Manager"],
  },
  {
    id: "ma-economics-muj",
    slug: "online-ma-economics-manipal-university-jaipur",
    universityId: "muj",
    name: "Online MA Economics",
    shortName: "MA Economics",
    level: "PG",
    programType: "DEGREE",
    ugcApproved: true,
    stream: "Arts & Humanities",
    duration: "24 months",
    fee: 80000,
    emi: "₹3,333/mo",
    rating: 4.2,
    reviews: 170,
    specializations: ["Economics", "Applied Economics"],
    eligibility: "Graduation from a recognised university.",
    careerRoles: ["Economic Analyst", "Research Associate", "Policy Assistant", "Data Analyst"],
  },
  {
    id: "majmc-muj",
    slug: "online-ma-journalism-mass-communication-manipal-university-jaipur",
    universityId: "muj",
    name: "Online MA JMC",
    shortName: "MA JMC",
    level: "PG",
    programType: "DEGREE",
    ugcApproved: true,
    stream: "Arts & Humanities",
    duration: "24 months",
    fee: 80000,
    emi: "₹3,333/mo",
    rating: 4.5,
    reviews: 220,
    specializations: ["Journalism", "Mass Communication", "Digital Media"],
    eligibility: "Graduation from a recognised university.",
    careerRoles: ["Journalist", "Content Strategist", "PR Executive", "Media Planner"],
  },
  {
    id: "bcom-amity",
    slug: "online-bcom-amity-online",
    universityId: "amity",
    name: "Online B.Com",
    shortName: "B.Com",
    level: "UG",
    programType: "DEGREE",
    ugcApproved: true,
    stream: "Commerce",
    duration: "36 months",
    fee: 115000,
    emi: "₹4,792/mo",
    rating: 4.4,
    reviews: 760,
    specializations: ["General", "Finance & Accounting"],
    eligibility: "10+2 or equivalent from a recognised board.",
    careerRoles: ["Account Executive", "Finance Associate", "Tax Assistant", "Audit Assistant"],
  },
  {
    id: "majmc-amity",
    slug: "online-ma-journalism-mass-communication-amity-online",
    universityId: "amity",
    name: "Online MA JMC",
    shortName: "MA JMC",
    level: "PG",
    programType: "DEGREE",
    ugcApproved: true,
    stream: "Arts & Humanities",
    duration: "24 months",
    fee: 130000,
    emi: "₹5,417/mo",
    rating: 4.3,
    reviews: 240,
    specializations: ["Journalism & Mass Communication"],
    eligibility: "Graduation from a recognised university.",
    careerRoles: ["Journalist", "Content Strategist", "PR Executive", "Media Planner"],
  },
];

export const universityById = Object.fromEntries(universities.map((u) => [u.id, u])) as Record<
  University["id"],
  University
>;

export const universityEnrichmentById: Partial<Record<University["id"], UniversityEnrichment>> = {
  muj: {
    overview: [
      "Manipal University Jaipur is part of the Manipal education ecosystem and offers UGC-entitled online degrees for learners who need flexible study without leaving work or family commitments.",
      "The current official Online Manipal pages highlight NAAC A+ accreditation, online proctored exams, digital learning support, placement assistance, and scholarship/EMI options for eligible learners.",
    ],
    factTiles: [
      ["Established", "2011"],
      ["Location", "Jaipur, Rajasthan"],
      ["Online learners", "52,000+"],
      ["Annual fee from", "₹75,000"],
      ["Batches", "January & July"],
      ["Exams", "Online proctored"],
    ],
    rankings: [
      { title: "UGC-entitled online degrees", note: "Online degrees equivalent to campus degrees as presented on official source pages." },
      { title: "NAAC A+ accredited", note: "Institutional accreditation highlighted across official MUJ online program pages." },
      { title: "AICTE norms compliant", note: "Shown on the official Online MBA MUJ recognition section." },
      { title: "WES recognised", note: "Credential evaluation recognition shown on official source pages." },
    ],
    placementSupport: ["Resume clinics", "Mock interviews", "Job board access", "Alumni and networking support"],
    admissionSteps: [
      { title: "Application", copy: "Fill basic, education, and work-experience details and pay the application fee." },
      { title: "Fee payment", copy: "Pay first semester/year fee or full program fee through available payment/EMI options." },
      { title: "Document upload", copy: "Upload academic documents, ID proof, and other requested records." },
      { title: "University approval", copy: "The university evaluates documents and confirms admission." },
    ],
    scholarships: [
      ["Merit / category scholarships", "Up to 20%", "Category proof and admission-cycle rules"],
      ["Defence personnel", "As applicable", "Service / dependent proof"],
      ["Differently-abled learners", "As applicable", "Valid disability certificate"],
      ["Alumni / regional categories", "As applicable", "University-defined proof"],
    ],
    faqs: [
      ["Are MUJ online degrees valid?", "MUJ online degrees listed here are maintained as UGC-entitled online degree programs. Always verify the current admission-cycle entitlement before enrolment."],
      ["Are exams online?", "Official program pages describe online learning and online proctored assessment flows. Exact exam rules can vary by program and cycle."],
      ["Does MUJ offer EMI?", "Official pages show no-cost EMI options for many programs, with terms depending on finance partner and selected payment plan."],
    ],
    sourceUrls: [
      "https://www.onlinemanipal.com/online-mba-manipal-university-jaipur",
      "https://www.onlinemanipal.com/all-courses",
    ],
  },
  smu: {
    overview: [
      "Sikkim Manipal University offers affordable online UG and PG degrees through Online Manipal, with flexible schedules and university-led learner support.",
      "Current source pages show program-wise fee plans, admission steps, online delivery, scholarship categories, and FAQ blocks for SMU online programs.",
    ],
    factTiles: [
      ["Established", "1995"],
      ["Location", "Gangtok, Sikkim"],
      ["Online learners", "38,000+"],
      ["Annual fee from", "₹55,000"],
      ["Batches", "January & July"],
      ["Exams", "Online proctored"],
    ],
    rankings: [
      { title: "UGC-entitled online degrees", note: "Source pages position listed degrees as online degree programs from SMU." },
      { title: "AIU member", note: "Institution-level recognition retained for learner comparison." },
      { title: "Scholarship support", note: "SMU pages mention scholarships for defence, differently-abled, alumni, and Northeast-region learners." },
      { title: "Affordable fee plans", note: "SMU source pages show lower full-fee and semester-fee options across multiple programs." },
    ],
    placementSupport: ["Career guidance", "Resume review", "Interview preparation", "Online learner support"],
    admissionSteps: [
      { title: "Application", copy: "Fill basic, education, and work-experience-related details and pay the application fee." },
      { title: "Fee payment", copy: "Pay first semester/year fee or full program fee." },
      { title: "Document upload", copy: "Upload supporting documents and submit the application." },
      { title: "University approval", copy: "SMU evaluates documents and confirms admission." },
    ],
    scholarships: [
      ["Defence personnel and family", "As applicable", "Service / dependent ID"],
      ["Differently-abled learners", "As applicable", "Disability certificate"],
      ["SMU alumni", "As applicable", "Previous degree/certificate"],
      ["Sikkim and Northeast learners", "As applicable", "Address/category proof"],
    ],
    faqs: [
      ["What is the SMU admission process?", "Apply, pay the selected fee plan, upload documents, and wait for university approval."],
      ["Are semester-wise fees available?", "Yes. Source pages show semester-fee payment options for SMU programs."],
      ["Who should consider SMU?", "Learners comparing affordable UGC-entitled online degrees with flexible study and admission support."],
    ],
    sourceUrls: [
      "https://www.onlinemanipal.com/online-bba-degree-smu",
      "https://www.onlinemanipal.com/all-courses",
    ],
  },
  amity: {
    overview: [
      "Amity University Online offers UGC-entitled online degrees across management, commerce, computer applications, and humanities-oriented programs.",
      "Amity's online catalog spans undergraduate and postgraduate degrees with industry-oriented curriculum, flexible online delivery, and a large alumni and learner network.",
    ],
    factTiles: [
      ["Established", "2005"],
      ["Location", "Noida, Uttar Pradesh"],
      ["Online learners", "85,000+"],
      ["Annual fee from", "₹99,000"],
      ["Batches", "January & July"],
      ["Exams", "Online proctored"],
    ],
    rankings: [
      { title: "UGC-entitled online degrees", note: "Retained for approved online-degree comparison." },
      { title: "NAAC A+ positioning", note: "Institution recognition retained from catalog seed and public positioning." },
      { title: "WES recognised", note: "Useful for learners comparing international credential use cases." },
      { title: "Broad online catalog", note: "Current source program data includes UG, PG, and certification categories." },
    ],
    placementSupport: ["Career services", "Interview preparation", "Job-readiness guidance", "Alumni network access"],
    admissionSteps: [
      { title: "Choose program", copy: "Select the online degree and check current eligibility, fee, and admission cycle." },
      { title: "Submit details", copy: "Complete the university application and upload requested documents." },
      { title: "Pay fee", copy: "Pay through the available payment option for the selected program." },
      { title: "Start learning", copy: "Receive LMS access after admission confirmation." },
    ],
    scholarships: [
      ["Merit-based admission offers", "As applicable", "Final mark sheet"],
      ["Flexible/no-cost EMI payment", "As applicable", "Finance partner approval"],
      ["Defence & alumni concessions", "As applicable", "Service ID / previous degree certificate"],
    ],
    faqs: [
      ["Which Amity programs are included?", "Only UGC-entitled Amity Online degree programs are listed here for comparison."],
      ["Can fees change?", "Yes — fees can change by admission cycle. The exact current fee is confirmed during free counselling before you apply."],
      ["Is placement support included?", "Yes — career services, interview preparation, and alumni network access are available to enrolled learners."],
    ],
    sourceUrls: [
      "https://api-otp.amityonline.com/programs",
      "https://amityonline.com/",
    ],
  },
};

function commonCourseEnrichment(course: Course): CourseEnrichment {
  const semesters = course.duration.startsWith("36") ? 6 : 4;
  const semesterFee = Math.round(course.fee / semesters);
  const university = universityById[course.universityId];
  const isPg = course.level === "PG";
  return {
    overview: `${course.name} from ${university.name} is a ${course.duration}, UGC-entitled online degree designed for ${isPg ? "graduates and working professionals" : "12th-pass learners"} who want flexible learning, online assessments, and career-focused support without relocating.`,
    highlights: [
      ["Mode", "100% online"],
      ["Duration", `${course.duration} · ${semesters} semesters`],
      ["Total fee", formatFee(course.fee)],
      ["EMI from", course.emi],
      ["Exams", "Online proctored"],
      ["Validity", "UGC-entitled"],
    ],
    feePlans: [
      ["Full payment (2% off)", formatFee(Math.round((course.fee * 0.98) / 100) * 100), "one-time"],
      ["Semester-wise", formatFee(course.fee), `${formatFee(semesterFee)} /sem`],
      ["No-cost EMI", formatFee(course.fee), course.emi],
    ],
    curriculum: curriculumByShortName[course.shortName] || curriculumByStream[course.stream] || curriculumByStream.Management,
    scholarships: universityEnrichmentById[course.universityId]?.scholarships,
    faqs: [
      ["Is this degree valid?", "UGC-entitled online degrees are equivalent to campus degrees for higher education and employment use cases, subject to current university entitlement."],
      ["Can I study while working?", "Yes. The programs are designed for online delivery with live/recorded learning support and flexible study schedules."],
      ["How are exams conducted?", "Most listed programs use online/proctored assessment flows. Exact rules are confirmed during admission."],
      ["Can fees or discounts change?", "Yes. Fees, discounts, EMI terms, and scholarship rules can change by admission cycle — your counsellor will confirm the current terms before you apply."],
    ],
    weeklyHours: "15-20 hours/week",
    credits: isPg ? "80-90 credits" : "120 credits",
    applicationFee: course.universityId === "amity" ? "As per university" : "₹500",
    lastAdmissionDate: "Check current admission cycle",
    sourceUrls: sourceUrlsByCourseId[course.id] || universityEnrichmentById[course.universityId]?.sourceUrls,
  };
}

const curriculumByStream: Record<string, Array<{ term: string; subjects: string[] }>> = {
  Management: [
    { term: "Semester 1", subjects: ["Management principles", "Business communication", "Financial accounting", "Managerial economics", "Organisational behaviour"] },
    { term: "Semester 2", subjects: ["Marketing management", "Human resource management", "Operations management", "Business research", "Financial management"] },
    { term: "Semester 3", subjects: ["Strategic management", "Elective track subjects", "Analytics / domain modules", "Project or term paper"] },
    { term: "Semester 4", subjects: ["Advanced electives", "Capstone project", "Entrepreneurship", "Industry application"] },
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

const curriculumByShortName: Record<string, Array<{ term: string; subjects: string[] }>> = {
  MBA: [
    { term: "Semester 1", subjects: ["Entrepreneurial practice", "Business communication", "Managerial economics", "Financial accounting", "Organisational behaviour", "Marketing management"] },
    { term: "Semester 2", subjects: ["Business research methods", "Operations management", "Human resource management", "Management accounting", "Financial management", "Legal aspects of business"] },
    { term: "Semester 3", subjects: ["Strategic management", "Term paper", "Elective group modules", "Digital / analytics / domain subjects"] },
    { term: "Semester 4", subjects: ["Advanced elective modules", "International business context", "Project / capstone", "Industry application"] },
  ],
};

const sourceUrlsByCourseId: Record<string, string[]> = {
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

export const courseEnrichmentById = Object.fromEntries(courses.map((course) => [course.id, commonCourseEnrichment(course)])) as Record<string, CourseEnrichment>;

// Indicative entry-to-mid career salary bands per role, since a single fixed set of numbers
// (e.g. the MBA salary band) is wrong for every non-management role on a course whose
// careerRoles don't match that shape (BCA/MCA/BCom/BA all show different, unrelated roles).
export const careerRoleSalary: Record<string, string> = {
  // Management
  "Business Manager": "₹6-11 LPA",
  "Business Analyst": "₹5-9 LPA",
  "Marketing Manager": "₹7-14 LPA",
  "Marketing Strategist": "₹6-12 LPA",
  "Finance Analyst": "₹5-10 LPA",
  "Finance Manager": "₹8-15 LPA",
  "Operations Lead": "₹8-15 LPA",
  "Operations Coordinator": "₹4-7 LPA",
  "Product Manager": "₹9-18 LPA",
  "International Business Executive": "₹6-11 LPA",
  "Team Lead": "₹6-10 LPA",
  "Sales Manager": "₹6-11 LPA",
  "Sales Executive": "₹3-6 LPA",
  "HR Executive": "₹4-7 LPA",
  "Retail Operations Manager": "₹5-9 LPA",
  "Business Associate": "₹3-6 LPA",
  "Management Trainee": "₹3-5 LPA",
  "Retail Associate": "₹2.5-4.5 LPA",
  "Customer Success Associate": "₹3-6 LPA",
  "Marketing Associate": "₹3-5 LPA",
  // IT & Computers
  "Software Developer": "₹4-10 LPA",
  "Web Developer": "₹3-8 LPA",
  "Cloud Support Associate": "₹4-8 LPA",
  "Cloud Engineer": "₹7-16 LPA",
  "QA Analyst": "₹4-8 LPA",
  "Data Analyst": "₹5-11 LPA",
  "Data Engineer": "₹6-13 LPA",
  "Technical Support Engineer": "₹3-6 LPA",
  "Database Assistant": "₹3-6 LPA",
  "Full Stack Developer": "₹6-14 LPA",
  "Cybersecurity Analyst": "₹6-13 LPA",
  "Application Developer": "₹5-11 LPA",
  "Machine Learning Associate": "₹7-15 LPA",
  "Systems Analyst": "₹5-10 LPA",
  "Software Engineer": "₹6-13 LPA",
  // Commerce
  "Account Executive": "₹3-6 LPA",
  "Finance Associate": "₹3-6 LPA",
  "Tax Assistant": "₹3-5 LPA",
  "Audit Assistant": "₹3-6 LPA",
  "Accounts Assistant": "₹2.5-5 LPA",
  "Finance Executive": "₹4-7 LPA",
  "Banking Associate": "₹3-6 LPA",
  "Tax Associate": "₹3-6 LPA",
  Accountant: "₹3-7 LPA",
  "Tax Consultant": "₹5-10 LPA",
  "Fintech Associate": "₹5-10 LPA",
  // Arts & Humanities
  "Content Associate": "₹3-6 LPA",
  "Public Policy Assistant": "₹3-6 LPA",
  "Research Assistant": "₹3-5 LPA",
  "Civil Services Aspirant": "Cadre-based pay",
  "Content Strategist": "₹5-10 LPA",
  Teacher: "₹3-7 LPA",
  Editor: "₹4-8 LPA",
  "Research Associate": "₹3-6 LPA",
  "Social Researcher": "₹3-6 LPA",
  "Program Associate": "₹3-6 LPA",
  "Community Manager": "₹4-7 LPA",
  "Policy Assistant": "₹3-6 LPA",
  "Economic Analyst": "₹5-10 LPA",
  Journalist: "₹3-7 LPA",
  "PR Executive": "₹3-6 LPA",
  "Media Planner": "₹4-8 LPA",
  "Public Affairs Associate": "₹3-6 LPA",
};

export function formatFee(value: number) {
  return `₹${value.toLocaleString("en-IN")}`;
}

export function courseWithUniversity(course: Course) {
  return {
    ...course,
    ...(courseEnrichmentById[course.id] || {}),
    university: universityById[course.universityId],
  };
}

export function getCourseBySlug(slug: string) {
  const course = courses.find((item) => item.slug === slug || item.id === slug);
  return course ? courseWithUniversity(course) : null;
}

export function getUniversityBySlug(slug: string) {
  return universities.find((item) => item.slug === slug || item.id === slug) || null;
}
