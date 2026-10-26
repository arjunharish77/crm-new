import type { Intake, SourceCheck } from "@/data/catalog";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// "2026-10-03" → "3 October 2026". Parsed by hand so the server and browser never disagree on
// time zones.
export function formatCheckedDate(isoDate: string) {
  const [year, month, day] = isoDate.split("-").map(Number);
  return MONTHS[month - 1] ? `${day} ${MONTHS[month - 1]} ${year}` : isoDate;
}

// The source host as a short, readable label ("onlinemanipal.com").
export function sourceHost(url: string) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
}

export function sourceCheckLine(check: SourceCheck | undefined) {
  return check ? { href: check.sourceUrl, host: sourceHost(check.sourceUrl), date: formatCheckedDate(check.checkedAt) } : null;
}

// Today's date in India (YYYY-MM-DD): intakes expire by the learner's calendar, not the server's.
export function todayInIndia(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

// Intakes whose application deadline is today or later, soonest first.
export function upcomingIntakes(intakes: Intake[] | undefined, today = todayInIndia()) {
  return (intakes || []).filter(intake => intake.applicationDeadline >= today).sort((a, b) => a.applicationDeadline.localeCompare(b.applicationDeadline));
}

// Machine endpoints that were saved as "sources" but are not pages a learner can open
// (technical SEO review M9: api-otp.amityonline.com timed out). Hidden from public source lists;
// remove them from the records in the CMS when the university entry is next edited.
const NON_PAGE_SOURCES = [/^https:\/\/api-otp\.amityonline\.com\//];
export function publicSourceUrls(urls: string[] | undefined) {
  return (urls || []).filter((url) => !NON_PAGE_SOURCES.some((pattern) => pattern.test(url)));
}
