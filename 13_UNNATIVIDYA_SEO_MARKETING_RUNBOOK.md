# Unnati Vidya SEO and Marketing Runbook

Status: action document for launch and ongoing growth. This edition is a ground-up rewrite focused on **zero-budget, on-website organic growth from first principles** — every recommendation below is checked against what the code actually does today (not generic advice), and ordered from basic to advanced so you can work through it in order. Off-site channels (social, backlinks, video) are intentionally kept brief at the end — you said you'll come back to those later.

Current implementation status as of 04/08/2026 (verified directly against the code, not assumed):

- **Real indexable pages today: 55.** Sitemap = 11 static routes + 23 course pages + 3 university pages + 6 blog articles + 12 fee guide pages (the 6 blog articles were missing from the sitemap and the 12 fee guides didn't exist at all until this pass — both now fixed, see §5).
- `Organization`, `WebSite`, `Course`, `CollegeOrUniversity`, and `Article` structured data existed; `BreadcrumbList` and `FAQPage` structured data did not exist anywhere despite both breadcrumbs and FAQ content already being visible on every course/university/blog page — also fixed in this pass (see §6).
- **The first real slice of §4's "legitimate scale" plan is now shipped**: `/online-degree-guides` and 12 fee guide detail pages (one per genuinely distinct course name — see §4 for the exact breakdown of comparison vs. single-university guides, and the real data-quality fix this uncovered). A `/admin/programmatic-seo` planning tool tracks the rest of the roadmap and now shows these 12 as `LIVE`/`indexable: true` instead of unbuilt candidates.
- A working, DB-backed 301/302 redirect manager exists (`/admin/redirects`), a content-quality checklist exists (`/admin/content-quality`, advisory only — it doesn't block indexing), robots.txt is minimal and correct (only `/admin`, `/api`, `/lead` blocked, everything else crawlable), and canonical URLs are set on every detail page.
- One architecture thing worth knowing: `/admin/content-quality` and `/admin/courses` read from a **Postgres CMS copy** of your catalog, while the actual public pages, sitemap, and programmatic-SEO tool all read from a **static file** (`src/data/catalog.ts`). These two can drift out of sync. Don't assume "content quality: Ready" in the CMS controls what's actually live — today, it doesn't automatically.
- Remaining launch work is still external/account work: DNS, Search Console/Bing verification values, GA4/GTM IDs, and a Lighthouse pass once production images are in place (see `14_UNNATIVIDYA_ASSET_CHECKLIST.md`).

---

## 1. The mental model: how organic traffic actually gets built with $0

Before any tactics, one framing that should drive every decision below: **Google (and Bing, and now AI answer engines) rewards pages that are the best available answer to a real question, backed by real, verifiable data, that nobody else has assembled as clearly.** With zero budget, you can't out-advertise anyone — but you *can* out-organize and out-verify information better than competitors who are lazier about it. Every section below is in service of that one idea.

The three levers, in order of how quickly they pay off:

1. **Technical SEO** (§2, §5, §6) — make sure Google *can* crawl, understand, and trust every page you already have. This is pure code/config work, it's free, and it's the highest-leverage thing you can do this week because it applies to pages you've *already built*.
2. **On-page content quality** (§3, §7, §8, §9) — make each existing page the most complete, accurate, trustworthy answer for its query. Free, but takes real writing/verification effort.
3. **Scale (more pages, more content)** (§4, §11) — grow the *number* of good pages once you've proven the first two. This is where "thousands of pages" comes in, and why it's ordered last, not first.

Doing #3 before #1 and #2 are solid is exactly how sites get hit by Google's "scaled content abuse" policy (explicitly: mass-producing pages primarily to manipulate rankings rather than help users). Do #1 and #2 first.

---

## 2. Technical SEO fundamentals (do this first — it's free and it's code/config, not content)

These affect every page you already have, right now, with no new content needed.

**Crawlability — confirm Google/Bing can even reach every page:**
- `robots.txt` should allow everything except private routes. Today: `allow: "/"`, disallow `/admin`, `/api`, `/lead`. Correct, leave it as is.
- Every real page needs to be in the sitemap. **Gap found and fixed this pass**: your 6 blog articles existed and were linked from the blog listing page, but were never in `sitemap.xml` or `sitemap-index.xml` — meaning Google would only find them by following an on-page link, not from your sitemap declaration. Now fixed (`/sitemaps/blog.xml` added).
- No orphan pages: every real page should be reachable by at least one `<a href>` link from somewhere else on the site (not just a JS click handler). You're in decent shape here already since course/university pages cross-link.

**Indexability — confirm Google trusts what it crawls:**
- One canonical URL per page, no conflicting signals. You have `alternates.canonical` set on layout, course, university, and blog pages — good. If you ever add server-rendered filter/sort URL parameters to `/courses`, give those a canonical pointing back to the clean `/courses` URL, or Google may index dozens of near-duplicate filtered variants.
- `noindex` anything that isn't a genuine answer to a search query: admin pages (already done), thin auto-generated pages (see §4), and any future search/filter result pages with no unique value.
- Structured data must describe what's *actually visible* on the page — never add a claim in JSON-LD that isn't shown to the user. This is a real Google guideline (structured data spam is a manual-action risk), and it's also just honest.

**Site health — the boring maintenance that quietly kills rankings if ignored:**
- 404s: check Search Console's "Not found" report monthly. Every real 404 from an old/renamed URL should get a redirect — you already have a working redirect manager (`/admin/redirects`) for exactly this.
- Redirect chains: don't redirect A→B→C. Fix A to point straight to C.
- Duplicate content: your course pages differ per course/university (good), but if you ever create near-identical pages (e.g. a "fee" page that just repeats the course page with a different H1), Google will pick one to rank and ignore the other, and may flag the pattern site-wide. This is the same trap as §4.
- Mobile usability: Google indexes the mobile version of your page as the primary version (mobile-first indexing). If it looks broken on a phone, it doesn't matter how good the desktop version is.

**Page experience / Core Web Vitals — free ranking signal, entirely in your control:**
- Largest Contentful Paint (LCP): your biggest image above the fold should load fast. Once real images replace the current Wikimedia placeholders (`14_UNNATIVIDYA_ASSET_CHECKLIST.md`), make sure they're compressed WebP at the sizes specified there — oversized images are the #1 cause of slow LCP on content sites.
- Interaction to Next Paint (INP) — replaced "First Input Delay" as a Core Web Vital in 2024, and is the current standard. Keep JavaScript-heavy interactions (the lead wizard, recommender quiz, course filters) responsive; avoid blocking the main thread with heavy synchronous work on click.
- Cumulative Layout Shift (CLS): don't let images/ads/banners pop in and shove content around after load. `next/image` with explicit width/height (which you're already using throughout) largely prevents this by design.
- Test with **PageSpeed Insights** (free) — run it on your homepage, a course page, and a university page after each major deploy. This uses real Chrome User Experience Report field data when available, not just a lab simulation, so it reflects what Google actually sees from real visitors.

**Structured data — now fixed, verify it stays correct:**
- `BreadcrumbList` and `FAQPage` schema added to course/university/blog pages in this pass (previously missing entirely, despite the visible breadcrumb and FAQ content already existing on every one of those pages).
- Test any page with Google's **Rich Results Test** (free) after changes — it tells you exactly which rich-result eligibility you have or are missing.
- Do not add `FAQPage` schema with questions the page doesn't visibly show, and don't add fake `AggregateRating` numbers — both are explicit Google spam-policy violations with real de-indexing risk, not just "bad practice."

---

## 3. On-page SEO fundamentals (basic, but frequently done wrong)

For **every** page you want to rank:

- **One H1 per page**, matching search intent (you're consistent about this already).
- **Unique `<title>` and meta description per page** — never let two pages share a title. With 23 course pages, this means each one genuinely needs to differ (yours already interpolate course + university name, which is correct).
- Title formula that works for this niche: `{Course Name} — {University}: Fees, Eligibility, Duration [Year]` for course pages; `{University Name}: UGC-Entitled Online Degrees, Fees & Placements` for university pages.
- Meta description: one honest sentence that answers "why click this result" — not keyword-stuffed, written for a human, ideally mentioning the one fact your competitors' listing wouldn't have (exact current fee, or "UGC-entitled" if a query is validity-related).
- **Header hierarchy** (H1 → H2 → H3, no skipped levels) helps both crawlers and AI answer engines parse page structure — you're already close to this with your `detail-section h2` pattern.
- **Internal links use real, descriptive anchor text** — "Compare with Amity" is far more useful (to users, crawlers, and AI extraction) than "click here."
- **Alt text on every image** — required for accessibility, and it's also how Google Images indexes you (free extra traffic source once real photography replaces placeholders).

---

## 4. Answering your question directly: should you have thousands of pages?

**Short answer: not yet, and not via keyword-spinning — but yes, a much larger, *legitimate* page count is exactly the right long-term goal, and there's a concrete, real path to get there from what you already have.**

Here's the reasoning, grounded in your actual data:

**What "thousands of thin pages" gets you (the wrong way):** Google's Search Essentials explicitly define "scaled content abuse" as a violation: generating many pages primarily to manipulate search rankings rather than to help users, "regardless of whether automation, humans, or a combination are involved." A `/online-mba-fees-mumbai`, `/online-mba-fees-delhi`, `/online-mba-fees-pune`... pattern where every page has the *same* content with the city name swapped is the textbook example Google names in its own guidance as a doorway-page violation. This can get an entire site algorithmically demoted, not just the thin pages. With your current catalog, this temptation would look like "one page per course × per Indian city" — **do not do this.** Your fee is the same nationwide (it's an online degree); a city-specific page would have nothing genuinely different to say, which is the exact failure mode Google calls out.

**What actually, legitimately scales page count — because each page has a real, different fact behind it:**

Your own `/admin/programmatic-seo` tool already enumerates the correct next layer, using your real catalog:

| Page type | Real data behind each one | Count |
|---|---|---|
| Course detail | Exact fee, duration, eligibility, curriculum per course+university | 23 (live) |
| University detail | Approvals, rankings, programs, placements per university | 3 (live) |
| Fee guide (per unique course name, e.g. "Online MBA fees") | Genuinely different: shows the *comparison* across all universities offering that course, or a detailed single-university breakdown where only one does | **12 (live — shipped this pass)** |
| Eligibility guide (per unique course name) | Genuinely different eligibility criteria across universities | up to 12 (not built yet) |
| Career-scope guide (per unique course name) | Genuinely different career roles/salary bands per course | up to 12 (not built yet) |
| UGC-approval guide (per unique course name) | Genuinely different approval/accreditation facts per university | up to 12 (not built yet) |
| Comparison page (same course, two universities) | Genuinely different: a real side-by-side of two real fee/duration/outcome sets | 14 (not built yet) |

A real data bug surfaced while building the fee guides, worth knowing about: two courses (Manipal University Jaipur's and Amity's Journalism & Mass Communication programs) were stored with slightly different name strings ("Online MA JMC" vs. "Online MA (JMC)") purely from a copy-paste inconsistency — their `shortName` was already identical. Left alone, this would have silently produced two broken, single-university "guides" instead of one real 2-university comparison, and would have quietly under-counted your catalog everywhere name-grouping is used (this exact `/admin/programmatic-seo` table included). Fixed by normalizing the name — worth keeping in mind: **whenever you add a new course to the catalog, double-check its `name` string exactly matches other entries of the same course type**, or grouping logic like this will silently split it into its own group of one.

Of the 12 fee guides, only **7 are genuine cross-university comparisons** (MBA, BBA, BCA, MCA, B.Com, M.Com, MA JMC — each offered by 2-3 universities). The other **5 are single-university course names** (BA, MA English, MA Political Science, MA Sociology, MA Economics) — for those, a "compare across universities" framing would have nothing to compare, so they're written instead as a detailed cost/scholarship breakdown (fee components, EMI, a scholarship table not shown on the course page, and different FAQs) rather than a thin re-skin of the existing course page. That distinction — comparison framing vs. explainer framing — is the difference between real added value and the "scaled content abuse" trap described above; don't collapse it back into one template if you extend this further.

That's a **ceiling of ~92 legitimately non-duplicate pages from your current catalog**, 38 of which are now live (26 course/university + 12 fee guides) and 54 of which (eligibility/career/UGC guides + comparison pages) are still just candidates in the admin tool with no route built. Building those out is a real content project (verify the comparative facts, write genuinely useful copy per page, not a template with variables swapped), not a code checkbox.

**The actual path to "thousands of pages," honestly:** it comes from growing the real catalog, not from re-slicing the same 23-course dataset more ways. Every additional real university you add multiplies the legitimate page count (more course pages, more comparison pairs, more guide variety). Every additional real course does the same. This is *also* your core business goal (more UGC-entitled programs listed = more coverage = more relevance) — SEO scale and catalog scale are the same growth lever here, which is a genuinely good position to be in. Long-tail blog content (§11) is the other legitimate multiplier, and it's uncapped — but each post needs to be a real, useful, correctly-researched answer, which takes real writing time, not zero effort.

**Recommended sequencing:**
1. Get the current 26 course/university pages to genuinely excellent quality first (§3, §7-9) — this is where your ranking authority starts.
2. ~~Build the fee guide pages for your 12 unique course names~~ — **done this pass**: live at `/online-degree-guides`, linked from every course detail page's Fees & EMI section and from the site footer, and in the sitemap.
3. Build the eligibility, career-scope, and UGC-approval guide pages for the same 12 course names (up to 36 more pages) — same real-data discipline as the fee guides.
4. Build the 14 same-course comparison pages.
5. Only then consider growing the catalog itself for further page-count growth, and/or expanding into genuinely researched long-tail blog content.

---

## 5. Sitemap and indexing hygiene

- Sitemap index at `/sitemap-index.xml` → now correctly references 5 sub-sitemaps: `static.xml`, `courses.xml`, `universities.xml`, `blog.xml`, `guides.xml` (blog and guides were both missing/nonexistent until this pass).
- Whenever you add a new *type* of indexable page (e.g. the eligibility/career/UGC/comparison pages still pending from §4), give it its own sitemap file rather than dumping everything into `static.xml` — this matches the pattern already established (`guides.xml` currently only carries the 12 fee guides; a future `comparisons.xml` should follow the same convention) and makes it trivial to see per-type indexing coverage in Search Console later (Search Console reports coverage per sitemap file).
- Re-submit the sitemap index in Search Console and Bing Webmaster Tools any time you add a new sub-sitemap (not just at launch).
- Use **IndexNow** (already implemented, `/api/admin/seo/indexnow`) every time you publish or meaningfully update a page — it's a free, instant "hey, recrawl this" signal to Bing (and, via Bing's IndexNow partnership, contributes to faster discovery generally). Don't rely on it as your only discovery mechanism — it supplements the sitemap, doesn't replace it.
- Google Search Console's **URL Inspection tool** (free) lets you request indexing for a specific URL manually — useful right after publishing something you want crawled fast, but has a daily quota; don't use it for bulk submission.

