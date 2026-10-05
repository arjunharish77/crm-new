# Unnati Vidya: technical SEO audit

**Date:** 5 October 2026 · **Site:** https://unnatividya.com · **Source:** `crm/apps/unnatividya` (Next.js 16.1.6, React 19.2.3, Caddy in front)
**Method:** I crawled every sitemap URL once, one request at a time, with a desktop Chrome user agent and a 0.35 s delay between requests. About 310 HTML requests went to the site in total, plus 6 Lighthouse page loads. I also parsed JSON-LD, compared page shingles and built an internal-link graph from the crawl. I made no repo changes and submitted no forms.
**Raw data:** `seo-crawl.json` (in this folder) holds per-page records, the link graph, duplicate clusters, the Lighthouse summary, redirect checks and external-link checks. The `lh/` folder has the full Lighthouse JSON. The `html/` and `text/` folders have raw HTML and extracted text.

---

## 0. Headline: production runs an older build than the repo

The live HTML, sitemaps and headers match a build from about **28 September 2026**. The sitemap index `lastmod` is `2026-09-28T12:01:08Z`, and pages are served `x-nextjs-cache: HIT`. The commits `9533137` (3 Oct, "ui changes") and `d4bd0e6` (5 Oct, "Round 2") are **not deployed**. Several owner rules are implemented in code but not visible on the live site:

| Owner rule / code change | Repo (HEAD) | Live |
|---|---|---|
| Byline "Content Team, Unnati Vidya" (§14.4) | `blog/[slug]/page.tsx` sets `author: {@type: Organization, name: "Content Team, Unnati Vidya", url: /authors/content-team}` | **All 26 posts** show the named person **"Ritika Desai, Senior education counsellor"** in the HTML, and `Article.author` is `@type: Person` |
| `/authors/content-team` profile | Route exists and is listed in `staticSitemapRoutes` | **404**, and absent from the sitemap |
| "Apply now" CTA everywhere | Implemented | 0 of 260 pages show "Apply now". All 260 show "Talk to an expert" |
| Blog index title | `"Online Learning Articles"` | `/blog` title is "Online Degree Guides \| Unnati Vidya", the same as `/online-degree-guides` |
| Real sitemap `lastmod` | Taken from `catalog.modifiedAt`. Static and editorial-guide entries get no lastmod | Every catalog, guide and static URL carries the generation timestamp (`2026-09-28T12:01:08.7xxZ`), so 234 of 260 share the same time |
| Sitemap index | No `<lastmod>`, `Cache-Control: no-store` | `<lastmod>` equals the build time, `s-maxage=3600` |

**Action:** deploy the current repo before Search Console baselining or URL Inspection. Many findings below then shrink, but the issues marked **[repo]** are still in the code and need code changes.

---

## 1. Inventory

**robots.txt** (200): `Allow: /`, `Disallow: /admin, /api, /lead`. It lists both `sitemap-index.xml` and `sitemap.xml`.
**Sitemaps:** the index has 10 children. `/sitemap.xml` contains the **same 260 URLs**. Listing both is harmless, but one is enough; the index is the better choice.

| Child sitemap | URLs | Type |
|---|---|---|
| static.xml | 14 | home, listings, tools, legal |
| courses.xml | 30 | `/courses/{program}-{university}` |
| universities.xml | 3 | MUJ, SMU, Amity |
| blog.xml | 26 | `/blog/*` (lastmod is the real publish date) |
| guides.xml | 17 | `*-fees` guides |
| eligibility-guides.xml | 17 | `*-eligibility` |
| career-guides.xml | 17 | `*-career-scope` |
| ugc-guides.xml | 17 | `*-ugc-approval` |
| comparisons.xml | 18 | `/compare/{program}/{a}-vs-{b}` |
| specializations.xml | 101 | `/specializations/*` |
| **Total** | **260** | |

