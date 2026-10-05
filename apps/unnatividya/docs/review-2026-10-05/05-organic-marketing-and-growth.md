# Unnati Vidya — organic growth and marketing review

Prepared: 5 October 2026. Scope: organic acquisition, channels, CTR/conversion, measurement and a 90-day / 12-month roadmap for https://unnatividya.com (MUJ, SMU, Amity Online; 30 programs; lead capture via "Apply now").
Inputs: `docs/WEBSITE_IMPROVEMENT_MASTER_PLAN.md` (§8, §10, §14), the repo at `apps/unnatividya` (read-only), the live homepage, and web research (sources are cited inline and listed at the end with access dates).
Constraints followed (owner rules, §14): no fake reviews, no purchased links, no city doorway pages, English only for the first release, byline "Content Team, Unnati Vidya", lead capture only (no booking), and no automated campaigns without separate consent.
No search volumes appear below because I had no Keyword Planner or Search Console access. Demand is described in relative terms, with the way to measure it.

---

## 0. Fix before any promotion (blockers found during this review)

| # | Finding | Evidence | Why it matters | Action |
|---|---|---|---|---|
| B1 | **The live site's WhatsApp link is `wa.me/917303088694`. That is College Vidya's published WhatsApp number.** | Live homepage fetched 5 Oct 2026. The College Vidya contact page lists WhatsApp "7303088694" ([collegevidya.com/contact-us](https://collegevidya.com/contact-us/)). | Any learner who taps WhatsApp is sent to a competitor. This is also a misleading-representation risk. | Remove it or replace it with Unnati Vidya's own number **today**. The repo already has `SHOW_WHATSAPP = false` and a bare `wa.me/` in `src/components/sticky-ctas.tsx`, so the live deployment is older than the repo. Redeploy, then audit every phone number and link on the live site. |
| B2 | The live site still shows "Talk to an expert", "Request a callback" and "Enquire" CTAs. | Live homepage, 5 Oct 2026 | The approved "Apply now" contact-first flow (§14.1) is not live yet, so any funnel data collected now would measure the wrong flow. | Deploy the current build before setting the analytics baseline. |
| B3 | Unsubstantiated trust claims: "1.75L+ learners guided", star ratings of 4.4–4.7, named testimonials, and "Every university pays us the same — advice follows your goals, not commissions." (`src/app/page.tsx:388`) | Live homepage and repo | ASCI's education guidelines and CCPA misleading-ad enforcement require substantiation (see §9). The "pays us the same" line is a factual statement about commercial contracts. "1.75L+" looks like a template carry-over: College Vidya publicly claims "over 1.25 lakh learners" and 2,00,000+ students. | Add these to the §14.10 deferred-claims register. Do not reuse them in any off-site channel (ads, YouTube, social, PR) until they are substantiated. Ask the owner to confirm the commission statement or reword it to a true disclosure such as "We are paid by partner universities when a learner enrols. Payment does not change our rankings, which follow published criteria." |
| B4 | No brand footprint. A `site:unnatividya.com` query on the Bing-backed search tool returned nothing, and a search for "Unnati Vidya" returns other entities (Unnati Vidya+ at vidyaplusai.com, Unnati Education, University Vidya). | WebSearch, 5 Oct 2026 | ChatGPT search draws on the Bing index ([5WPR AI-citation report 2026](https://www.5wpr.com/research/state-of-ai-citations-2026/)). A brand-name collision means branded queries can leak to similarly named sites. | Verify Bing Webmaster Tools and submit the sitemaps. Fill `sameAs` in the Organization schema (`src/app/layout.tsx:54` is empty) once real social profiles exist. Use a consistent name, logo, description and contact details everywhere. |
| B5 | Recognition content cites the UGC-DEB **2025-26** entitled list (`data/guide-content.ts`). UGC has since released the list of HEIs entitled for **2026-27** (August 2026 session); Careers360 reports 113 entitled HEIs. | [deb.ugc.ac.in/Notices](https://deb.ugc.ac.in/Notices); [Careers360 summary](https://www.careers360.com/courses/is-your-online-college-approved-ugc-deb-compliance-check-2026) | Freshness is the site's main differentiator. A stale "UGC approved" claim during admissions season costs trust and AI citations. | Re-verify all 30 programs against the 2026-27 list. Update the "checked on" dates. |
| B6 | No marketing consent is captured. `lib/lead-consent.ts` contains only application follow-up consent. | Repo | The newsletter, WhatsApp broadcasts and any re-engagement campaign cannot use existing leads (§14.1, §14.13, DPDP). | Add a separate, unticked, optional marketing opt-in with its own version and timestamp before starting any owned-audience channel. |
| B7 | Analytics double-count risk. `trackEvent` pushes to `dataLayer` and also calls `gtag()`. If both `NEXT_PUBLIC_GA_ID` and `NEXT_PUBLIC_GTM_ID` are set and GTM fires a GA4 event tag on those custom events, every event is counted twice. | `src/components/analytics.tsx` | Funnel KPIs would be wrong from the first day. | Pick one path: GTM-only (recommended) or gtag-only. Validate in GA4 DebugView. |

---

## 1. Competitive landscape

| Player | Model | Content and tools | Trust signals | Social / community | SEO pattern | Weakness a small honest site can exploit |
|---|---|---|---|---|---|---|
| **College Vidya** | Aggregator, 100+ universities, free counselling with a large advisor team (550–600+ claimed), app | Compare on "30+ factors", "MBA Sorted" quiz, ROI calculator, fake-university list, Q&A pages, university/program pages with "Fees, Reviews & Discount Coupons" ([homepage](https://collegevidya.com/); [SMU BA page](https://collegevidya.com/university/sikkim-manipal-university-online/ba/)) | Expert board, GPTW and Trustpilot badges, "unbiased / no-promotion" claim ([blog, 16 Oct 2025](https://collegevidya.com/blog/Is-college-vidya-really-an-unbiased-education-platform/)), with no clear revenue disclosure | Large YouTube channel ([@CollegeVidya](https://www.youtube.com/@CollegeVidya)), plus Instagram, LinkedIn, FB, X, WhatsApp | Programmatic pages for every university × program, coupon pages, Q&A long tail | Breadth over depth, cashback and coupons ([CV Subsidy, Jul 2024](https://www.londonchannelnews.com/news/college-vidya-launches-innovative-cv-subsidy-initiative-offers-up-to-rs-10000-per-student-for-online-courses20240729160751/)), and an opaque business model. Fee and rating data is rarely dated or sourced on the page. |
| **Shiksha / Careers360** | Large education portals; lead generation plus advertising | Online-MBA hubs listing 75–129+ colleges ([Careers360 online MBA](https://bschool.careers360.com/courses/online-mba)), Q&A at scale ([Careers360 Amity Q&A](https://www.careers360.com/question-i-have-heard-positive-and-negative-about-amity-online-mba-can-anyone-share-the-real-experience-and-advice-if-i-should-go-for-it)), news desks covering UGC notices | Brand age, news coverage, user reviews and ratings | Strong news and social presence | Domain authority, news freshness, Q&A long tail. They are each other's main competitor (Similarweb, May 2026). | Generic, high-ad-load pages. Q&A answers are often thin. Little per-program, per-category cost detail. |
| **Online Manipal (MUJ/SMU official)** | University platform (also lists MAHE) | Large blog with author bylines and dates, career and "Learners Speak" stories, convocation news ([blog](https://www.onlinemanipal.com/blogs)), "Jumpstart" LMS orientation | Official source, NAAC/UGC credentials, learner stories with names | YouTube, Instagram, LinkedIn, FB, WhatsApp. Third-party LMS walkthroughs exist on YouTube ([example](https://www.youtube.com/watch?v=hLv8-HwaiIE)). | Owns the branded and official-fee SERPs | Can't compare honestly against Amity. The blog is broad lifestyle and career content rather than decision support. |
| **Amity Online (official)** | University platform | Program pages, LMS app ("Amigo"), offline-class option mentioned in reviews | Official, NAAC claims (note: the A+/3.51 widely quoted is Amity Noida, a different entity from Amity University Rajasthan, per UV's own research in `data/guide-content.ts`) | Heavy paid and social activity | Owns branded queries | Same: no neutral comparison. Entity confusion is a real learner question UV already answers. |
| **upGrad** | OPM / edtech partner (OPJGU, Liverpool, etc.) | Free masterclasses, webinars, free degree counselling ([masterclass](https://www.upgrad.com/free-masterclass/); [degree counselling](https://www.upgrad.com/us/degree-counseling/)) | Global partner brands | Webinar-led funnel | Program landing pages plus free-course SEO | Not focused on MUJ/SMU/Amity. Webinars are a channel model worth copying (education first). |
| **distanceeducationschool.com and long-tail clones** (pwmedharthi, collegesathi, learningroutes, distanceeducation360, kollegeapply, edifyedu…) | Small lead-generation sites | "University X program Y fees 2026" pages, "honest review from Quora/Reddit" posts | Big review badges (for example "4.7 Google rating, 1027 reviews" ([reviews page](https://distanceeducationschool.com/distance-education-school-reviews/))) | Mostly none | Pages built to match exact queries. **For "online MBA Manipal University Jaipur fees 2026" the SERP is almost entirely these sites, quoting conflicting figures (₹1.53L–₹1.80L)** (WebSearch, 5 Oct 2026). | Undated, unsourced and conflicting fees. This is UV's clearest opening. |

**Where Unnati Vidya can win**

1. **Verified, dated, sourced facts on three universities.** UV already does things competitors don't: per-claim source URLs, "unconfirmed" flags, separation of the Amity Noida and Amity University Rajasthan entities, and domestic vs. NRI fee categories. Make this visible in titles and snippets ("checked 3 Oct 2026, official sources").
2. **True total cost.** Tuition, registration, exam, alumni and other mandatory fees, EMI conditions and NRI category fees, all from the category-fee JSONs already in `docs/`. Nobody presents all-in cost consistently.
3. **Honest comparisons of only three universities.** Depth (curriculum, exams and proctoring, live vs. recorded classes, refund rules) instead of 100-university breadth.
4. **Working-professional decision support.** Time budget, exam logistics, employer and government-job validity, and WES for NRIs. Blog posts on these topics already exist.
5. **Transparency as the brand.** Publish how UV is paid, ranking criteria, the corrections log and "how we verify" (`/how-we-verify` exists). In 2025–26, UGC and PIB warnings about misleading EdTech advertising and illegal franchise arrangements ([Entrepreneur India summary](https://www.entrepreneurindia.com/blog/en/news/ugc-alert-franchise-model-between-edtech-companies-universities-not-permitted-students-advised-to-verify-recognition.60758); [IBTimes, 2026](https://www.ibtimes.co.in/beware-fake-degrees-government-identifies-32-fake-universities-targets-misleading-edtech-ads-904482)) make honesty a commercial advantage.

**Avoid:** coupon or cashback pages, "#1 / best" claims without published criteria, review badges of uncertain origin, programmatic university × city pages, and copying competitors' 100-university breadth.

---

## 2. Keyword and intent opportunities (mapped to existing URLs)

No volumes are given. Relative demand is inferred from SERP crowding and competitor investment, and needs validation. Measure with: (a) Google Keyword Planner (ranges, India, English), (b) Google Trends (India, 5-year, compare "online MBA" vs "distance MBA", and MUJ vs SMU vs Amity terms; watch the Jan/Feb and Jul/Aug intake peaks), and (c) **Search Console impressions once the property has 8–12 weeks of data**, which is the only reliable source for this site.

### Awareness / problem (high volume, high AI-Overview exposure, low conversion)
- "is online degree valid for government jobs", "online degree vs regular degree", "ugc approved online degree list", "naac vs ugc-deb vs aicte", "online mba vs distance mba", "can I do online degree while working", "wes evaluation online degree india"
- Existing URLs: `/blog/*` (government-jobs, WES, NAAC/UGC/AICTE, MBA vs distance MBA), `/online-degree-guides/*-ugc-approval`
- Note: there are two overlapping posts ("Are online degrees valid for government jobs in 2026?" and "Is an online MBA valid for government jobs?"). Differentiate them (general vs. MBA-specific with PSU/bank examples) or consolidate them, to avoid cannibalization.

### Consideration / research (medium volume, high fit for UV)
- Program-level: "online mba eligibility", "online bca after 12th", "online mca for non-maths graduates", "online msc data science eligibility", "online ma jmc careers" → `/online-degree-guides/*-eligibility` and `*-career-scope` (17 programs × 3 guide types = 51 guides)
- Best-for: "best online mba for working professionals india", "online mba under 1 lakh / 2 lakh" → existing blogs, plus a **cost-ranked table generated from verified fees**
- Specialization: "online mba business analytics manipal", "amity online mcom fintech" → `/specializations/*`
- Format and experience: "manipal online exam pattern / proctored exam", "amity online live classes or recorded", "smu online assignment" → **gap**: new "How exams and classes work at X" pages per university
- NRI: "online mba for nri india", "manipal online international fees", "amity online fees for nri in usd" → **gap**: the dedicated NRI fee section and guides required by §14.8. Low competition, high value.

### Comparison / evaluation (lower volume, high intent; UV's strongest position)
- "manipal jaipur vs amity online mba", "smu vs muj online", "amity online vs manipal online bba", "muj online mba vs smu online mba" → `/compare/[course]/[pair]` (public editorial pages) and comparison blogs
- "amity online mba review", "manipal online mba review", "smu online review" → a **review-intent page per university**. Write it as a sourced "what learners should know" (pros/cons, complaint themes, refund rules), not fake reviews. Competitors fill this space with unattributed "Quora/Reddit" summaries ([learningroutes example](https://www.learningroutes.in/blog/amity-online-mba-review)).

### Decision / transactional (lower volume, highest conversion)
- "online mba from manipal university jaipur fees", "smu online ba fees", "amity online mba fees 2026", "manipal online mba emi", "no cost emi online mba", "amity online admission last date", "documents required for manipal online admission" → `/courses/[slug]` (fee section), `/tools/emi-calculator`, the documents-checklist blog, and **a new admission-deadline / intake calendar page** (sourced, with expiry)
- "manipal online mba scholarship", "amity online mba refund policy" → course pages, with clear "Confirm with university" where data is missing

### Brand
- "unnati vidya", "unnati vidya reviews", "unnatividya compare". Track brand-name impressions in GSC as a health KPI (see §5).

### Prioritization formula once Search Console has data
Score = (impressions × intent weight × achievable-CTR uplift) ÷ effort.
- Intent weights: decision 3, comparison 3, consideration 2, awareness 1.
- Weekly GSC export (Performance → Queries × Pages, 28 days, India + other countries for NRI):
  1. **Quick wins:** queries at average position 4–15 with impressions in the top quartile → improve the title/H1/intro and add a missing table or FAQ.
  2. **CTR gaps:** position 1–5 but CTR below the site median for that position band → rewrite the title and description.
  3. **Missing pages:** queries with impressions but no matching page (a long-tail query landing on the home page) → new page only if the intent is distinct and verified data exists.
  4. **Cannibalization:** two or more URLs alternating for the same query → consolidate or differentiate.
- Join GSC landing pages to GA4 key events (§5) so priority follows qualified leads, not clicks.

---

## 3. Organic channels beyond SEO

| Channel | What to do | Cadence (lean team) | Guardrails |
|---|---|---|---|
| **YouTube** (long form plus Shorts) | Explainers that mirror the top pages: "MUJ vs SMU vs Amity online MBA: true total cost (official sources)", "Is an online degree valid for govt jobs — the UGC rule explained", "How online exams work at X", "NRI fees explained". Screen-recorded walkthroughs of UV's own tools (EMI calculator, recommender). **University LMS demos only with written university permission.** Avoid unauthorised third-party LMS recordings. Publish transcripts and embed each video on the matching page. | 1 long video every 2 weeks and 2 Shorts a week from month 2 | Show on-screen source and checked date for every fee. Disclose the commercial relationship in the description. English-first per §14.9; competitors' video is largely Hindi/Hinglish, so a Hindi video pilot is a **separate owner decision**. |
| **Instagram / LinkedIn** | Carousels: "₹ all-in cost of X", "3 questions before choosing an online MBA", "UGC-DEB check in 60 seconds". LinkedIn targets working professionals and HR (time-budget posts, employer-acceptance explainers). | 3 posts a week (repurposed) | Fill Organization `sameAs` only after real profiles exist. No stock "student" testimonials. |
| **WhatsApp Channel** (one-to-many, follower opt-in) and WhatsApp Business for 1:1 service | Channel: intake deadlines, UGC notices, new guides. 1:1: reply to learner-initiated chats. | 2–3 updates a week | **Marketing templates need explicit opt-in.** Meta pricing in India since 1 Oct 2026: marketing ₹0.8631 per delivered message; utility and service ₹0.115 after 1,000 free service messages per number per month (+18% GST) ([Business Standard, 1 Oct 2026](https://www.business-standard.com/amp/world-news/whatsapp-business-pricing-changes-from-today-what-indian-firms-should-know-126100100165_1.html)). Fix B1 first. |
| **Quora / Reddit** | Helpful answers to "Is SMU online MBA worth it?" and "Amity Online vs Manipal Online?" that quote official sources, with a link only when it adds a table or tool the answer lacks. | 5 answers a week | Disclose affiliation in every answer ("I work with Unnati Vidya, which is paid by partner universities"). Use Reddit's Brand Affiliate tag where offered. Follow each subreddit's rules (most expect roughly 90% non-promotional participation) ([summary](https://redship.io/blog/reddit-self-promotion-rules)). Never astroturf or use multiple accounts. |
| **Email newsletter** | Monthly "Online degree update": UGC notices, fee changes detected by the weekly source checks (§14.12), intake deadlines | Monthly; fortnightly in peak season | Separate marketing opt-in (B6), double opt-in, one-click unsubscribe. Never send to step-1 leads who only gave application consent. |
| **Webinars** (live, recorded with consent) | "Choosing an online MBA as a working professional", "NRI guide to Indian online degrees". Invite a university admissions officer if permitted. | Monthly from month 3 | Registration is lead capture through the same Apply-now or a separate event consent. No booking calendar (§14.13). The recording becomes a YouTube video with a transcript. |
| **Partnerships** | HR communities, employer L&D teams (degree-sponsorship explainers), CA/CS/bank-exam coaching networks, NGOs for working women, Gulf-region Indian associations (NRI) | 4 outreach emails a week | Disclose commercial terms. No paid links. Partner pages must be useful (for example an "Employer guide to sponsoring online degrees"). |
| **PR / linkable assets** | (1) **"True total cost of online degrees at MUJ, SMU and Amity, 2026-27"**, built from the verified category-fee data, with methodology and a downloadable CSV. (2) **"Recognition register"**: program × UGC-DEB 2026-27 × NAAC × AICTE, including the entity nuances. (3) **"Online degree intake calendar"**. (4) Annual "What changed in online degrees this year" (UGC notices, fee changes). Pitch to education journalists (Careers360 News, Shiksha news, ET Education, The Hindu EducationPlus) and to Wikipedia talk pages only where policy allows. | 1 asset a quarter | Data must come from the reviewed catalog. Publish corrections. Never pay for placement unless it is labeled sponsored and nofollow/sponsored. |
| **Google Business Profile** | **Likely not eligible.** GBP requires in-person contact with customers during stated hours. Online-only businesses and lead-generation agents are excluded ([Google policy overview](https://support.google.com/business/answer/13762416?hl=en)). | — | Create one only if there is a genuine staffed office that receives learners. Never use a virtual office. |
| **Review platforms** (Trustpilot, Google, etc.) | Invite every learner who used the service (not selectively), after a service interaction | Ongoing, once a real customer base exists | No incentives that are conditional on a positive review, no gating, no seeding. Show review markup only per Google's review-snippet rules (§12). |
| **Referral program for enrolled learners** | "Share Unnati Vidya" link with a modest, disclosed thank-you | Phase 2+ (after university contract review) | Referrer shares a **link**. Never collect a friend's phone number (DPDP: the friend hasn't consented). Disclose the reward per ASCI material-connection rules. Check that university agreements allow it. No cash-for-lead schemes that encourage spam. College Vidya runs a "Refer & Earn" ([page](https://collegevidya.com/refer-and-earn/)). |
| **Alumni stories** | Written and video stories of real learners: why they chose, how they managed workload, what it cost | 1 a month once available | Written consent (name, photo, use, duration, withdrawal). Mark any incentive. No salary or placement outcome claims without evidence and the "past record is no guarantee" disclaimer (ASCI). |

---

## 4. CTR, conversion and AI-search visibility

### Title and description patterns (test via GSC CTR, one template change at a time)
- Fee page: `{Program} at {University} Fees 2026-27: ₹{total} total, EMI & NRI fees | Unnati Vidya`. Description: `Official fee breakup checked {date}: tuition, exam & other charges, EMI terms, international fees. Sources linked.`
- Comparison: `{Uni A} vs {Uni B} Online {Program}: fees, exams, eligibility compared (2026)`.
- Validity: `Is an Online Degree Valid for Government Jobs? UGC Rule Explained (2026)`.
- Review intent: `{University} Online {Program} Review: pros, cons & what learners should check`. Describe it as a sourced review, never with invented star ratings.
- Use real numbers and dates in titles only when they come from published, verified data and refresh automatically from the admin-published revision. A stale year in a title hurts CTR and trust.

### On-page conversion (lead capture only)
- Put the decision summary first (total cost, eligibility check, recognition status), then a contextual **Apply now** that carries course and university context into step 2 (already planned).
- Tool → Apply bridges: EMI calculator result → "Apply now for {program}". Recommender results → Apply now (public, no gate). Comparison gate copy states plainly what is unlocked and why.
- Disclose before the step-1 save that details are kept for follow-up (already specified). Do not add urgency timers or "only X seats left" unless verified.

### Discover / Google News
- Probably not worth targeting. UV is not a news publisher. A UGC-notice explainer could occasionally surface in Discover, but don't plan around it.

### AI search (Google AI Overviews / AI Mode, ChatGPT, Perplexity)
- Google says there are no special requirements or optimizations for AI features; standard SEO and people-first content apply, and that traffic is counted inside Search Console "Web" ([Google, updated 10 Dec 2025](https://developers.google.com/search/docs/appearance/ai-features)).
- Impact: Seer Interactive (5.47M queries, Jan 2025–Feb 2026, published 24 Apr 2026) found organic CTR of 2.36% when an AI Overview is shown vs. 3.82% without one. **Being cited in the AI Overview gave about 120% more organic clicks per impression than not being cited** ([Seer](https://www.seerinteractive.com/insights/aio-impact-on-google-ctr-2026-update)). Expect awareness queries such as "is online degree valid" to lose clicks. Decision and fee queries are less affected.
- How to be cited:
  - Answer in the first 1–2 sentences.
  - Put the fact in an HTML table with units, currency and category.
  - Cite the official source and the checked date on the page.
  - Keep stable URLs.
  - Use Organization, Article and Breadcrumb schema that matches visible content.
  - Get indexed in Bing (ChatGPT) and keep robots open to search crawlers. Current `robots.ts` allows all user agents. If the owner wants to opt out of AI *training* while staying in AI *search*, distinguish GPTBot from OAI-SearchBot and Google-Extended from Googlebot.
- Vendor studies report very little overlap between the domains ChatGPT and Perplexity cite, and heavy Reddit citation in Perplexity ([5WPR 2026](https://www.5wpr.com/research/state-of-ai-citations-2026/)). These are vendor studies; treat them as directional. Disclosed, genuinely helpful Reddit and Quora presence therefore also feeds AI answers.
- Measure: GA4 referrals from chatgpt.com, perplexity.ai, gemini.google.com and copilot.microsoft.com (build a channel group "AI assistants"). Each month, manually check about 20 tracked prompts, for example "online MBA fees Manipal Jaipur" and "is Amity Online UGC approved", and record whether UV is cited. No claims of guaranteed inclusion.

### Brand search growth
- Brand-name collision (B4) is the main risk. Use "Unnati Vidya" consistently, keep the tagline, logo and descriptions identical, link all profiles from the footer and `sameAs`, and repeat the brand on videos and PR assets. KPI: GSC impressions for queries containing "unnati vidya" or "unnatividya", and direct traffic.

---

## 5. Measurement

**Setup (week 1–2)**
- **GSC:** Domain property via DNS, sitemap index submitted, baseline export (§14.4 checklist).
- **Bing Webmaster Tools:** import from GSC, submit sitemaps, enable IndexNow if the host supports it.
- **GA4:** via GTM only (fix B7). Enable data retention of 14 months. Exclude internal staff traffic. Add cross-domain only if needed. Configure Consent Mode only if a consent banner is introduced. India has no cookie-banner mandate equivalent to GDPR, but DPDP notice and consent apply to personal data (see §9).
- **Key events** (map from existing `trackEvent` names; no PII in parameters):
  - `lead_cta_click` (Apply now click), `wizard_open`
  - **`lead_contact_saved` = primary key event "Step-1 lead"**, ideally confirmed server-side via GA4 Measurement Protocol with the opaque lead reference, so ad blockers and network drops don't hide conversions
  - `lead_preferences_saved` (step 2), `otp_verified` (verified lead)
  - `recommender_completed`, `emi_calculator_used`, `compare_view`, `source_link_click` (trust engagement)
- **CRM join:** store first-touch and last-touch UTM, landing page and referrer on the lead (the admin lead page already shows UTM fields). Staff mark "qualified" and "applied/enrolled" in the CRM. Join with GA4 by lead reference rather than PII.

**UTM conventions** (lowercase, hyphens):
`utm_source` = youtube | instagram | linkedin | whatsapp-channel | newsletter | quora | reddit | partner-{name} | webinar
`utm_medium` = social | video | email | referral | community | pr
`utm_campaign` = {yyyy-mm}-{topic}, for example `2026-11-mba-total-cost`
`utm_content` = {asset-or-placement}, for example `yt-desc`, `ig-bio`, `carousel-3`
Never put names, emails or phone numbers in URLs. Keep internal links free of UTMs.

**Funnel KPIs** (report weekly, review monthly)
1. Organic sessions, split into non-brand and brand
2. Engaged sessions on decision pages (fee, compare, course)
3. Tool use rate (recommender completed, EMI used, compare view)
4. Apply-now start rate (`lead_cta_click` ÷ sessions)
5. Step-1 saved rate (`lead_contact_saved` ÷ starts)
6. Preferences completed
7. Email verified
8. Staff-reached / contact rate
9. Qualified rate
10. Applied/enrolled (only where legitimately tracked)

Also track: share of leads from organic vs. other channels, cost per qualified lead for content (hours × rate), and fee and freshness defects found by learners.

**Dashboards:** Looker Studio with GSC, GA4 and a CRM CSV or connector. Pages:
- Acquisition by channel and landing page
- Query clusters (brand / awareness / consideration / comparison / decision)
- Funnel by landing-page type and device
- Content freshness (pages past their review date)
- AI referrals

**Cadence:**
- Daily for the first week after launch: lead delivery and errors.
- Weekly (30 min): GSC quick wins and CTR gaps, new queries, funnel anomalies.
- Monthly (90 min): cluster performance, content plan re-prioritization, channel review, AI citation spot-check.
- Quarterly: topic coverage, linkable-asset results, seasonal comparison (YoY once available).

**Realistic expectations** (no guaranteed numbers)
- A new domain with little authority and no backlinks typically takes 3–6 months to show meaningful non-brand impressions and 6–12+ months to compete on competitive head terms.
- The long-tail decision queries ("X fees", "X vs Y", NRI fees) are the realistic first wins.
- Indexing of all URLs is not guaranteed.
- Admissions seasonality: two intake cycles per UGC-DEB norms (Jan/Feb and Jul/Aug sessions). Compare against the same season, not month on month.
- Expect awareness-query clicks to be reduced by AI Overviews.

---

## 6. Roadmap

### First 90 days (Oct 2026 – early Jan 2027, aligned to the Jan/Feb 2027 intake)

**Weeks 1–2: foundations**
- Fix B1–B7.
- Deploy the Apply-now build.
- GSC, Bing and GA4/GTM validated, with baseline saved.
- Re-verify recognition against UGC-DEB 2026-27.
- Claims register (B3).
- Publish a "How we're paid / how we rank" disclosure page and link it from the footer and every comparison.
- Create YouTube, LinkedIn, Instagram and WhatsApp Channel profiles with identical branding, then fill `sameAs`.

**Weeks 3–6: decision content sprint (pilot clusters per §8: MBA, BCA, MCA)**
- 2 pieces a week:
  - MBA total-cost table across MUJ/SMU/Amity (domestic and NRI)
  - "How exams work" per university
  - Intake calendar
  - MUJ vs SMU online MBA comparison
  - Amity Online MBA "what to check" review-intent page
  - BCA after 12th eligibility refresh
  - MCA for non-maths graduates
- 1 YouTube long-form explainer every 2 weeks, plus 2 Shorts a week cut from it.
- 5 disclosed Quora/Reddit answers a week.

**Weeks 7–10: refresh and distribute**
- Refresh the 51 guides and the existing blogs, worst GSC performers and stalest dates first.
- Merge or differentiate the duplicate government-jobs posts.
- Launch linkable asset #1, "True total cost of online degrees at MUJ, SMU & Amity 2026-27", and pitch it to 15–20 journalists and education newsletters.
- Run the first webinar (MBA for working professionals).

**Weeks 11–13: optimize**
- First GSC-driven title/description tests.
- Internal-link pass: every guide to its fee page, compare page and Apply now.
- Launch the monthly newsletter, opt-in only.
- 90-day review: KPI baseline vs. now, decide on the next clusters.

**Steady weekly cadence after week 2:**
- 2 new or refreshed pages
- 1 long video every 2 weeks and 2 Shorts
- 3 social posts
- 5 community answers
- 3–4 partner or PR outreach emails
- 1 GSC review
- Source-check review queue (weekly default per §14.12)

### 12 months
- **Q1 (Oct–Dec):** as above, plus Jan intake season content.
- **Q2 (Jan–Mar 2027):**
  - Expand to the remaining clusters: BBA, B.Com, MA set, MSc Data Science/Maths.
  - NRI and international fee guides (§14.8) plus NRI partner outreach (Gulf-region associations).
  - Linkable asset #2: Recognition register.
  - Monthly webinars.
- **Q3 (Apr–Jun 2027):**
  - Prepare the Jul/Aug intake: deadline pages, "what changed for 2027-28" once UGC publishes the new list.
  - Alumni stories with consent.
  - Employer and HR partnership pages.
  - **DPDP full-compliance deadline 13 May 2027:** consent records, notices, rights handling.
- **Q4 (Jul–Sep 2027):**
  - Linkable asset #3, an annual "online degrees in India" data review.
  - Review platform invites, once there is a genuine customer base.
  - Referral program pilot, if contracts allow.
  - Consider a Hindi pilot and university expansion as **separate owner decisions** (§11 phase 6).

### Team and skills (lean)
- **Content editor / researcher (1 FTE):** source verification, writing, CMS drafts. The editor role already exists in §14.11.
- **Admin / publisher (owner or senior, part-time):** approvals.
- **Video and social producer (0.5 FTE or freelance):** screen-recording, editing, Shorts, carousels.
- **SEO and analytics (0.25 FTE or fractional consultant):** GSC, GA4/GTM, dashboards, technical fixes with engineering.
- **Community and outreach (0.25 FTE, can be the editor):** Quora/Reddit, PR, partnerships.
- **Compliance review (periodic legal/advisor):** claims, disclosures, DPDP, TRAI.

**Budget-light options:**
- Free tools: GSC, Bing WMT, GA4, Looker Studio, Keyword Planner (via a free Ads account), Google Trends.
- Phone screen recording for video.
- Canva templates for carousels.
- WhatsApp Channel, which is free to broadcast, unlike paid API marketing templates.
- Repurpose one research piece into 5–8 assets.
- Skip paid SEO tools for the first 90 days; GSC data is enough.

---

## 7. Compliance and ethics checklist

1. **ASCI Guidelines for Advertising of Educational Institutions, Programmes and Platforms** ([PDF](https://www.ascionline.in/wp-content/uploads/2023/05/ASCI-GUIDELINES-FOR-EDUCATIONAL-INSTITUTIONS-PROGRAMMES-AND-PLATFORMS.pdf)):
   - Recognition claims must be substantiated and must name the authority.
   - No implied job, salary or promotion guarantees without substantiation.
   - No "100%" abstract claims.
   - Placement or outcome ads need the "past record is no guarantee of future prospects" disclaimer.
   - This applies to UV's own ads, social posts and video, not only partner content.
2. **CCPA Guidelines for Prevention of Misleading Advertisement in Coaching Sector, 13 Nov 2024** ([TaxGuru summary](https://taxguru.in/corporate-law/ccpa-guidelines-target-misleading-coaching-advertisements.html)). Strictly these cover coaching centres, but they show how CCPA enforces against education ads: written consent for testimonials, same-size disclaimers, no guaranteed success, and penalties already levied. Apply the same standard.
3. **UGC warnings:** franchise arrangements between EdTech firms and universities are not permitted. Students are told to verify recognition on UGC-DEB ([summary](https://www.entrepreneurindia.com/blog/en/news/ugc-alert-franchise-model-between-edtech-companies-universities-not-permitted-students-advised-to-verify-recognition.60758)).
   - Make clear that UV is an information and referral service.
   - Fees are paid to the university.
   - Admission is decided by the university.
   - Never imply UV awards or "partners on" the degree.
4. **Disclosure of commercial relationships.** Publish how UV earns money (referral or commission from universities, if true) on the site and in every off-site profile and answer. Comparisons and rankings follow published criteria, and paid placement, if ever used, is labeled. Influencers and partners who receive anything of value must disclose (#ad / platform tags) per ASCI influencer guidelines ([ASCI social](https://www.ascionline.in/social/guidelines/)).
5. **DPDP Act 2023 / Rules 2025** (notified 13 Nov 2025; consent-manager provisions 13 Nov 2026; full obligations 13 May 2027) ([timeline summary](https://www.consently.in/blog/dpdp-rules-2025-implementation-timeline-india)):
   - Itemized notice.
   - Separate, granular consent for marketing (B6).
   - Easy withdrawal.
   - Purpose limitation: application-follow-up consent does not cover newsletters or WhatsApp broadcasts.
   - Retention limits.
   - Breach process.
   - No contact data in analytics or URLs (already a plan rule).
6. **TRAI TCCCPR (2nd amendment, 12 Feb 2025):** staff promotional calls must come from registered 140-series numbers, and service or transactional calls from the 1600 series. Respect DND and do-not-contact. Penalties start at ₹2 lakh ([Saikrishna & Associates](https://www.saikrishnaassociates.com/strengthening-consumer-protection-by-trai-amendment-to-the-tcccpr/)). Confirm with a telecom/compliance advisor how this applies to follow-up of consenting leads.
7. **WhatsApp Business Policy:** opt-in before marketing templates, honor opt-outs, no purchased lists.
8. **Google spam policies:** no scaled thin pages (watch the `/admin/programmatic-seo` candidates: publish only pages with distinct verified substance), no link buying, no doorway pages, no site-reputation-abuse placements ([Google spam policies](https://developers.google.com/search/docs/essentials/spam-policies)).
9. **University brand use:** use logos and LMS screenshots only with permission, and summarize rather than copy university content (§14.3).
10. **Testimonials, alumni and reviews:** written consent, real people only, no selective solicitation, no incentives tied to sentiment. Retained legacy items stay in the §14.10 register and are not reused off-site.

This review does not certify legal compliance. The owner should confirm items 1, 4, 5 and 6 with counsel.

---

## Sources (accessed 5 Oct 2026 unless noted)
- College Vidya homepage — https://collegevidya.com/ ; contact — https://collegevidya.com/contact-us/ ; "Is College Vidya unbiased" (16 Oct 2025) — https://collegevidya.com/blog/Is-college-vidya-really-an-unbiased-education-platform/ ; Refer & Earn — https://collegevidya.com/refer-and-earn/ ; YouTube — https://www.youtube.com/@CollegeVidya ; CV Subsidy (29 Jul 2024) — https://www.londonchannelnews.com/news/college-vidya-launches-innovative-cv-subsidy-initiative-offers-up-to-rs-10000-per-student-for-online-courses20240729160751/ ; Inc42 profile — https://inc42.com/startups/how-college-vidya-is-cracking-the-chaos-in-indias-digital-higher-education-space/
- Online Manipal blog — https://www.onlinemanipal.com/blogs ; LMS walkthrough (third-party) — https://www.youtube.com/watch?v=hLv8-HwaiIE
- Careers360 online MBA — https://bschool.careers360.com/courses/online-mba ; UGC-DEB compliance check 2026 — https://www.careers360.com/courses/is-your-online-college-approved-ugc-deb-compliance-check-2026 ; online/ODL equivalence — https://news.careers360.com/online-odl-degrees-equivalent-those-obtained-conventional-mode-ugc
- Shiksha online MBA — https://www.shiksha.com/online-courses/online-mba-courses-certification-training-st491-tg1171
- upGrad masterclasses — https://www.upgrad.com/free-masterclass/
- distanceeducationschool reviews — https://distanceeducationschool.com/distance-education-school-reviews/
- UGC-DEB notices — https://deb.ugc.ac.in/Notices
- UGC franchise warning — https://www.entrepreneurindia.com/blog/en/news/ugc-alert-franchise-model-between-edtech-companies-universities-not-permitted-students-advised-to-verify-recognition.60758 ; PIB release (403 to fetch) — https://www.pib.gov.in/PressReleasePage.aspx?PRID=2295054
- Google AI features guidance (updated 10 Dec 2025) — https://developers.google.com/search/docs/appearance/ai-features
- Seer Interactive AIO CTR (24 Apr 2026) — https://www.seerinteractive.com/insights/aio-impact-on-google-ctr-2026-update
- 5WPR State of AI Citations 2026 — https://www.5wpr.com/research/state-of-ai-citations-2026/
- Google Business Profile policies — https://support.google.com/business/answer/13762416?hl=en
- WhatsApp pricing (Business Standard, 1 Oct 2026) — https://www.business-standard.com/amp/world-news/whatsapp-business-pricing-changes-from-today-what-indian-firms-should-know-126100100165_1.html
- ASCI education guidelines — https://www.ascionline.in/wp-content/uploads/2023/05/ASCI-GUIDELINES-FOR-EDUCATIONAL-INSTITUTIONS-PROGRAMMES-AND-PLATFORMS.pdf ; ASCI social disclosure — https://www.ascionline.in/social/guidelines/
- CCPA coaching guidelines (13 Nov 2024) — https://taxguru.in/corporate-law/ccpa-guidelines-target-misleading-coaching-advertisements.html
- DPDP Rules timeline — https://www.consently.in/blog/dpdp-rules-2025-implementation-timeline-india
- TRAI TCCCPR amendment — https://www.saikrishnaassociates.com/strengthening-consumer-protection-by-trai-amendment-to-the-tcccpr/
- Reddit self-promotion summary — https://redship.io/blog/reddit-self-promotion-rules
- Google spam policies — https://developers.google.com/search/docs/essentials/spam-policies