---

## 6. Structured data (Schema.org / JSON-LD) — now fixed, keep expanding

Live today, verified against actual page output:

- Every page (via root layout): `Organization`, `WebSite` with `SearchAction`.
- Course pages: `Course`, `BreadcrumbList` (new), `FAQPage` (new, when the course has FAQ content).
- University pages: `CollegeOrUniversity`, `BreadcrumbList` (new), `FAQPage` (new).
- Blog articles: `Article`, `BreadcrumbList` (new).
- Fee guide pages (new): `BreadcrumbList`, `FAQPage` (data-driven questions/answers, different for comparison vs. single-university guides). Fee guide index page: `BreadcrumbList`, `ItemList` of all 12 guides.

Next additions worth doing once the relevant pages exist:
- `ItemList` on `/courses` and `/universities` listing pages (helps search engines understand these are catalog/index pages) — already added on `/online-degree-guides`, still pending on `/courses` and `/universities`.
- `AggregateOffer` or comparison-specific markup once the comparison pages from §4 are built.
- `HowTo` schema is a natural fit for a future "How to apply for an online MBA" style guide, if you write one.

Validate structured data after every change with Google's **Rich Results Test** and the **Schema Markup Validator** — both free, both instant.

---

## 7. Content quality checklist (before publishing or updating any page)