### Results across all 260 URLs
- **Status:** 260 × 200, with no redirects or chains. **Canonical:** 260 of 260 self-referencing and correct.
- **Meta robots / X-Robots-Tag:** none on any sitemap URL, so no noindex pages are listed. **H1:** exactly 1 per page on all 260. **hreflang:** none, which is correct under the English-only rule (§14.9). `<html lang="en-IN">` is set.
- **Server rendering:** course facts (fees, duration, eligibility, specialisations, FAQs), article bodies, guide tables and comparison tables are all in the initial HTML. JS is not needed for indexable content. 258 of 260 pages are served prerendered or ISR (`x-nextjs-cache: HIT`). Median HTML fetch time is about 40 ms; course pages are about 100 ms.
- **Images:** 1,741 `<img>` tags. 0 have no alt attribute. 212 have `alt=""` (decorative logos and badges, acceptable). Images go through `next/image` as WebP with `srcset`/`sizes`.
- **Twitter cards:** present on all 260. **Open Graph:** see issue H4.

| Type | n | Main-content words (min/median/max) | Title length | Description length | Inlinks from other pages (min/median) |
|---|---|---|---|---|---|
| course | 30 | 674 / 732 / 878 | 53–80 | 123–150 | 3 / 9 |
| university | 3 | 590 / 636 / 665 | 53–55 | 97–99 | 13 |
| blog | 26 | 315 / 369 / 431 | 48–82 | 87–149 | **1 / 1** |
| guide-fees | 17 | 379 / 405 / 441 | 43–66 | 104–129 | 5 / 9 |
| guide-eligibility | 17 | 215 / 310 / 463 | 67–94 | **180–207** | 5 / 10 |
| guide-career-scope | 17 | 262 / 388 / 477 | 56–83 | **166–193** | 5 / 9 |
| guide-ugc-approval | 17 | 201 / 309 / 461 | 60–87 | **172–199** | 5 / 5 |
| comparison | 18 | 395 / 414 / 452 | 46–51 | **172–177** | 3 / 3 |
| specialization | 101 | 290 / 307 / 367 | 48–**110** | 90–150 | **2 / 2** |
| static | 14 | 91 / 546 / 1033 | 20–50 | 70–179 | 259 |

Word counts are approximate. They cover text inside `<main>` and exclude nav, header, footer and scripts, but they include FAQ and CTA text. The inlink counts are unique pages in the crawl linking to the URL, nav and footer included.

---

## 2. Prioritized issues

### CRITICAL

**C1. AggregateRating markup for unverified ratings on 33 pages. [repo + live]**
- **Evidence:** 30 `Course` nodes (`/courses/*`) and 3 `CollegeOrUniversity` nodes (`/universities/*`) have `aggregateRating`. Examples: `/courses/online-ba-amity-online` has `{ratingValue: 4.3, reviewCount: 260}`, and `/universities/amity-online` has `{4.4, 4870}`.
- The page does show "★ 4.3 (260 reviews)", but it displays only two testimonials. No review corpus, collection method or source supports the "260" or "4,870" counts.
- Under §14.10 these figures are retained only as **visible** claims pending verification. The owner rule is: "retaining visible content is not proof that it qualifies for rating/review markup".
- Google's review-snippet guidelines require ratings that are collected from users and visible. Unsupported markup risks a "spammy structured data" manual action that could affect the whole site.
- **Code:** `src/app/courses/[slug]/page.tsx` lines 85–89 and `src/app/universities/[slug]/page.tsx` lines 61–65.
- **Fix:** remove `aggregateRating` from both JSON-LD builders now. Do not reintroduce it until each rating has a verified first-party review dataset. Record the change in the deferred-claims register. The visible stars can stay, per the owner's decision.

**C2. Production is behind the repo, so owner-mandated changes are not live (see §0).**
- The Person byline "Ritika Desai" in schema and HTML on 26 articles breaks §14.4 ("do not invent a named person").
- **Fix:** deploy, then re-crawl the blog pages and confirm `author.@type = Organization` and that `/authors/content-team` returns 200 and is in `static.xml`.

### HIGH

