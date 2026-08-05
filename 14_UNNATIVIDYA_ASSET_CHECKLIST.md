# Unnati Vidya Asset Checklist

Add these files after the website folder is created at:

```text
crm/apps/unnatividya/public/
```

Do not use the older prototype assets from `design_handoff_unnatividya/assets/`.

The current `static_site/assets/logo-*.svg` files are allowed as temporary handoff logos so the app can match the approved static HTML immediately. Replace them with production-optimized brand files before go-live.

## Current status as of 04/08/2026

This document was rebuilt from a full page-by-page sweep of the actual running app (not just a copy of the original handoff list) — every placeholder box, dashed "logo" square, and generic stock photo in the codebase is now accounted for below, organized by the page it appears on. Nothing is deferred to "later" — every asset the current UI can display is listed with its exact path, format, dimensions, and size ceiling.

Decisions made with the site owner while building this version of the checklist (see the relevant page sections for detail):

- **Certificate samples are per-course, not per-university** — 23 files, one per course page.
- **Hiring-partner logos**: no company names/attribution needed — real logo image files only, shown with no caption. Still needs 18 real files (6 slots × 3 universities); until a given file is added, that slot keeps showing the existing placeholder box.
- **Campus & learner moments**: 9 unique files (3 per university), not 3 shared generic ones.
- **Testimonial/review photos**: intentionally **not required**. The site's testimonials (homepage) and reviews (course pages) are sample/placeholder marketing copy attached to invented names — attaching a real-looking photo to a fabricated name and quote would read as a fake testimonial. These stay as colored initials (no photo asset) by design. Do not source photos for "Priya Sharma," "Sneha Iyer," etc.

Code-side wiring completed in this pass (so every asset below goes live the moment the file is added, with zero further code changes needed):

- Course-listing page's per-row university logo (was a permanent placeholder box, unwired) now reads from the same logo file as the course/university detail hero.
- Course detail's certificate block, university detail's "Campus & learner moments," and university detail's "Placements & hiring partners" now check whether each specific file actually exists on disk (`src/lib/asset-exists.ts`) and automatically render the real image the moment it's added — falling back to the existing placeholder (or, for campus moments, the previous temporary Wikimedia photo) for any slot that isn't filled in yet. You can add these files one at a time; each one appears independently, nothing needs to be "complete" first.
- Course, university, and blog article pages now each set their own Open Graph preview image (previously every page shared one generic site-wide image) — this reuses images already in place, no new files needed for it.
- `app/layout.tsx`'s `metadata.icons` is wired to `/brand/favicon.ico`, `/brand/favicon-32x32.png`, and `/brand/apple-touch-icon.png` — code side done, just needs the actual files (section 1).

Do not consider visual/SEO image work production-complete until every file below is added and a Lighthouse/PageSpeed pass is run.

## How to use this document with a scraper or AI image tool

Every entry gives: exact output path, exact pixel dimensions, format, a file-size ceiling for web performance, and a content brief. Feed one row at a time, or a whole table, as a generation/search prompt. Save every file at the **exact path** shown — the app reads by exact filename; a differently-named file will not be picked up.

---

## Page 1: Every page (shared header/footer/meta)

| File path | Format | Dimensions | Max size | Content brief |
|---|---|---|---|---|
| `public/brand/unnatividya-logo-gradient.svg` | SVG, vector | ~174×32 box, rendered at 22px height | 15 KB | Full "Unnati Vidya" wordmark, purple/violet gradient, transparent background — header, every page |
| `public/brand/unnatividya-logo-white.svg` | SVG, vector | same box | 15 KB | Same wordmark, solid white fill — dark footer band, every page |
| `public/brand/unnatividya-logo-violet.svg` | SVG, vector | same box | 15 KB | Same wordmark, solid violet `#544CC8` fill — not yet wired into any component; reserved for email/print use |
| `public/brand/favicon.ico` | ICO, multi-resolution (16/32/48 in one file) | — | 15 KB | Icon-only mark (not the full wordmark), legible at 16px — browser tab icon |
| `public/brand/favicon-32x32.png` | PNG, transparent | 32×32 | 5 KB | Same icon mark |
| `public/brand/apple-touch-icon.png` | PNG, no transparency | 180×180 | 20 KB | Icon mark on solid brand-color background, safe-margin padding (iOS applies its own rounded mask) |
| `public/brand/og-default.jpg` | JPG | 1200×630 | 200 KB | Default social-share image for any page without its own (course/university/blog pages now have their own — see below) |