- Every fact (fee, duration, eligibility, approval) is source-backed or manually verified — not guessed, not copied verbatim from a competitor.
- Every page has a "last reviewed" signal somewhere visible (even a small "fees confirmed as of [month/year]" line) — this is both a trust signal for users and a freshness signal for search engines.
- No copied long-form text from any source site — rewrite in your own words even when the underlying facts come from an official page.
- Title, meta description, canonical, and robots directive all confirmed per the rules in §2-3.
- Every FAQ block answers a question a real person would actually type into Google — not an invented question that exists only to stuff a keyword.
- Every page has outbound *internal* links per §8 — no dead-end pages.
- Mobile layout confirmed, no broken CTAs (you already have a mobile smoke test covering structural checks — keep running it before every deploy).

---

## 8. Internal linking and site architecture (the "pillar and cluster" model)

Think of your site as topic hubs, not a flat list of pages:

- **Pillar pages** (broad, high-level): `/courses`, `/universities`, `/online-degree-guides` (live).
- **Cluster pages** (specific, link back to their pillar): every course detail page links to its university and, as of this pass, to its fee guide; every university page links to all its courses; every future eligibility/career/UGC guide page should link to the specific courses it discusses, the same way the fee guides already do.
- **Cross-links between clusters** where genuinely relevant: each fee guide page links back to every course detail page it covers (done); a course page should also link to its comparison pages and its eligibility/career guides once those exist (§4) — this is exactly what `12_UNNATIVIDYA_WEBSITE_IMPLEMENTATION_PLAN.md`'s original internal-linking plan already specifies, and it's still the right model.
- Use real `<a href>` elements for every internal link that matters for SEO — you're already doing this; don't regress into JS-only navigation for anything you want crawled.
- Keep an eye on "click depth" — a page more than 3-4 clicks from the homepage is less likely to be crawled/ranked as important. With ~38-92 pages this isn't a problem yet, but it will matter once you scale per §4.

