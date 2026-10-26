// Wave 5 B1: how each university holds online exams and what it asks of your computer. Official
// university pages only (the W3 rule), quoted as published, read on 14 October 2026. Anything a
// source doesn't state is left out and the tool says to confirm it with the university.

export type ExamSourceId = "online-manipal" | "amity";

export const EXAM_SOURCES: Record<ExamSourceId, { label: string; url: string; updated: string; checkedAt: string }> = {
  "online-manipal": {
    label: "Online Manipal: \"What is the examination process for online degree students?\" (MUJ, SMU and MAHE)",
    url: "https://www.onlinemanipal.com/blogs/what-is-the-examination-process-for-online-degree-students",
    updated: "3 November 2025",
    checkedAt: "2026-10-14",
  },
  amity: {
    label: "Amity University Online: \"How Amity Online conducts BBA + MBA exams\"",
    url: "https://amityonline.com/blog/amity-online-conduct-exams-for-bba-mba-students",
    updated: "14 September 2026",
    checkedAt: "2026-10-14",
  },
};

export type ExamUniversity = {
  id: "muj" | "smu" | "amity";
  name: string;
  source: ExamSourceId;
  howHeld: string[];
  rules: string[];
  requirements: Array<{ label: string; value: string }>;
  // Thresholds the device check compares against; null when the source gives no figure.
  checks: {
    computerOnly: boolean;
    windowsOnly: boolean;
    browsers: string[] | null;
    minScreen: { width: number; height: number } | null;
    camera: { width: number; height: number; fps: number } | null;
    minMbps: number | null;
    memoryGb: number | null;
  };
};

const MANIPAL_HOW = [
  "Exams are online proctored and taken from home on a computer that meets the requirements.",
  "You get the exam schedule by email or SMS, book a slot on the OBES portal and download an e-admit card there.",
  "The Safe Exam Browser locks down your computer during the exam: no other applications, files or internet.",
  "Descriptive answers are typed into the exam window, with a built-in maths tool where needed. Handwritten answers can't be uploaded.",
];
const MANIPAL_RULES = [
  "Using a mobile phone, leaving your seat or an unidentified face being detected once voids that subject's exam (level 1); repeating it voids every subject in that exam cycle (level 2).",
  "Level 3 malpractice voids all subjects and bars registration for the next academic year.",
  "Antivirus or Windows Defender has to be turned off while the Safe Exam Browser is downloaded.",
];

export const EXAM_UNIVERSITIES: ExamUniversity[] = [
  {
    id: "muj", name: "Manipal University Jaipur", source: "online-manipal", howHeld: MANIPAL_HOW, rules: MANIPAL_RULES,
    requirements: [
      { label: "Computer", value: "Desktop or laptop. Mobile, tablet and iPad are not supported." },
      { label: "Operating system", value: "Windows 10 or later, up to date. The exam runs only on Windows." },
      { label: "Hardware", value: "Intel Core i5 10th Gen or above, 2.4 GHz or more; 8 GB or more; resolution 640×480 (15 fps)." },
      { label: "Camera and microphone", value: "Internal or external, running natively in the operating system." },
      { label: "Internet", value: "5 Mbps or more, continuous." },
      { label: "Browser", value: "Chrome or Edge." },
    ],
    checks: { computerOnly: true, windowsOnly: true, browsers: ["Chrome", "Edge"], minScreen: null, camera: { width: 640, height: 480, fps: 15 }, minMbps: 5, memoryGb: 8 },
  },
  {
    id: "smu", name: "Sikkim Manipal University", source: "online-manipal", howHeld: MANIPAL_HOW, rules: MANIPAL_RULES,
    requirements: [
      { label: "Computer", value: "Desktop or laptop (mandatory)." },
      { label: "Operating system", value: "Windows 10 or later only. The exam runs only on Windows." },
      { label: "Hardware", value: "Intel Core i5 10th Gen or above (2.4 GHz or more), 8 GB RAM, 1024×768 screen resolution." },
      { label: "Camera and microphone", value: "Web camera (640×480, 15 fps) mandatory, plus a microphone (external or internal)." },
      { label: "Internet", value: "5 Mbps, steady." },
      { label: "Browser", value: "Chrome or Edge." },
    ],
    checks: { computerOnly: true, windowsOnly: true, browsers: ["Chrome", "Edge"], minScreen: { width: 1024, height: 768 }, camera: { width: 640, height: 480, fps: 15 }, minMbps: 5, memoryGb: 8 },
  },
  {
    id: "amity", name: "Amity University Online", source: "amity",
    howHeld: [
      "All exams are online and proctored. Amity uses AI-based tools and live invigilators to monitor students during the exam.",
      "Some exams may require proctoring software that monitors your activity during the test.",
      "Amity provides mock exams so you can get used to the system.",
    ],
    rules: ["Take the exam in a quiet, distraction-free space with good lighting, so the proctoring software can monitor properly."],
    requirements: [
      { label: "Computer", value: "A laptop or desktop with an updated operating system. Tablets and mobile devices may not be supported." },
      { label: "Internet", value: "A reliable, good-speed connection; a wired connection is better for stability." },
      { label: "Software", value: "Proctoring software for some exams." },
    ],
    checks: { computerOnly: true, windowsOnly: false, browsers: null, minScreen: null, camera: null, minMbps: null, memoryGb: null },
  },
];