Optional completeness add-ons (not required by any code path, but standard alongside a favicon set): `public/brand/android-chrome-192x192.png`, `public/brand/android-chrome-512x512.png`, `public/brand/site.webmanifest`.

---

## Page 2: Homepage (`/`)

| File path | Format | Dimensions | Max size | Content brief |
|---|---|---|---|---|
| `public/universities/manipal-university-jaipur-campus.webp` | WebP | 1200×700 | 180 KB | "Top online universities" card — real MUJ campus or online-class photo |
| `public/universities/sikkim-manipal-university-campus.webp` | WebP | 1200×700 | 180 KB | Same card, SMU |
| `public/universities/amity-online-campus.webp` | WebP | 1200×700 | 180 KB | Same card, Amity |
| `public/hero/recommender-preview.webp` | WebP | 1600×1200 | 220 KB | "Not sure which degree fits?" AI-shortlist card — a guided-quiz/recommendation moment, device screen or person reviewing a shortlist |

No photo needed for the 3 "What learners say" testimonials (Priya Sharma / Arjun Mehta / Farhan Khan) — initials-only by design, see decision above.

---

## Page 3: Courses listing (`/courses`)

| File path | Format | Dimensions | Max size | Content brief |
|---|---|---|---|---|
| `public/universities/manipal-university-jaipur-logo.svg` | SVG, transparent | fits 56×56 without distortion | 20 KB | Per-row university logo (one logo box per course row) — reused across every MUJ course row |
| `public/universities/sikkim-manipal-university-logo.svg` | SVG, transparent | fits 56×56 | 20 KB | Same, SMU rows |
| `public/universities/amity-online-logo.svg` | SVG, transparent | fits 56×56 | 20 KB | Same, Amity rows |

