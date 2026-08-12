# Unnati Vidya — New Assets Checklist (Phase 0-4 content/SEO expansion)

Companion to `14_UNNATIVIDYA_ASSET_CHECKLIST.md` — that document is still the source of truth for every asset that existed before this pass. This document covers **only what's new** as a result of the catalog expansion and the new page types built in `20_UNNATIVIDYA_CONTENT_SEO_MASTER_PLAN.md` (fee/eligibility/career-scope/UGC-approval guides, comparison pages, specialization pages, the EMI calculator, and the "How We Verify" page).

Status as of 08/08/2026 (original), updated 12/08/2026: **the new page types needed almost no new imagery** — they were deliberately built as text/data pages (tables, FAQ accordions, badges) using the existing design tokens, not new photography. The real new asset need was much smaller than `14_`'s: 7 new certificate-sample slots (one per new course) and unique cover art for 20 new blog posts that originally shared 4 existing images by category. **Both are now fully resolved** — all 7 certificate slots and all 26 blog cover images (6 original + 20 new, consolidated into one table in §2 below) are confirmed present on disk. Everything else below is either "already covered by an existing per-university file" or "intentionally no image at all."

---

## 1. Certificate samples — 7 new slots (new courses only) — all 7 confirmed present (12/08/2026)

Same mechanism as `14_`'s certificate table: `certificateImagePath(courseId)` in `src/data/media.ts` builds the path purely from the course ID, and `src/lib/asset-exists.ts` automatically renders the real file the moment it's added — no code change needed either way. Verified via directory listing that all 7 below now exist on disk (each 24–46 KB, within the size ceiling) — none are still falling back to the placeholder.

| File path | Course | Status |
|---|---|---|
| `public/certificates/ba-amity-certificate-sample.webp` | Online BA — Amity University Online | ✓ Present |
| `public/certificates/bcom-honours-amity-certificate-sample.webp` | Online B.Com Honours — Amity University Online | ✓ Present |
| `public/certificates/mcom-amity-certificate-sample.webp` | Online M.Com — Amity University Online | ✓ Present |
| `public/certificates/bajmc-amity-certificate-sample.webp` | Online BA JMC — Amity University Online | ✓ Present |
| `public/certificates/msc-data-science-amity-certificate-sample.webp` | Online MSc Data Science — Amity University Online | ✓ Present |
| `public/certificates/msc-mathematics-muj-certificate-sample.webp` | Online MSc Mathematics — Manipal University Jaipur | ✓ Present |
| `public/certificates/ma-public-policy-governance-amity-certificate-sample.webp` | Online MA Public Policy & Governance — Amity University Online | ✓ Present |

Format/size: same spec as the existing 23 — WebP, 1000×700, max 150 KB. Content brief (for reference, if a file is ever replaced): a real (permission-cleared) sample of that specific course's degree certificate from the issuing university.

**Not needed:** university logos, hiring-partner logos, campus/learner photos, and approval-body marks for these 7 new courses — all of that is keyed by **university**, not course, and all three universities (MUJ, SMU, Amity) already have their logo/campus/partner files tracked in `14_`. No new university was added, so no new university-level asset exists here.

---

## 2. Blog cover images — all 26 posts, consolidated (original 6 + 20 new)

**Status as of 12/08/2026: all 26 files below are confirmed present on disk at their exact path** (`public/blog/`, verified via directory listing) and wired — no blog image work remains open. Kept as one consolidated table, spanning both `14_`'s original 6 and this document's 20 new ones, since the two were previously split across separate documents with no single place listing every blog image the site actually uses.