---

## 9. E-E-A-T and trust signals (Experience, Expertise, Authoritativeness, Trustworthiness)

Google's own quality rater guidelines use E-E-A-T as the lens for evaluating YMYL ("Your Money or Your Life") content — and education/career decisions with real financial commitment squarely qualify. This matters more for you than for a typical content site.

- **Clear aggregator disclosure** — you already have this in your trust-and-conversion section; keep it prominent, not buried.
- **Exact fee with a last-reviewed date** — already planned; make sure it ships on every course page, not just the homepage.
- **Source-backed approvals** — cite where the UGC/NAAC/AICTE status comes from, ideally linking to the official source where possible.
- **Real author attribution on guide/blog content** — you have an author byline pattern already (`Ritika Desai, Senior education counsellor`); keep this consistent and consider adding a short, genuine author bio page if this becomes a recognizable byline across many articles (this is a real, low-effort E-E-A-T signal).
- **No fake reviews, no fabricated testimonials** — you've already made the explicit decision (see `14_UNNATIVIDYA_ASSET_CHECKLIST.md`) to keep sample testimonials as initials-only rather than attach real-looking photos to invented names. Keep this discipline as you add real content — a single fabricated-looking testimonial can undermine trust in everything else on the site if a user (or a Google quality rater) notices.
- **No unsupported placement/salary claims** — every number should trace to a real source or be clearly framed as an estimate.