(Same 3 files as the course/university detail hero logo below — one file per university, reused everywhere that university's logo appears.)

---

## Page 4: Course detail (`/courses/[slug]` — 23 pages)

Shared across all 23 pages (one file per university, not per course):

| File path | Format | Dimensions | Max size | Content brief |
|---|---|---|---|---|
| `public/universities/manipal-university-jaipur-logo.svg` | SVG | fits 60×60 | 20 KB | Hero logo box — MUJ courses |
| `public/universities/sikkim-manipal-university-logo.svg` | SVG | fits 60×60 | 20 KB | Hero logo box — SMU courses |
| `public/universities/amity-online-logo.svg` | SVG | fits 60×60 | 20 KB | Hero logo box — Amity courses |
| `public/hero/student-online-degree.webp` | WebP | 1600×1200 | 220 KB | "About this program" overview image — a learner genuinely studying online, no baked-in text |

**Certificate sample — one unique file per course** (per the decision above), 300×210 box on the page:

| File path | Course |
|---|---|
| `public/certificates/mba-muj-certificate-sample.webp` | Online MBA — Manipal University Jaipur |
| `public/certificates/mba-smu-certificate-sample.webp` | Online MBA — Sikkim Manipal University |
| `public/certificates/mba-amity-certificate-sample.webp` | Online MBA — Amity Online |
| `public/certificates/bba-muj-certificate-sample.webp` | Online BBA — Manipal University Jaipur |
| `public/certificates/bba-amity-certificate-sample.webp` | Online BBA — Amity Online |
| `public/certificates/bca-muj-certificate-sample.webp` | Online BCA — Manipal University Jaipur |
| `public/certificates/bca-amity-certificate-sample.webp` | Online BCA — Amity Online |
| `public/certificates/mca-muj-certificate-sample.webp` | Online MCA — Manipal University Jaipur |
| `public/certificates/mca-amity-certificate-sample.webp` | Online MCA — Amity Online |
| `public/certificates/bcom-muj-certificate-sample.webp` | Online B.Com — Manipal University Jaipur |
| `public/certificates/bcom-smu-certificate-sample.webp` | Online B.Com — Sikkim Manipal University |
| `public/certificates/mcom-muj-certificate-sample.webp` | Online M.Com — Manipal University Jaipur |
| `public/certificates/ba-smu-certificate-sample.webp` | Online BA — Sikkim Manipal University |
| `public/certificates/bba-smu-certificate-sample.webp` | Online BBA — Sikkim Manipal University |
| `public/certificates/mca-smu-certificate-sample.webp` | Online MCA — Sikkim Manipal University |
| `public/certificates/mcom-smu-certificate-sample.webp` | Online M.Com — Sikkim Manipal University |
| `public/certificates/ma-english-smu-certificate-sample.webp` | Online MA English — Sikkim Manipal University |
| `public/certificates/ma-political-science-smu-certificate-sample.webp` | Online MA Political Science — Sikkim Manipal University |
| `public/certificates/ma-sociology-smu-certificate-sample.webp` | Online MA Sociology — Sikkim Manipal University |
| `public/certificates/ma-economics-muj-certificate-sample.webp` | Online MA Economics — Manipal University Jaipur |
| `public/certificates/majmc-muj-certificate-sample.webp` | Online MA JMC — Manipal University Jaipur |
| `public/certificates/bcom-amity-certificate-sample.webp` | Online B.Com — Amity Online |
| `public/certificates/majmc-amity-certificate-sample.webp` | Online MA (JMC) — Amity Online |

All 23: WebP, 1000×700, max 150 KB. Content brief: a real (permission-cleared) sample of that specific course's degree certificate from the issuing university. If a specific course's certificate sample is not available or not confirmed permitted, leave that one file out — that course's page will keep showing the existing placeholder automatically, independent of the other 22.

No photo needed for the 2 course-page reviews (Sneha Iyer / Rohit Verma) — initials-only by design, see decision above.

---

## Page 5: Universities listing (`/universities`)

Same 3 logo + 3 campus files as the homepage/course-detail sections above (reused, not new).

---

## Page 6: University detail (`/universities/[slug]` — 3 pages)

Hero logo + hero campus photo: same 3+3 files already listed above.

**Campus & learner moments — 3 unique photos per university (9 total)**, 320×180 box each:

| File path | Content brief |
|---|---|
| `public/universities/manipal-university-jaipur-moment-1.webp` | MUJ real campus/learner moment 1 |
| `public/universities/manipal-university-jaipur-moment-2.webp` | MUJ real campus/learner moment 2 |
| `public/universities/manipal-university-jaipur-moment-3.webp` | MUJ real campus/learner moment 3 |
| `public/universities/sikkim-manipal-university-moment-1.webp` | SMU real campus/learner moment 1 |
| `public/universities/sikkim-manipal-university-moment-2.webp` | SMU real campus/learner moment 2 |
| `public/universities/sikkim-manipal-university-moment-3.webp` | SMU real campus/learner moment 3 |
| `public/universities/amity-online-moment-1.webp` | Amity real campus/learner moment 1 |
| `public/universities/amity-online-moment-2.webp` | Amity real campus/learner moment 2 |
| `public/universities/amity-online-moment-3.webp` | Amity real campus/learner moment 3 |

All 9: WebP, 1200×675 (16:9, cropped to a 320×180 box on the page), max 150 KB each. Content brief: real campus exterior, classroom, or online-learning-in-progress photography specific to that university — not the same generic stock photo repeated across universities.

**Placements & hiring partners — 6 logo slots per university (18 total)**, shown as image only, no caption/company name in the UI:

| File path |
|---|
| `public/universities/manipal-university-jaipur-partner-logo-1.svg` through `-6.svg` |
| `public/universities/sikkim-manipal-university-partner-logo-1.svg` through `-6.svg` |
| `public/universities/amity-online-partner-logo-1.svg` through `-6.svg` |

18 files total. Format: SVG preferred (any real aspect ratio — scales cleanly inside a 72px-tall box with padding); a transparent PNG at least 400px wide also works. Max 15 KB each. Content brief: a real hiring/recruitment partner's logo for that university's placement program. Each slot is independent — add however many real logos you have per university (1 to 6); unfilled slots keep showing the current placeholder box automatically.

---

## Page 7: Blog listing (`/blog`) and article detail (`/blog/[slug]` — 6 posts)

| File path | Used at | Content brief |
|---|---|---|
| `public/blog/ugc-approved-online-degree-guide.webp` | Listing card + article hero + inline body image, for "Are online degrees valid for government jobs?" | Student reviewing a document, or a government-office-adjacent study scene |
| `public/blog/online-mba-guide.webp` | Same 3 slots, "Online MBA under ₹1 lakh" | MBA-relevant professional-study scene |
| `public/blog/mca-vs-mba-it-careers.webp` | Same 3 slots, "MCA vs MBA in IT" | Tech/career-crossroads scene |
| `public/blog/online-admission-documents-checklist.webp` | Same 3 slots, "Documents checklist" | Documents/paperwork scene |
| `public/blog/wes-evaluation-online-degrees.webp` | Same 3 slots, "WES evaluation" | International/global-recognition theme |
| `public/blog/studying-while-working-fulltime.webp` | Same 3 slots, "Studying while working full-time" | Evening/weekend study-after-work scene |

All 6: WebP, 1600×900 (16:9), max 150 KB. After adding, update each post's `cover` field in `src/data/blog.ts` to the local path (currently still pointing at Wikimedia placeholders — one-line change per post).

---

## Page 8: Compare, Recommender, Legal (Privacy/Terms/Refund), About

No image assets used or required on any of these pages.

---

## Approval badges (appear inline on Home, Courses listing is text-only, Course detail hero, Universities listing, University detail hero)

| File path | Format | Dimensions | Max size | Content brief |
|---|---|---|---|---|
| `public/approvals/ugc.svg` | SVG, transparent | fits ~24×24 | 10 KB | UGC (University Grants Commission) official mark |
| `public/approvals/naac.svg` | SVG, transparent | fits ~24×24 | 10 KB | NAAC accreditation mark |
| `public/approvals/aicte.svg` | SVG, transparent | fits ~24×24 | 10 KB | AICTE approval mark |
| `public/approvals/wes.svg` | SVG, transparent | fits ~24×24 | 10 KB | WES (World Education Services) mark |
| `public/approvals/aiu.svg` | SVG, transparent | fits ~24×24 | 10 KB | AIU (Association of Indian Universities) mark |

Already wired (`components/approval-badge.tsx`) — icon appears next to the existing text badge automatically once each file is added. Use only official marks with permitted usage; leave any file out if usage isn't confirmed (the text badge alone is a complete, correct fallback).

---

## Not currently used on any page — no code slot exists

These were part of the original handoff brief but there is genuinely nowhere in the live UI that would show them today. Do not source these until a page/section is actually built to use them (adding one now would either go unused or require a new UI section, which is a design decision, not an asset one):

- `public/hero/counselor-guidance.webp` — no unclaimed slot.
- `public/illustrations/compare-programs.webp` — the dark "Compare now" CTA band is text + button only in the approved design, no image column.
- `public/illustrations/lead-wizard-success.webp` — the wizard's success step is a checkmark icon + text only in the approved design.
- `public/streams/management.webp`, `it-computers.webp`, `commerce.webp`, `arts-humanities.webp` — no stream-browsing section exists on any current page.

## Explicitly not required — testimonial/review photos

Per the decision above: no photos for the homepage testimonials (Priya Sharma, Arjun Mehta, Farhan Khan) or course-page reviews (Sneha Iyer, Rohit Verma). These remain colored initials only.