**Code-side wiring** (so any future replacement file goes live the moment it's added, same mechanism as the certificate table in §1): each post's `cover` field in `src/data/blog.ts` points at its own unique path (`/blog/{slug}.webp`). A `resolveBlogCover()` helper (also in `src/data/blog.ts`) checks whether that exact file exists on disk; if not, it falls back to one of **4 category fallback images** (`BLOG_CATEGORY_FALLBACK_COVER`, `src/data/blog.ts:23-28`) — Validity → `ugc-approved-online-degree-guide.webp`, Fees & EMI → `online-mba-guide.webp`, Careers → `mca-vs-mba-it-careers.webp`, Admissions → `online-admission-documents-checklist.webp` — so a missing file never 404s, it just visibly reuses one of these 4. This is wired into both places a cover renders: the article page hero/Open Graph image (`src/app/blog/[slug]/page.tsx`) and the listing-page cards (`src/app/blog/page.tsx` → `BlogExplorer`).

| File path | Post (context) | Content brief (requirement) | Status |
|---|---|---|---|
| `public/blog/ugc-approved-online-degree-guide.webp` | Are online degrees valid for government jobs? | Student reviewing a document, or a government-office-adjacent study scene | ✓ Present — also the Validity-category fallback |
| `public/blog/online-mba-guide.webp` | Online MBA under ₹1 lakh | MBA-relevant professional-study scene | ✓ Present — also the Fees & EMI-category fallback |
| `public/blog/mca-vs-mba-it-careers.webp` | MCA vs MBA in IT | Tech/career-crossroads scene | ✓ Present — also the Careers-category fallback |
| `public/blog/online-admission-documents-checklist.webp` | Documents checklist | Documents/paperwork scene | ✓ Present — also the Admissions-category fallback |
| `public/blog/wes-evaluation-online-degrees.webp` | WES evaluation | International/global-recognition theme | ✓ Present |
| `public/blog/studying-while-working-fulltime.webp` | Studying while working full-time | Evening/weekend study-after-work scene | ✓ Present |
| `public/blog/online-mba-vs-online-mca-which-is-better.webp` | Online MBA vs Online MCA | Split scene contrasting a management-track professional in a meeting with a developer at a workstation | ✓ Present |
| `public/blog/online-mba-vs-distance-mba-difference.webp` | Online MBA vs Distance MBA | A learner reviewing an official document/certificate alongside a laptop — regulatory/approval theme | ✓ Present |
| `public/blog/online-bca-vs-bsc-computer-science.webp` | Online BCA vs Online BSc Computer Science | A student coding at a laptop — applied programming, not a lecture-hall scene | ✓ Present |
| `public/blog/manipal-university-jaipur-vs-amity-online-mba.webp` | Manipal Jaipur vs Amity Online MBA | A professional reviewing two fee sheets/brochures side by side | ✓ Present |
| `public/blog/sikkim-manipal-vs-amity-online-bba.webp` | Sikkim Manipal vs Amity Online BBA | Same side-by-side comparison framing, business/BBA context | ✓ Present |
| `public/blog/best-online-mba-working-professionals.webp` | Best online MBA for working professionals | A working professional studying in the evening at home, laptop and notes | ✓ Present |
| `public/blog/online-bca-after-12th-guide.webp` | Online BCA after 12th | A recent school-leaver filling out an application form | ✓ Present |
| `public/blog/online-mba-after-bcom-right-path.webp` | Online MBA after B.Com | A commerce professional (ledger/calculator nearby) transitioning into management study | ✓ Present |
| `public/blog/online-mcom-working-professionals-worth-it.webp` | Online M.Com for working professionals | A finance professional studying online at a home or office desk | ✓ Present |
| `public/blog/careers-after-online-ma-political-science.webp` | Careers after MA Political Science | A person reading policy documents/news — research-oriented scene | ✓ Present |
| `public/blog/is-online-mba-valid-for-government-jobs.webp` | Is online MBA valid for government jobs | A government-office-adjacent study scene with official documents | ✓ Present |
| `public/blog/how-to-verify-ugc-approved-degree.webp` | How to verify a UGC-approved degree | A person checking a government website/document on a laptop | ✓ Present |
| `public/blog/online-degree-vs-regular-degree-employers.webp` | Online degree vs regular degree | A hiring/interview scene, or two degree certificates shown side by side | ✓ Present |
| `public/blog/naac-ugc-deb-aicte-explained.webp` | NAAC, UGC-DEB, AICTE explained | Official approval seals/documents in an explainer-style flat lay | ✓ Present |
| `public/blog/online-msc-data-science-career-scope.webp` | Online MSc Data Science career scope | A person analysing data across dual monitors/dashboards | ✓ Present |
| `public/blog/online-msc-mathematics-worth-it.webp` | Online MSc Mathematics worth it | A person working with equations/data visualisations on a screen or whiteboard | ✓ Present |
| `public/blog/online-ma-public-policy-governance-careers.webp` | MA Public Policy & Governance careers | A person in a policy/research setting with books and a laptop | ✓ Present |
| `public/blog/online-ba-jmc-what-to-expect.webp` | Online BA JMC what to expect | A student writing/journaling, or a media/journalism-themed scene | ✓ Present |
| `public/blog/online-bcom-vs-bcom-honours-amity.webp` | Online B.Com vs B.Com Honours at Amity | A commerce student reviewing two programme brochures side by side | ✓ Present |
| `public/blog/online-mcom-fintech-amity-explained.webp` | Online M.Com Fintech at Amity | A finance professional with fintech/digital-banking visual cues (phone + laptop) | ✓ Present |

All 26: WebP, 1600×900 (16:9), max 150 KB. Save any future replacement at the **exact path** shown — a differently-named file won't be picked up by `resolveBlogCover()`.

**Not needed:** no new blog listing/card component work — `BlogExplorer` is unchanged; the listing page just passes it pre-resolved cover paths computed server-side (since the on-disk file check needs Node's `fs`, which can't run in that client component).

---

## 3. New page types — deliberately no new imagery

None of these use a photo, illustration, or per-entity image asset. Listed here so it's explicit that this is a design decision already reflected in the shipped code, not a gap:

| Page type | Why no image |
|---|---|
| Eligibility / career-scope / UGC-approval guides (51 pages) | Text, tables, FAQ accordions, and a colored status badge (CSS, not an image) — same shell as the existing fee guides, which also carry no page-specific image beyond the shared header/footer. |
| Comparison pages (18 pages) | A data table, same pattern as the existing interactive `/compare` tool, which also has no page image. |
| Specialization pages (101 pages) | Same table-and-FAQ shell as the guides above. |
| `/tools/emi-calculator` | An interactive form + result card, no imagery. |
| `/how-we-verify` | Plain editorial text sections, no imagery. |

---

## 4. Optional, lower-priority polish — Open Graph social-share images

Course, university, and blog pages each set their own Open Graph image (an existing, already-documented pattern). The five new page types above don't set a page-specific `openGraph.images` and currently fall back to the sitewide default, `public/brand/og-default.jpg` (already exists, already documented in `14_`). This isn't broken — every new page still has correct `title`, `description`, and `canonical` metadata, which matter far more for search than the social-preview image — but if you want a sharper link-preview specifically for these page types later, that's a code change (setting `openGraph.images` in each `generateMetadata`) paired with either the existing `og-default.jpg` or a new type-specific image, not something to source assets for pre-emptively.

---

## 5. Nothing needed for: approval badges, university logos, campus photos, hiring-partner logos, favicon set

All of these are tracked per-university or sitewide in `14_UNNATIVIDYA_ASSET_CHECKLIST.md` and are untouched by this pass — no new university was added (catalog expansion added courses at the existing 3 universities only, per your own scoping decision in `20_`'s intro), so none of these needed new entries.