---

## 10. Answer Engine Optimization (AEO) — the 2025-2026 addition to classic SEO

Traffic increasingly comes from AI answer surfaces (Google AI Overviews, Bing Copilot, and direct citation in chatbot answers), not just the traditional ten blue links. The good news: **the exact things that make a page good for classic SEO also make it easy for an AI system to extract and cite** — this isn't a separate discipline requiring different work, just a reason to be more disciplined about a few things you're already doing:

- **Directly answer the question in the first 1-2 sentences of a section**, then elaborate. AI extraction systems favor pages where the answer isn't buried three paragraphs deep.
- **FAQ sections in clear question/answer pairs** (which you already have, and which now have matching `FAQPage` schema) are exactly the shape AI answer engines prefer to quote.
- **Specific numbers, not vague ranges** — "₹1,75,000 total, ₹7,292/mo EMI" is more quotable and more likely to be cited than "affordable fees."
- **Structured data continues to matter** — it's one of the signals AI crawlers use to understand page content reliably, not just a legacy Google rich-result mechanism.
- No new tooling needed here — this is a content-discipline item, not a code item.

---

## 11. Content strategy: guides and long-tail (the uncapped growth lever)

Once §2-§9 are solid on your existing pages, this is where "more pages" becomes legitimate and valuable rather than risky (see §4).

**Priority order** (highest search-intent match first, based on your own keyword clusters in §12):
1. ~~The 12 fee guide pages per unique course name~~ — **done**, live at `/online-degree-guides`.
2. The eligibility and career-scope guide pages for the same 12 course names (§4) — reuse the same real-data, comparison-vs-explainer split established for fee guides.
3. The 14 same-course comparison pages (§4).
4. Broader guides: "Online degree guide," "UGC-approved online degree guide," one guide per degree type (MBA/BBA/BCA/MCA/etc. — you already have 2 of these live in the blog).
5. Long-tail answer posts targeting specific questions real people search (e.g. "is online MBA valid for government jobs," "online BCA vs online BSc computer science") — each one should be a genuinely useful, complete answer, not a thin excuse to insert a keyword.

