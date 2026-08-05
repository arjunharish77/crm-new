export type BlogBlock =
  | { type: "p"; text: string }
  | { type: "h2"; text: string }
  | { type: "note"; text: string }
  | { type: "image"; src: string; alt: string };

export type BlogPost = {
  slug: string;
  title: string;
  category: "Validity" | "Fees & EMI" | "Careers" | "Admissions";
  read: string;
  excerpt: string;
  cover: string;
  publishedDate: string;
  body: BlogBlock[];
};

export const blogPosts: BlogPost[] = [
  {
    slug: "ugc-approved-online-degree-guide",
    title: "Are online degrees valid for government jobs in 2026?",
    category: "Validity",
    read: "6 min read",
    excerpt: "The UGC entitlement rules, what equivalent to on-campus legally means, and the one document to check before enrolling.",
    cover: "/blog/ugc-approved-online-degree-guide.webp",
    publishedDate: "2026-07-14",
    body: [
      { type: "p", text: "Short answer: yes, if the degree is UGC-entitled for that program and academic year. Before applying, verify the university, program, fees, refund policy, and delivery model from official source pages." },
      { type: "h2", text: "The one check that matters" },
      { type: "p", text: "Confirm the university is entitled to offer the specific program online for the current admission cycle. Entitlement is per-program, so a university can be approved for one program and not another." },
      { type: "note", text: "Unnati Vidya tip: compare approval, fees, eligibility, specialisations, and refund rules together before choosing a program." },
      { type: "image", src: "/blog/ugc-approved-online-degree-guide.webp", alt: "Online class" },
      { type: "h2", text: "What to compare before admission" },
      { type: "p", text: "Compare total fee, semester-wise payment, EMI options, eligibility, specialisations, LMS support, exam mode, placement assistance, and refund rules. A low headline fee is useful only when all mandatory charges are visible." },
      { type: "h2", text: "Where learners get stuck" },
      { type: "p", text: "Most confusion comes from expired approvals, unclear fee breakup, missing specialisation details, and counsellors pushing one university without comparing alternatives." },
    ],
  },
  {
    slug: "online-mba-guide",
    title: "Online MBA under ₹1 lakh: real options compared",
    category: "Fees & EMI",
    read: "8 min read",
    excerpt: "Three UGC-entitled MBAs under a lakh, their hidden costs, and when paying more actually pays back.",
    cover: "/blog/online-mba-guide.webp",
    publishedDate: "2026-07-14",
    body: [
      { type: "p", text: "A low headline fee only tells part of the story. Before picking the cheapest online MBA, check what the total fee actually includes: application charges, exam fees, specialisation electives, and whether the semester-wise or EMI plan carries any processing cost." },
      { type: "h2", text: "What actually varies between universities" },
      { type: "p", text: "Beyond the total fee, look at accreditation (NAAC, AICTE), placement assistance rate, average and highest package, hiring partner count, and how many specialisation tracks are genuinely available rather than listed but rarely offered." },
      { type: "note", text: "Unnati Vidya tip: use the compare tool to place fee, EMI, placement rate, and specialisations for up to three MBA programs side by side before you decide." },
      { type: "h2", text: "When paying more is worth it" },
      { type: "p", text: "A higher fee can pay back faster when it comes with a materially stronger placement network, a specialisation directly aligned to your target role, or international recognition (like WES evaluation) that a cheaper option doesn't carry." },
      { type: "h2", text: "Before you enrol" },
      { type: "p", text: "Get the current fee, EMI terms, and scholarship eligibility confirmed directly with a counsellor — fee structures and scholarship rules can change by admission cycle." },
    ],
  },
  {
    slug: "mca-vs-mba-it-careers",
    title: "MCA vs MBA in IT: which switch pays better?",
    category: "Careers",
    read: "7 min read",
    excerpt: "How recruiters read each degree, typical role trajectories, and how to decide based on where you already are.",
    cover: "/blog/mca-vs-mba-it-careers.webp",
    publishedDate: "2026-07-14",
    body: [
      { type: "p", text: "If you're already working in or adjacent to IT, the choice between an online MCA and an online MBA usually comes down to whether you want to go deeper technically or move toward management." },
      { type: "h2", text: "Online MCA: go deeper technical" },
      { type: "p", text: "An MCA strengthens your standing for developer, data, cloud, and systems-analyst roles, and is the more direct path if your goal is a technical specialisation like full-stack development, data science, or cybersecurity." },
      { type: "h2", text: "Online MBA: move toward management" },
      { type: "p", text: "An MBA (especially with a technology or analytics specialisation) is the stronger fit if your goal is to move from an individual contributor role into product, business analysis, or people-management tracks within a tech organisation." },
      { type: "note", text: "Unnati Vidya tip: your counsellor can map your current role and target role against both degrees before you commit to either." },
      { type: "h2", text: "A simple way to decide" },
      { type: "p", text: "If you enjoy building and want to keep building, MCA. If you enjoy building but want to eventually decide what gets built and for whom, MBA." },
    ],
  },
  {
    slug: "online-admission-documents-checklist",
    title: "Documents checklist for online university admission",
    category: "Admissions",
    read: "4 min read",
    excerpt: "Everything from mark sheets to bank statements for education loans — with common rejection reasons.",
    cover: "/blog/online-admission-documents-checklist.webp",
    publishedDate: "2026-07-14",
    body: [
      { type: "p", text: "Most admission delays come down to incomplete or unclear documents, not eligibility problems. Keep clear scanned copies of everything below before you start your application." },
      { type: "h2", text: "Core documents" },
      { type: "p", text: "Mark sheets and certificates for your qualifying degree, a government photo ID, a passport-size photo, and proof of any category (defence, differently-abled, alumni) you intend to claim a scholarship against." },
      { type: "h2", text: "If you're financing with a loan" },
      { type: "p", text: "Education loan applications typically need recent salary slips or income proof, bank statements, and PAN details. Getting these ready early avoids delays right before a semester's fee deadline." },
      { type: "note", text: "Unnati Vidya tip: send your documents to a counsellor for a free pre-check — most rejections come from blurry scans, name mismatches across documents, or missing category proof." },
      { type: "h2", text: "Common rejection reasons" },
      { type: "p", text: "Name or date-of-birth mismatches between your ID and academic certificates, illegible scans, and missing final-year mark sheets are the most common reasons an application gets sent back for correction." },
    ],
  },
  {
    slug: "wes-evaluation-online-degrees",
    title: "WES evaluation of Indian online degrees, explained",
    category: "Validity",
    read: "5 min read",
    excerpt: "How Manipal and Amity online degrees are assessed for jobs and masters programs abroad.",
    cover: "/blog/wes-evaluation-online-degrees.webp",
    publishedDate: "2026-07-14",
    body: [
      { type: "p", text: "World Education Services (WES) is a credential evaluation body used by employers, universities, and immigration authorities in countries like Canada and the US to assess whether a foreign degree is comparable to a local one." },
      { type: "h2", text: "Why WES recognition matters for online degrees" },
      { type: "p", text: "For an online degree, WES recognition signals that the credential is evaluated on the same basis as an on-campus degree from that university — useful if you're planning to study or work abroad after graduating." },
      { type: "h2", text: "What to check before you rely on it" },
      { type: "p", text: "WES recognition is usually granted at the university level, but the exact evaluation outcome can still depend on the specific program and admission cycle. Always confirm current WES status for your exact program before making an abroad-study or immigration decision around it." },
      { type: "note", text: "Unnati Vidya tip: ask your counsellor for the university's current WES status documentation before you rely on it for an abroad application." },
      { type: "h2", text: "Bottom line" },
      { type: "p", text: "WES recognition is a genuine credibility signal, but treat it as a starting point to verify — not a substitute for checking your specific program's current status." },
    ],
  },
  {
    slug: "studying-while-working-fulltime",
    title: "Studying while working full-time: a realistic schedule",
    category: "Careers",
    read: "6 min read",
    excerpt: "A week-by-week approach to finishing an online PG degree without taking a career break.",
    cover: "/blog/studying-while-working-fulltime.webp",
    publishedDate: "2026-07-14",
    body: [
      { type: "p", text: "Online PG programs are built around working professionals — live sessions are typically on weekends, with recorded lectures available anytime for the rest of the week." },
      { type: "h2", text: "A realistic weekly rhythm" },
      { type: "p", text: "Most learners block 1-2 hours on 3-4 weekday evenings for recorded lectures and assignments, and reserve weekend live sessions for doubt-clearing and group work. Treating it like a recurring calendar commitment, not an occasional catch-up task, is what makes it sustainable over 2-3 years." },
      { type: "h2", text: "What trips people up" },
      { type: "p", text: "Falling behind in the first month is the most common failure pattern — recorded content stacks up quickly. Starting each week's material within a day or two of it being posted keeps the workload manageable." },
      { type: "note", text: "Unnati Vidya tip: ask your counsellor about the exact weekly time commitment and exam-week workload for your shortlisted program before you enrol." },
      { type: "h2", text: "Talking to your employer" },
      { type: "p", text: "Many learners find it helpful to flag exam weeks to their manager in advance, since most online PG programs cluster assessments into short, predictable windows rather than spreading them evenly." },
    ],
  },
];

export function getBlogPostBySlug(slug: string) {
  return blogPosts.find((post) => post.slug === slug) || null;
}
