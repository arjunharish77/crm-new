# Unnati Vidya — New Assets Checklist (Phase 0-4 content/SEO expansion)

Companion to `14_UNNATIVIDYA_ASSET_CHECKLIST.md` — that document is still the source of truth for every asset that existed before this pass. This document covers **only what's new** as a result of the catalog expansion and the new page types built in `20_UNNATIVIDYA_CONTENT_SEO_MASTER_PLAN.md` (fee/eligibility/career-scope/UGC-approval guides, comparison pages, specialization pages, the EMI calculator, and the "How We Verify" page).

Status as of 08/08/2026: **the new page types need almost no new imagery** — they were deliberately built as text/data pages (tables, FAQ accordions, badges) using the existing design tokens, not new photography. The real new asset need is much smaller than `14_`'s: 7 new certificate-sample slots (one per new course) and, optionally, unique cover art for 20 new blog posts currently sharing 4 existing images by category. Everything else below is either "already covered by an existing per-university file" or "intentionally no image at all."

---

## 1. Certificate samples — 7 new slots (new courses only)

Same mechanism as `14_`'s certificate table: `certificateImagePath(courseId)` in `src/data/media.ts` builds the path purely from the course ID, and `src/lib/asset-exists.ts` automatically renders the real file the moment it's added — no code change needed either way. Until filled, each of these 7 falls back to the existing placeholder, independently of the other 23 (or of each other).

| File path | Course |
|---|---|
| `public/certificates/ba-amity-certificate-sample.webp` | Online BA — Amity University Online |
| `public/certificates/bcom-honours-amity-certificate-sample.webp` | Online B.Com Honours — Amity University Online |
| `public/certificates/mcom-amity-certificate-sample.webp` | Online M.Com — Amity University Online |
| `public/certificates/bajmc-amity-certificate-sample.webp` | Online BA JMC — Amity University Online |
| `public/certificates/msc-data-science-amity-certificate-sample.webp` | Online MSc Data Science — Amity University Online |
| `public/certificates/msc-mathematics-muj-certificate-sample.webp` | Online MSc Mathematics — Manipal University Jaipur |
| `public/certificates/ma-public-policy-governance-amity-certificate-sample.webp` | Online MA Public Policy & Governance — Amity University Online |

Format/size: same spec as the existing 23 — WebP, 1000×700, max 150 KB. Content brief: a real (permission-cleared) sample of that specific course's degree certificate from the issuing university. If a specific one isn't available or confirmed-permitted, leave it out — same rule as `14_`'s original 23.

**Not needed:** university logos, hiring-partner logos, campus/learner photos, and approval-body marks for these 7 new courses — all of that is keyed by **university**, not course, and all three universities (MUJ, SMU, Amity) already have their logo/campus/partner files tracked in `14_`. No new university was added, so no new university-level asset exists here.

---

## 2. Blog cover images — 20 new posts, each now wired to its own unique file

**Code-side wiring completed in this pass** (so every file below goes live the moment it's added, same as the certificate mechanism in §1): each of the 20 posts' `cover` field in `src/data/blog.ts` now points at its own unique intended path (`/blog/{slug}.webp`), not a reused file. A new `resolveBlogCover()` helper (also in `src/data/blog.ts`) checks whether that exact file exists on disk; if not, it falls back to one of the **4 real, already-approved** category images from the original posts, so nothing 404s or shows broken in the meantime. This is wired into both places a cover renders — the article page hero/Open Graph image (`src/app/blog/[slug]/page.tsx`) and the listing-page cards (`src/app/blog/page.tsx`, feeding the existing `BlogExplorer` component). Add files one at a time; each post switches over independently as soon as its own file lands — nothing needs to be complete first.

| File path | Post | Content brief |
|---|---|---|
| `public/blog/online-mba-vs-online-mca-which-is-better.webp` | Online MBA vs Online MCA | Split scene contrasting a management-track professional in a meeting with a developer at a workstation |
| `public/blog/online-mba-vs-distance-mba-difference.webp` | Online MBA vs Distance MBA | A learner reviewing an official document/certificate alongside a laptop — regulatory/approval theme |
| `public/blog/online-bca-vs-bsc-computer-science.webp` | Online BCA vs Online BSc Computer Science | A student coding at a laptop — applied programming, not a lecture-hall scene |
| `public/blog/manipal-university-jaipur-vs-amity-online-mba.webp` | Manipal Jaipur vs Amity Online MBA | A professional reviewing two fee sheets/brochures side by side |
| `public/blog/sikkim-manipal-vs-amity-online-bba.webp` | Sikkim Manipal vs Amity Online BBA | Same side-by-side comparison framing, business/BBA context |
| `public/blog/best-online-mba-working-professionals.webp` | Best online MBA for working professionals | A working professional studying in the evening at home, laptop and notes |
| `public/blog/online-bca-after-12th-guide.webp` | Online BCA after 12th | A recent school-leaver filling out an application form |
| `public/blog/online-mba-after-bcom-right-path.webp` | Online MBA after B.Com | A commerce professional (ledger/calculator nearby) transitioning into management study |
| `public/blog/online-mcom-working-professionals-worth-it.webp` | Online M.Com for working professionals | A finance professional studying online at a home or office desk |
| `public/blog/careers-after-online-ma-political-science.webp` | Careers after MA Political Science | A person reading policy documents/news — research-oriented scene |
| `public/blog/is-online-mba-valid-for-government-jobs.webp` | Is online MBA valid for government jobs | A government-office-adjacent study scene with official documents |
| `public/blog/how-to-verify-ugc-approved-degree.webp` | How to verify a UGC-approved degree | A person checking a government website/document on a laptop |
| `public/blog/online-degree-vs-regular-degree-employers.webp` | Online degree vs regular degree | A hiring/interview scene, or two degree certificates shown side by side |
| `public/blog/naac-ugc-deb-aicte-explained.webp` | NAAC, UGC-DEB, AICTE explained | Official approval seals/documents in an explainer-style flat lay |
| `public/blog/online-msc-data-science-career-scope.webp` | Online MSc Data Science career scope | A person analysing data across dual monitors/dashboards |
| `public/blog/online-msc-mathematics-worth-it.webp` | Online MSc Mathematics worth it | A person working with equations/data visualisations on a screen or whiteboard |
| `public/blog/online-ma-public-policy-governance-careers.webp` | MA Public Policy & Governance careers | A person in a policy/research setting with books and a laptop |
| `public/blog/online-ba-jmc-what-to-expect.webp` | Online BA JMC what to expect | A student writing/journaling, or a media/journalism-themed scene |
| `public/blog/online-bcom-vs-bcom-honours-amity.webp` | Online B.Com vs B.Com Honours at Amity | A commerce student reviewing two programme brochures side by side |
| `public/blog/online-mcom-fintech-amity-explained.webp` | Online M.Com Fintech at Amity | A finance professional with fintech/digital-banking visual cues (phone + laptop) |

All 20: WebP, 1600×900 (16:9), max 150 KB — identical spec to the original 6 in `14_`. Save at the **exact path** shown; a differently-named file won't be picked up by `resolveBlogCover()`.

**Not needed:** no new blog listing/card component work — `BlogExplorer` is unchanged; the listing page now just passes it pre-resolved cover paths computed server-side (since the on-disk file check needs Node's `fs`, which can't run in that client component).

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
