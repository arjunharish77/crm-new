// Admission document checklist data (Wave 4 A1, decision W3): only official university pages, each
// item linked to its source and the date we read it. Anything a source does not state is left out
// and the tool tells the learner to confirm it with the university. Checked 12 October 2026.

export type DocumentCategory = "indian" | "nri" | "foreign";
export type DocumentLevel = "UG" | "PG";
export type DocumentSourceId = "om-mba-2026" | "muj-manual-v5" | "amity-faq" | "amity-apply-2026";

export type DocumentSource = { label: string; url: string; checkedAt: string; note?: string };

export type DocumentItem = {
  id: string;
  label: string;
  detail?: string;
  need: "required" | "if-applicable";
  levels?: DocumentLevel[];
  categories?: DocumentCategory[];
  sources: DocumentSourceId[];
};

export const DOCUMENT_SOURCES: Record<DocumentSourceId, DocumentSource> = {
  "om-mba-2026": {
    label: "Online Manipal, online MBA admission page (documents required; MUJ, SMU and MAHE)",
    url: "https://www.onlinemanipal.com/online-mba-courses/admission-fee-eligibility-details",
    checkedAt: "2026-10-12",
    note: "Listed on the online MBA admission page; confirm the list for other programs with the university.",
  },
  "muj-manual-v5": {
    label: "MUJ Admission Manual for Online Programmes (version 5, uploaded January 2022)",
    url: "https://www.onlinemanipal.com/wp-content/uploads/2022/01/MUJ-Admission-Manual-Online-Programmes-V5.pdf",
    checkedAt: "2026-10-12",
    note: "An older manual; confirm that its upload rules still apply for the current session.",
  },
  "amity-faq": {
    label: "Amity University Online FAQs: documents required for admission, UG admission and PG admissions",
    url: "https://amityonline.com/faq-hub",
    checkedAt: "2026-10-12",
  },
  "amity-apply-2026": {
    label: "Amity University Online, \"How to apply\" guide (updated 16 January 2026)",
    url: "https://amityonline.com/blog/fill-out-application-form-for-amity-online-bcom-hons",
    checkedAt: "2026-10-12",
  },
};

const MANIPAL_COMMON: DocumentItem[] = [
  { id: "class10", label: "Class 10 marksheet", need: "required", sources: ["om-mba-2026"] },
  { id: "class12", label: "Class 12 marksheet", need: "required", sources: ["om-mba-2026"] },
  { id: "grad-marks", label: "Graduation marksheet", need: "required", levels: ["PG"], sources: ["om-mba-2026"] },
  { id: "id-aadhaar", label: "Proof of identity: Aadhaar card", detail: "Mandatory for Indian citizens.", need: "required", categories: ["indian"], sources: ["om-mba-2026"] },
  { id: "address", label: "Proof of address", detail: "Aadhaar card, passport, voter's ID, gas bill, bank statement or post-paid mobile statement.", need: "required", sources: ["om-mba-2026"] },
  { id: "grad-certificate", label: "Graduation degree certificate", need: "if-applicable", levels: ["PG"], sources: ["om-mba-2026"] },
  { id: "scholarship", label: "Scholarship documents", detail: "Only if you claim a scholarship or concession.", need: "if-applicable", sources: ["om-mba-2026"] },
  { id: "defence", label: "Defence service certificate", need: "if-applicable", sources: ["om-mba-2026"] },
  { id: "divyaang", label: "Divyaang certificate", need: "if-applicable", sources: ["om-mba-2026"] },
  { id: "reserved", label: "Reserved category certificate", need: "if-applicable", sources: ["om-mba-2026"] },
  { id: "gov-id", label: "Government ID card", need: "if-applicable", sources: ["om-mba-2026"] },
];