**Content freshness**: revisit and update fee/eligibility facts at least once per admission cycle — stale fee data is both an SEO risk (Google can detect and demote outdated YMYL content patterns over time) and a direct trust/conversion risk for a real applicant.

---

## 12. Keyword clusters

Primary degree clusters: Online MBA, Online BBA, Online BCA, Online MCA, Online BCom, Online MCom, Online BA, Online MA, Online MSc Data Science.

Intent modifiers: Fees, Eligibility, Duration, Syllabus, Career scope, Salary, Jobs, Admission process, UGC approved, NAAC, EMI, Scholarship, Working professionals, After BCom, After BTech, After 12th, Best university, Compare.

University modifiers: Manipal University Jaipur, Sikkim Manipal University, Amity Online.

Examples: `online mba fees`, `online mba eligibility`, `online mba for working professionals`, `ugc approved online mba universities`, `online bca after 12th`, `online mca fees`, `online bba amity online`, `manipal university jaipur online mba fees`, `sikkim manipal university online mba`, `amity online bca fees`, `online mba vs distance mba`, `online bca vs online bsc computer science`.

Use **Google Trends** and **Google's autocomplete/"People also ask"** (both free) to validate real search volume/phrasing before committing writing time to a guide — don't guess intent, check it.

---

## 13. Accounts to set up (all free)

- Google Search Console — indexing, query data, Core Web Vitals field data.
- Google Analytics 4 — behavior/conversion tracking.
- Google Tag Manager — manage tracking tags without code deploys.
- Bing Webmaster Tools — Bing's share of search is real and free to capture in parallel.
- Microsoft Clarity — free heatmaps/session recordings, useful for on-site CRO (§14).
- Google Business Profile — only if there's a real business address/phone to verify.

Recommended first-launch set: GA4, GTM, Search Console, Bing Webmaster Tools, IndexNow (already coded), Microsoft Clarity.

---

## 14. On-website conversion optimization (a "marketing technique" that costs nothing and multiplies the value of the traffic you already get)

Getting organic traffic is half the job — turning visitors into leads is the other half, and it's entirely within your control on the website itself:

- **Every page should have an obvious next action** — you already gate this well (Enquire, Compare, Ask the AI). Keep every new page type (guides, comparisons) built with the same CTA discipline.
- **Reduce friction in the lead capture flow** — you already have a multi-step wizard rather than one long form, which is the right pattern (higher completion rate than a single big form).
- **Use Microsoft Clarity session recordings/heatmaps** (free) once you have real traffic, to find where visitors hesitate or abandon — this is free, high-signal CRO research that costs zero budget.
- **A/B test copy, not code, first** — headline wording, CTA button text, and FAQ ordering are cheap to test and often move conversion rate more than a redesign.
- **Track the funnel events already defined below** so you can see *which* pages/traffic sources actually convert, not just which get traffic — traffic that doesn't convert isn't useful to a lead-gen business.

---

## 15. Analytics and event tracking

Track core marketing events:

- `lead_form_start`
- `lead_interest_selected`
- `lead_form_submit`
- `email_otp_sent`
- `email_otp_verified`
- `course_enquiry_click`
- `course_compare_add`
- `compare_unlock`
- `course_filter_change`
- `course_sort_change`
- `recommender_start`
- `recommender_complete`
- `recommender_result_view`
- `university_page_view`
- `course_page_view`
- `outbound_apply_click`
- `phone_click`
- `whatsapp_click`

GA4 conversions to mark: lead submit, OTP verified, recommender complete, compare unlock, outbound apply click if used.

UTM convention:

```text
utm_source=
utm_medium=
utm_campaign=
utm_term=
utm_content=
```

Examples:

```text
utm_source=linkedin
utm_medium=social
utm_campaign=online_mba_guide
utm_content=carousel_1
```

```text
utm_source=quora
utm_medium=answer
utm_campaign=online_degree_faq
utm_content=online_mba_fees_answer
```

(These UTM examples reference off-site channels for when you get to them later — see §17.)

---

## 16. Launch and ongoing checklists