**H1. 101 specialization pages are a thin, templated, near-duplicate cluster.**
- 92 of 101 are single-university pages ("Currently offered by Manipal University Jaipur…"). Their content is a subset of the parent course page: one fee row, the generic course career list (which the page itself says is "not verified as specific to the … track"), and 3 templated FAQs.
- Median 307 words, about 51% boilerplate shingles. 268 page pairs exceed 0.6 Jaccard similarity. The maximum is 0.80 (`b-com-accounting-with-ai` vs `b-com-digital-marketing-with-ai`; also `bba-marketing` vs `bba-digital-marketing`, and `mca-ai-and-ml` vs `mca-ai-and-data-science`).
- Each page has only **2 inlinks** (the hub plus one course page). Titles run up to 110 characters, 76 of them over 60. 25 descriptions contain grammar errors ("with **a Accounting** with AI").
- This is the largest scaled-content risk under §8 (Google's scaled-content-abuse policy).
- **Fix options, in order:**
  - (a) Keep indexable only the 9 multi-university specialization pages plus any specialization with proven query demand. Set the rest to `noindex, follow` and remove them from `specializations.xml`, or consolidate them as anchored sections on the course page (`/courses/x#specializations`).
  - (b) For the specialization pages you keep, add original elective/curriculum detail from the official syllabus.
- Fix the article logic ("a"/"an") in `src/app/specializations/[slug]/page.tsx:23-24` and `src/lib/specializations.ts:76-99`. Shorten the title template to `{Course} {Spec}: Fees & Universities`.

**H2. Blog articles are orphan-like and thin.**
- 22 of 26 posts have **exactly one inlink** (the `/blog` index). Course, guide and specialization pages do not link to articles, and articles do not link to each other contextually.
- Posts run 315–431 words but claim "5–8 min read". For example, `/blog/online-mba-guide` is 388 words and labelled "8 min read".
- Each post's FAQ block repeats its body paragraphs almost word for word.
- **Fix:**
  - Add "Related reading" links from course, guide and comparison pages to the matching posts (for example, MBA course to `online-mba-guide` and `best-online-mba-working-professionals`).
  - Add contextual links between posts.
  - Compute read time from word count (about 200 wpm).
  - Expand or merge the posts under 400 words, prioritising the MBA/BCA/MCA pilot in §8.

**H3. `www.unnatividya.com` serves a full duplicate site (200, not a redirect).**
- Evidence: `https://www.unnatividya.com/` and `/courses` both return 200. `http://www.` returns a 308 to `https://www.` and stops there. Canonicals point to the apex, which limits the damage.
- Cause: the Caddyfile (`deploy/vps/caddy/Caddyfile:36`) has the site block `{$UNNATIVIDYA_DOMAIN}, www.{$UNNATIVIDYA_DOMAIN}` with no redirect.
- **Fix:** split it into a separate block, `www.{$UNNATIVIDYA_DOMAIN} { redir https://{$UNNATIVIDYA_DOMAIN}{uri} permanent }`.

**H4. Open Graph `og:url` points to the homepage on 201 pages; `og:url` and `og:site_name` are missing on 59. [repo]**
- The root layout sets `openGraph.url: host` and `og-default.jpg`.
- Pages that don't define `openGraph` (specializations, guides, comparisons, static) inherit `og:url = https://unnatividya.com`, so social shares are attributed to the homepage and use a generic image.
- Pages that do define `openGraph` (courses, blog, universities) replace the parent object, which drops `og:url`, `og:site_name` and `og:type` (`og:type` is missing on course and university pages).
- **Fix:** add a small `buildMetadata({title, description, path, image, type})` helper that always emits `alternates.canonical`, `openGraph.url = path`, `siteName`, `type` and `images`. Remove `url` from the layout's openGraph.

**H5. The root layout's `alternates.canonical: "/"` leaks to every page without its own canonical. [repo]**
- Live: every 404 (for example, `/courses/does-not-exist` and `/authors/content-team`) and the noindex pages `/lead` and `/shortlist` declare `canonical = https://unnatividya.com`.
- This is harmless today because those pages are noindex or 404, but any future page that forgets to set a canonical will silently canonicalize to the homepage.
- **Fix:** remove `canonical` from `layout.tsx` metadata and set it per page (the helper in H4).

**H6. The descriptions on templated guides are inaccurate and too long. [repo]**
- `online-degree-guides/[slug]/page.tsx:39,49,59` hard-code "at MUJ, SMU, and Amity" in every eligibility and UGC description. That is false for single-university programs: for example, `/online-degree-guides/ma-english-ugc-approval` lists only SMU.
- All 68 eligibility, career and UGC descriptions plus all 18 comparison descriptions exceed 160 characters (they run 166–207).
- **Fix:** build the description from `guide.universities`, cap it at about 155 characters and lead with the answer. Example: "Yes — SMU's Online MA English is UGC-DEB entitled (2023-24 to 2025-26). Check status, NAAC grade and how to verify."

### MEDIUM

**M1. Thin and near-duplicate guide and course clusters.**
- Fee guides: 5 pairs exceed 0.6 Jaccard (`b-com-fees` vs `ba-fees` is 0.72; the MA English, Sociology and Political Science fee guides are about 0.70).
- 9 of 17 UGC guides cover a single university (201–310 words). The MA English, Political Science and Sociology UGC guides are 0.66 similar.
- SMU MA English, Political Science and Sociology course pages are 0.75 similar.
- Eligibility and career guides are well differentiated (median Jaccard ≤ 0.08).
- **Fix:** for single-university programs, merge the fee, eligibility, UGC and career guides into one "Online MA English: fees, eligibility, approval and careers" page and 301 the others to it. Keep separate pages only where 2–3 universities give real comparison value (MBA, BCA, MCA, BBA, B.Com).

**M2. Comparison pages: descriptions of 172–177 characters, 3 inlinks each, and about 53% boilerplate.** The B.Com/BA/BBA "Amity vs SMU" pages are 0.58–0.63 similar. Link each pair from both course pages and from the relevant fee guide. Add a verdict paragraph unique to each pair.

**M3. Robots-blocked `/lead?...` links on every page.**
- Every page links to `/lead?intent=request-callback` and `/lead?intent=talk-to-expert`. There are 188 distinct `/lead?...` URLs in total.
- `/lead` is disallowed in robots.txt, so Google never sees its `noindex`, and these URLs can appear as "Indexed, though blocked by robots.txt" (§8: "Robots blocking is not a substitute for crawlable noindex").
- **Fix:** either open the CTA as a modal button rather than an `<a href>`, or remove `/lead` from robots.txt and rely on the existing `noindex` plus the `X-Robots-Tag` that Caddy already sends. Also use `rel="nofollow"` on the CTA links.

**M4. Structured-data correctness. [repo]**
- *Course list (ItemList on `/courses`):* `itemListElement` contains bare `Course` objects with no `ListItem`/`position`. Three items share the name "Online MBA". Descriptions are fragments like "PG · 24 months · ₹1,80,000". To be eligible for the **Course list carousel** (still supported; it needs at least 3 courses), use `ListItem{position, url}` pointing to the detail pages, or `ListItem{position, item: Course{name, description, provider:{@type:CollegeOrUniversity, name, sameAs: official site}}}`. Make each name unique ("Online MBA — Manipal University Jaipur").
- *Course detail:* Google retired Course *info* rich results (deprecated June 2025; documentation removed 9 Sept 2025), so the `offers`, `timeRequired` and `educationalCredentialAwarded` fields are semantic only. Keep the markup, but drop `aggregateRating` (C1). `offers.url` points to the robots-blocked `/lead?course=…`; use the course URL instead.
- *Article:* add `image` (the cover), `mainEntityOfPage`, a real `dateModified` (it currently equals `datePublished` by construction) and `publisher.url`. The publisher logo is an SVG; supply a PNG at least 112 px wide for safety.
- *BreadcrumbList on blog posts:* position 3 is named after the **category** ("Validity") but points to the post URL. Use the post title, or insert the category as its own level with its own URL.
- *Organization:* `sameAs: []` is empty; add the official social and business profiles. `contactPoint.availableLanguage` lists "Hindi", which is fine for counselling but should be confirmed against the English-only rule.
- *WebSite SearchAction:* Google retired the sitelinks search box in November 2024. It does no harm, but you can drop it.
- *FAQPage:* present on 250 of 260 pages (all guides, comparisons, specializations, courses, blog, home). Google no longer shows FAQ rich results (deprecation notice 8 May 2026; documentation removed 15 June 2026). Keep the visible FAQs for users, and treat FAQPage markup as optional or remove it to cut page weight. Do not project rich-result CTR from it.
- *Job training (`EducationalOccupationalProgram`):* Google suspended this rich result. It is not worth adding for search features.

**M5. Doubled analytics stack, a CSP that blocks GA, and 470 KB of third-party JS on every page. [repo]**
- `src/components/analytics.tsx` loads **both** GTM (`GTM-WK482CFS`) and a direct `gtag.js` (`G-083C6T3WJX`). GTM then loads gtag again (`gtag/js?id=G-083C6T3WJX&cx=c`).
- On the home page, Lighthouse measured 177 + 177 + 116 KB transferred (about 1.4 MB uncompressed) against about 140 KB of first-party JS. "Unused JS" is about 290 KB on every page.
- This probably double-counts `page_view` if GTM also contains a GA4 config tag.
- Separately, the CSP `connect-src` allows `*.analytics.google.com` but not `https://analytics.google.com`. Lighthouse logged a CSP violation for `https://analytics.google.com/g/collect…`, so some hits are blocked.
- **Fix:** use one path (GTM only, with GA4 inside it, or gtag only). Add `https://analytics.google.com` and `https://*.googletagmanager.com` to `connect-src` in the Caddyfile and the Next headers.

**M6. Home-page mobile LCP of 5.4 s (lab, simulated).**
- The LCP element is the hero `<h1>` text. Lighthouse's LCP breakdown shows TTFB of 148 ms and **element render delay of 1,217 ms**. The observed, unthrottled LCP is 1.37 s, against a DOMContentLoaded at 0.28 s.
- Other key pages score 99 (LCP 1.7–2.0 s). CLS is 0 everywhere, and TBT is 65–142 ms.
- The likely cause is main-thread contention from hydration and the third-party scripts in M5, which delays the text paint. Check field data in the Search Console Core Web Vitals report. The public PageSpeed Insights API was over its daily quota, so I couldn't get CrUX data.
- **Fix:** M5 first. Then defer the client-only home widgets (recommender preview, carousels) with `dynamic(..., {ssr: true})` and islands, and confirm with a re-test.

**M7. Titles too long or poorly matched to intent.**
- 148 of 260 titles exceed 60 characters (67 exceed 70): 76 specialization, 19 blog, 17 eligibility, 16 UGC, 8 course and 8 career pages.
- Examples: "Online MA Public Policy & Governance in Leadership and Administrative Thinkers — Fees & Details | Unnati Vidya" (110 characters). "Online MA Journalism Mass Communication from Amity University Online | Unnati Vidya" (80).
- Course titles also lack the money and intent terms people search for (fees, eligibility, year). Patterns are under Quick wins.

**M8. Lastmod sanity.**
- Live: 234 of 260 URLs share the build timestamp. Fixed in the repo (C2).
- After deploying, check that editorial guides (eligibility, career, UGC), which now have **no** lastmod, get a real reviewed date (`guide.lastReviewed` exists in the content, for example "Last reviewed: August 2026"). Also confirm that blog `dateModified` and `lastmod` move only on substantive edits.

**M9. A broken source link.** `/universities/amity-online` cites `https://api-otp.amityonline.com/programs` (an API endpoint that timed out). Replace it with the public program page. The other 45 external source links returned 200.

### LOW

- **L1.** `/courses?stream=…` (4 URLs) and `/compare?add=…` (61 URLs) canonicalize correctly to `/courses` and `/compare`. Stream filters could become curated indexable landing pages later (for example, `/courses/commerce`) if demand justifies them.
- **L2.** Duplicate response headers: `X-Content-Type-Options`, `Referrer-Policy` and two different `Permissions-Policy` values are sent by both Caddy and `next.config`. Keep a single source.
- **L3.** IndexNow: `/indexnow-key` returns the 32-character key, but `/{key}.txt` returns 404. That works only if every submission passes `keyLocation=https://unnatividya.com/indexnow-key`. Confirm `INDEXNOW_KEY_LOCATION` is set, or serve `/{key}.txt`. The empty `src/app/[indexNowKey].txt/` directory is dead code.
- **L4.** `/sitemap.xml` duplicates the index. You can keep it, but list only the index in robots.txt to simplify Search Console reporting.
- **L5.** Static assets: Lighthouse "cache lifetimes" flagged 7–15 KB (SVG badges and logos served with `max-age=0`). Add long-lived caching for `/approvals/*`, `/brand/*` and `/universities/*.svg`.
- **L6.** 404 handling is correct: 404 status plus `noindex`. Only the inherited canonical needs removing (H5). Trailing slashes return a 308 to the non-slash URL, and `http` to `https` is a 308. Uppercase paths return 404, which is fine.
- **L7.** HSTS is `max-age=31536000; includeSubDomains`. Add `preload` once www and subdomains are confirmed HTTPS-only. Responses are gzip-compressed (Caddy `encode zstd gzip`; zstd is used only when the client asks for it). Pre-compressed Brotli for `/_next/static` is optional.
- **L8.** Accessibility (Lighthouse): `/courses` has `<select>` elements without labels, and the course page and `/compare` have colour-contrast failures. Best-practices is 92 everywhere because of console CSP errors (M5). The SEO score is 100 on all 6 pages.
- **L9.** `llms.txt` returns 404. That is fine: it is not a Google requirement (§8).

---

## 3. Lighthouse (mobile, simulated throttling, Lighthouse 13.5, Chrome for Testing)

| Page | Perf | A11y | BP | SEO | LCP | CLS | TBT | JS transfer | Total |
|---|---|---|---|---|---|---|---|---|---|
| `/` | **78** | 100 | 92 | 100 | **5.4 s** | 0 | 142 ms | 620 KB | 765 KB |
| `/courses` | 99 | 95 | 92 | 100 | 1.8 s | 0 | 71 ms | 625 KB | 711 KB |
| `/courses/online-mba-manipal-university-jaipur` | 99 | 96 | 92 | 100 | 1.9 s | 0 | 79 ms | 616 KB | 717 KB |
| `/blog/online-mba-guide` | 99 | 100 | 92 | 100 | 2.0 s | 0 | 96 ms | 613 KB | 716 KB |
| `/compare` | 99 | 96 | 92 | 100 | 1.8 s | 0 | 74 ms | 441 KB | 519 KB |
| `/online-degree-guides/mba-fees` | 99 | 100 | 92 | 100 | 1.7 s | 0 | 65 ms | 614 KB | 704 KB |

About 75% of the JS bytes are GTM plus a doubled gtag (M5). First-party chunks are about 140 KB gzip. On the blog post, the LCP is the cover image, which lacks `fetchpriority="high"`; add `priority` to the cover `<Image>`.

---

## 4. Quick wins for CTR and rich results (2026)

**Rich-result eligibility today:**
- **Breadcrumb:** already on courses, universities, guides, comparisons, specializations and blog. Fix the blog breadcrumb label (M4).
- **Article:** fix the author after deploying, and add `image` and `dateModified`.
- **Organization:** fill in `sameAs` and the logo; it supports knowledge-panel signals.
- **ItemList / Course list carousel:** fix the format on `/courses` (M4).
- **Not eligible:** FAQ (withdrawn May 2026), Course info (retired 2025), review stars (unsupported, C1), sitelinks search box (retired 2024) and job training (suspended).

**Title patterns.** Aim for 50–60 characters before " | Unnati Vidya". Brand-only suffixes can be dropped when space is short.
- Course: `Online MBA, Manipal Jaipur: Fees ₹1.8L, Eligibility 2026`
- Fee guide: `Online BCA Fees 2026: MUJ vs SMU vs Amity Compared`
- Eligibility: `Online MBA Eligibility 2026: Marks, Work Ex, Entrance`
- UGC: `Is SMU Online MA English UGC Approved? (2026 Check)`
- Comparison: `Online MBA: Amity vs MUJ — Fees, Approvals, Verdict`
- Specialization (if kept): `Online MBA in Business Analytics: Fees & Universities`

**Description patterns.** 120–155 characters, answer first, using real numbers from the catalog and no claims that aren't on the page.
- Example: "MUJ's Online MBA costs ₹1,80,000 over 24 months (EMI from ₹X/mo). Graduation with 50% required; no work experience. Compare with SMU & Amity."

**Freshness.** Show "Fees checked {month year}" from the source-check timestamps on course and fee pages, and match it to `dateModified` and `lastmod`.

**Internal links that move CTR and indexing.** Course pages should link to the fee, eligibility and UGC guides for their program, to both comparison pairs and to 2 related blog posts. The blog should link back to the courses. Add a "Popular comparisons" module to `/compare`.

**Search Console steps after deploying (§14.4):**
1. Submit `sitemap-index.xml` only.
2. Use URL Inspection on `/`, `/courses`, one course, one university, one blog post, one fee guide and one comparison.
3. Run the Rich Results Test on the Article, Breadcrumb and ItemList pages.
4. Check "Indexed, though blocked by robots.txt" for `/lead?…` (M3).
5. Watch for "Duplicate, Google chose different canonical" on the specialization and single-university guide pages (H1, M1).

---

## 5. Source code vs live: what to verify after deploying

| Area | Code location | Verify |
|---|---|---|
| Author/Organization byline | `src/app/blog/[slug]/page.tsx:41-45` | `Article.author.@type = Organization`, name exact, url 200 |
| Author profile | `src/app/authors/content-team/page.tsx`, `staticSitemapRoutes` | 200, in static.xml |
| Sitemap lastmod | `src/lib/sitemap.ts`, `catalog-reader.ts:19` | Not all identical; editorial guides get a real reviewed date |
| Blog index title | `src/app/blog/page.tsx:10` | No longer duplicates `/online-degree-guides` |
| AggregateRating | courses and universities `[slug]/page.tsx` | **Still present in the repo: remove it (C1)** |
| Layout canonical and og:url | `src/app/layout.tsx:22-24,40` | **Still present: fix (H4, H5)** |
| Guide descriptions | `online-degree-guides/[slug]/page.tsx:39,49,59` | **Still hard-coded: fix (H6)** |
| Specialization grammar and titles | `specializations/[slug]/page.tsx:23-24`, `lib/specializations.ts` | **Still present: fix (H1)** |
| Analytics duplication | `src/components/analytics.tsx` | **Still present: fix (M5)** |
| www redirect and CSP | `deploy/vps/caddy/Caddyfile:36,44` | **Still present: fix (H3, M5)** |
| IndexNow | `src/app/indexnow-key/route.ts`, `seo-config.ts` | `keyLocation` is used in submissions (L3) |
| Programmatic SEO gating | `src/lib/programmatic-seo.ts` | All candidates are currently "LIVE/indexable" for every course name. Consider gating specializations and single-university guides with the same `indexable` logic |

Sources: [Google Search Central documentation updates](https://developers.google.com/search/updates) (FAQ deprecation 8 May 2026, removed 15 June 2026; course info, estimated salary and learning video removed 9 Sept 2025) · [Course list structured data](https://developers.google.com/search/docs/appearance/structured-data/course) · [Carousel (ItemList)](https://developers.google.com/search/docs/appearance/structured-data/carousel) · [Job training rich results suspended](https://www.seroundtable.com/google-disables-job-training-rich-results-33516.html) · [Course structured data removals overview](https://www.relevantaudience.com/seo/google-removes-structured-data-2025-guide-for-websites/)