// MUJ only: the admission manual adds upload rules and cases the Online Manipal page does not cover.
const MUJ_MANUAL: DocumentItem[] = [
  { id: "photo", label: "Recent passport-size colour photograph", detail: "JPG, up to 2 MB; 3.5 cm × 4.5 cm preferred. It should match your ID proof.", need: "required", sources: ["muj-manual-v5"] },
  { id: "signature", label: "Specimen signature on white paper", detail: "JPG, up to 2 MB; 4.5 cm × 1.5 cm preferred. It cannot be changed later.", need: "required", sources: ["muj-manual-v5"] },
  { id: "passport", label: "Passport", detail: "Identity proof for non-Indians and Indians residing outside India.", need: "required", categories: ["nri", "foreign"], sources: ["muj-manual-v5"] },
  { id: "grad-all-marks", label: "All year or semester marksheets with the provisional pass certificate", detail: "If you do not have your degree certificate yet.", need: "if-applicable", levels: ["PG"], sources: ["muj-manual-v5"] },
  { id: "aiu", label: "AIU equivalence certificate", detail: "For a degree from a foreign university.", need: "if-applicable", levels: ["PG"], sources: ["muj-manual-v5"] },
  { id: "name-affidavit", label: "Notarised affidavit in English for a name variation", detail: "If your name differs (even slightly) across your marksheets and certificates.", need: "if-applicable", sources: ["muj-manual-v5"] },
  { id: "marriage-certificate", label: "Marriage certificate and ID in the new name", detail: "If your name changed after marriage.", need: "if-applicable", sources: ["muj-manual-v5"] },
  { id: "employer-letter", label: "Letter from HR or service letter", detail: "For the PSU or government employee benefit category.", need: "if-applicable", sources: ["muj-manual-v5"] },
];

const AMITY: DocumentItem[] = [
  { id: "a-class10-12", label: "Class 10 and 12 marksheets and certificates", need: "required", categories: ["indian", "nri"], sources: ["amity-faq", "amity-apply-2026"] },
  { id: "a-grad", label: "Graduation certificate and consolidated marksheets", need: "required", levels: ["PG"], categories: ["indian", "nri"], sources: ["amity-faq"] },
  { id: "a-id", label: "Government-issued ID", detail: "Such as Aadhaar, PAN or passport.", need: "required", categories: ["indian", "nri"], sources: ["amity-faq", "amity-apply-2026"] },
  { id: "a-photo", label: "Recent passport-size photograph", need: "required", sources: ["amity-faq", "amity-apply-2026"] },
  { id: "a-dob", label: "Proof of date of birth", need: "required", levels: ["PG"], categories: ["indian", "nri"], sources: ["amity-faq"] },
  { id: "a-resume", label: "Resume", need: "required", levels: ["PG"], categories: ["indian", "nri"], sources: ["amity-faq"] },
  { id: "a-olevel", label: "O Level and A Level certificates or equivalent qualifications", need: "required", categories: ["foreign"], sources: ["amity-faq"] },
  { id: "a-intl-grad", label: "Bachelor's degree certificate with consolidated marksheets", need: "required", levels: ["PG"], categories: ["foreign"], sources: ["amity-faq"] },
  { id: "a-passport", label: "Passport copy", detail: "Mandatory for international students.", need: "required", categories: ["foreign"], sources: ["amity-faq"] },
  { id: "a-equivalence", label: "AIU equivalence certificate (certificate of equivalence)", detail: "If required for your qualification.", need: "if-applicable", categories: ["foreign"], sources: ["amity-faq"] },
  { id: "a-visa", label: "Visa", detail: "Listed for international PG applicants.", need: "if-applicable", levels: ["PG"], categories: ["foreign"], sources: ["amity-faq"] },
];

export const ADMISSION_DOCUMENTS: Record<string, { items: DocumentItem[]; uploadNote?: { text: string; source: DocumentSourceId }; categoryNote?: Partial<Record<DocumentCategory, string>> }> = {
  muj: {
    items: [...MANIPAL_COMMON, ...MUJ_MANUAL],
    uploadNote: { text: "Upload scans of the original documents as JPG, JPEG or PDF, up to 2 MB each. Photo, signature and ID proof are JPG only.", source: "muj-manual-v5" },
  },
  smu: {
    items: MANIPAL_COMMON,
    categoryNote: { nri: "The source does not list separate documents for NRI applicants. Confirm passport and visa requirements with the university.", foreign: "The source does not list separate documents for foreign applicants. Confirm passport, visa and equivalence requirements with the university." },
  },
  amity: {
    items: AMITY,
    uploadNote: { text: "Scan documents and save them as PDF or JPEG at the size and resolution the application portal asks for.", source: "amity-apply-2026" },
    categoryNote: { nri: "Amity's pages list documents for domestic and international students only. This list uses the domestic one; confirm what applies to NRI applicants with the university." },
  },
};

export function documentsFor(universityId: string, level: DocumentLevel, category: DocumentCategory) {
  const entry = ADMISSION_DOCUMENTS[universityId];
  if (!entry) return null;
  const items = entry.items.filter(item => (!item.levels || item.levels.includes(level)) && (!item.categories || item.categories.includes(category)));
  return { required: items.filter(item => item.need === "required"), conditional: items.filter(item => item.need === "if-applicable"), uploadNote: entry.uploadNote || null, categoryNote: entry.categoryNote?.[category] || null };
}