**Launch week — before launch:**
- Verify Search Console and Bing Webmaster Tools.
- Configure GA4 and GTM.
- Configure Microsoft Clarity if using it.
- Confirm all 5 sub-sitemaps resolve (`static`, `courses`, `universities`, `blog`, `guides`).
- Confirm robots.txt and canonical host redirects.
- Confirm SSL.
- Publish home, courses, universities, top course pages, fee guides, blog, and legal pages.

**Launch day:**
- Submit the sitemap index in both Search Console and Bing Webmaster Tools.
- Test 10 high-priority URLs with URL Inspection.
- Check rendered HTML source for metadata, JSON-LD, and content (view-source, not just the visual page).
- Confirm lead form, OTP, and analytics events fire end-to-end.

**First 7 days:**
- Check server logs for 404s/500s; fix broken internal links.
- Check Search Console and Bing indexing coverage.
- Add redirects for any accidental URL variants.

**First 90 days:**
- Weeks 1-2: get all 38 live pages (26 course/university + 12 fee guides) indexed and clean; fix any Search Console coverage issues.
- Weeks 3-4: publish the eligibility and career-scope guide pages (§4, §11) for your highest-intent course names, following the same real-data approach used for the fee guides; add internal links from every guide back to its course pages.
- Month 2: publish comparison pages; add working-professional guides; start long-tail answer posts.
- Month 3: review Search Console query data; rewrite titles/descriptions for pages with high impressions but low CTR; improve pages ranking positions 8-20; add missing FAQs based on real query data (not guesses).

**Every month, ongoing:**
- Export Search Console query/page data.
- Identify high-impression/low-CTR pages and rewrite their titles/descriptions.
- Identify pages ranking 8-20 and improve their content/internal links.
- Check sitemap coverage, noindex/canonical mistakes, and 404s.
- Check page speed (PageSpeed Insights).
- Review lead conversion by page (not just traffic).
- Update fees/facts if sources have changed.

---

## 17. Off-site channels — deferred, for later (kept brief on purpose)

You said you'll come back to these later, so this section is intentionally short — just enough to not lose the earlier thinking:

- **LinkedIn**: course explainers, comparison carousels, fee breakdowns, UGC-approval explainers, linking back to relevant pages.
- **Quora**: answer genuine questions about online degrees; no spammy links.
- **YouTube Shorts/Reels**: 30-60 second explainers, fee comparisons, course-choice tips.
- **Backlinks**: never buy spam links; ask universities/partners for legitimate listing links if allowed; publish resources genuinely worth citing.

When you're ready to pick this up again, each of these should point back at specific pages using the UTM convention in §15, and their success should be measured by the GA4 conversions already defined there — so nothing else needs to change when you do.

---

## 18. Free tools reference

- Google Search Console, Google Analytics 4, Google Tag Manager, Bing Webmaster Tools, Microsoft Clarity — ongoing measurement.
- PageSpeed Insights — Core Web Vitals / page speed.
- Rich Results Test, Schema Markup Validator — structured data validation.
- Google Trends, autocomplete/"People also ask" — keyword/intent validation before writing.

Optional paid, later, once organic traffic justifies the spend: Ahrefs, Semrush, Screaming Frog (paid tier), LowFruits, AlsoAsked.

---

## 19. Source references

- Google Search Essentials / spam policies (scaled content abuse, doorway pages): https://developers.google.com/search/docs/essentials/spam-policies
- Google SEO Starter Guide: https://developers.google.com/search/docs/fundamentals/seo-starter-guide
- Google's E-E-A-T / quality rater guidance context: https://developers.google.com/search/docs/fundamentals/creating-helpful-content
- Google structured data general guidelines: https://developers.google.com/search/docs/appearance/structured-data/sd-policies
- Google Core Web Vitals: https://web.dev/articles/vitals
- Google ecommerce/site-structure guidance, useful for catalog-like course pages: https://developers.google.com/search/docs/specialty/ecommerce
- Google Search Console verification help: https://support.google.com/webmasters/answer/9008080
- Bing sitemap submission guidance: https://www.bing.com/webmasters/help/sitemaps-3b5cf6ed
- Bing Webmaster getting started checklist: https://www4.bing.com/webmasters/help/getting-started-checklist-66a806de
- Bing URL submission and IndexNow guidance: https://www4.bing.com/webmasters/help/url-submission-62f2860b
