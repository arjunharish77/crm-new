# Unnati Vidya: next-phase plan (October 2026)

**Original plan:** 5 October 2026. **Status update:** 8 October 2026. The owner approved the decisions in §11. This file retains the original wave specifications and historical audit baseline; [CURRENT_STATUS_AND_RELEASE_PLAN.md](CURRENT_STATUS_AND_RELEASE_PLAN.md) is the current status and priority index. Increment 73 records Wave 0 as deployed on 5 October, but the current VPS commit has not been independently checked. Waves 1–3 (increments 74–76) are built and locally checked; the owner confirms the latest code has **not** been pushed to the VPS. Nor have prepared catalog proposals thereby become published CMS facts. Search Console/Bing verification and Organization `sameAs` profiles still await owner inputs. The 8 October owner change removed the optional marketing checkbox from Apply now; earlier references to it below are historical. Newsletter opt-in remains a separate footer/article flow.

**Builds on:**
- [WEBSITE_IMPROVEMENT_MASTER_PLAN.md](WEBSITE_IMPROVEMENT_MASTER_PLAN.md): owner decisions in §14 still apply.
- [DESIGN_AND_CONTENT_STANDARD.md](DESIGN_AND_CONTENT_STANDARD.md).
- [IMPLEMENTATION_PROGRESS.md](IMPLEMENTATION_PROGRESS.md): implementation history through increment 76.

**Supporting reviews** (5 October 2026, read-only snapshots; later implementation supersedes some recommendations):

| Report | Covers |
|---|---|
| [01 Status and technical health](review-2026-10-05/01-status-and-technical-health.md) | Done vs left, live vs repo, security, data verification state |
| [02 Content audit and plan](review-2026-10-05/02-content-audit-and-plan.md) | Every blog post, guide family and core page; 52-piece content plan; page templates |
| [03 Learner tools](review-2026-10-05/03-learner-tools.md) | Existing tools' limits; 10 new tools ranked; data each needs |
| [04 Technical SEO crawl](review-2026-10-05/04-technical-seo-crawl.md) | All 260 live URLs, structured data, Lighthouse, title/description patterns |
| [05 Organic marketing and growth](review-2026-10-05/05-organic-marketing-and-growth.md) | Competitors, keyword intents, channels, measurement, 90-day and 12-month roadmap, compliance |

**Fixed rules** (unchanged owner decisions):
- **Apply now** and the contact-first form.
- Only the interactive compare tool is gated by email verification.
- Byline is **Content Team, Unnati Vidya**.
- Three universities only (MUJ, SMU, Amity Online), English only.
- Never invent facts.
- Existing ratings and testimonials stay visible, with verification deferred.
- Publishing is reviewed in the admin panel.
- The recommender uses Groq.
- Lead capture only: no appointment booking.

---

## 0. Historical urgent findings from the 5 October pre-Wave-0 audit

At the time of this audit, the live site appeared to run a build from about **28 September 2026**, and none of the first 72 increments appeared deployed. This is a dated observation, **not** the current release instruction. Use the [current status](CURRENT_STATUS_AND_RELEASE_PLAN.md) and [single VPS runbook](CMS_PUBLISHING_DEPLOYMENT.md) for the next release. The exact current VPS commit still requires confirmation.

| # | Problem on the live site | Why it matters | Fix |
|---|---|---|---|
| **U1** | **Next.js 16.1.6 with a critical remote-code-execution advisory in image optimization (AVIF), and AVIF is switched on.** Live `/_next/image` serves AVIF, so the affected path is reachable. Also 29 more Next.js advisories, including proxy bypasses. | Server compromise risk. | Deploy on **Next.js 16.3.8**. The website's Docker build already resolves 16.3.8 from the shared lockfile, but `apps/unnatividya/package.json` still says 16.1.6, so align it and re-run the website test suites on 16.3.8. If deploying the full update has to wait, a stopgap is to turn AVIF off or block `/_next/image` at Caddy (untested). |
| **U2** | **The homepage WhatsApp link goes to a competitor.** `wa.me/917303088694` is College Vidya's published number. | Your visitors are being sent to a competitor. | The current code already hides WhatsApp (`SHOW_WHATSAPP = false`); deploying removes it. If WhatsApp should stay, it needs your own business number. |
| **U3** | Old content is still live: the expired "July 2026 batch · last date 20 August" banner, "Talk to an expert", "Verify your number" on compare, a named person ("Ritika Desai") as author on all 26 articles, Amity MAJMC at ₹1,30,000 (official: ₹1,90,000), and "1.75L+ learners". | Misleading or stale facts; breaks the owner's byline rule. | All except the MAJMC fee are fixed in the repo and go live with the deploy. The MAJMC fee needs its prepared correction applied in the admin panel (§3). |
| **U4** | **The deploy is a real cutover, not a code swap.** Public pages will read the website database, with no static fallback. | A bad catalog or a database outage would take public pages down. | Follow `CMS_PUBLISHING_DEPLOYMENT.md`: back up (owner choice: none for now), build, run website migrations **0004–0007**, run `check-catalog-ready.js` (must say 3 universities, 30 courses), then start. The live database's catalog rows came from the old sync and may fail the readiness check; I'll check that first and fix the data if needed. A "last good snapshot" fallback is in §8. |

**Historical Wave 0 proposal** (the progress log later records its deployment):
1. Align the website on Next.js 16.3.8 and re-run its smoke suites.
2. Readiness-check the production catalog.
3. Run the four migrations.
4. Deploy.
5. Do a post-deploy check of 30 course pages, the forms and the sitemaps.

The step-by-step VPS commands will be given one at a time, as for the CRM.

---

## 1. Where things stand

**At the 5 October audit:** done in code through increment 72; then not yet live. Later increments and deployment state are in the [current status](CURRENT_STATUS_AND_RELEASE_PLAN.md).
- Contact-first Apply now with email verification.
- Server-validated compare gate.
- Accessible dialogs and navigation.
- URL-based filters on courses, specializations, articles and guides.
- Admin-reviewed publishing: proposals, rollback, working drafts, labelled editors, catalog preview.
- Honest 3-question course matcher (deterministic).
- EMI calculator v1.
- Shortlist.
- Content Team author page.
- How-we-verify page.
- Responsive admin.
- Many accessibility and wording fixes.

**Master plan findings at the 5 October audit, before increments 73–76:**

| Status | Items |
|---|---|
| Done | UV04, UV07, UV09, UV11, UV13 |
| Mostly done | UV10, UV12 |
| Partly done | UV01 (no intake/deadline model), UV02 (no claims register), UV03 (rating markup still emitted), UV05 (no eligibility screening), UV08 (no pagination) |
| Not started | UV06 (Groq), UV14 (`/lead` and `/shortlist` canonical "/"), UV15 (GA and GTM both load), UV16 (Node 20 EOL), UV17 (image copies the whole node_modules), UV18 (in-memory rate limit; hard-coded university IDs and "UGC approved") |

**Data verification (30 courses):** published as verified: **0**.

| Area | State |
|---|---|
| Domestic tuition | Checked for 30/30; 29 agree. The MAJMC correction is prepared. |
| International/NRI fees | MUJ 9 and SMU 9 cross-checked against the 2026-27 prospectus. SMU's NRI applicability is unconfirmed. Amity 12 unresolved. |
| Prepared, not applied | 28 eligibility corrections, 30 curriculum outlines, 1 fee correction (about 59 admin approvals) |
| Held | Amity BA and MUJ MSc Mathematics eligibility |
| Recognition | **5 October research:** 25 direct matches; five Amity programs found only under Amity University Uttar Pradesh and recorded as `unclear` in the evidence. The owner states UP awards those five, so the prepared proposals mark them listed with that attribution. They appear on public pages only after an administrator applies the proposals. See [recognition evidence](UGC_DEB_RECOGNITION_2026-27_2026-10-05.md). |

---

## 2. Trust fixes to existing pages and tools (before adding more)

The content review's headline finding: the site's biggest problems are **false or overclaimed statements and about 100 near-empty generated pages**, not a shortage of articles. Fixing these protects both learners and search rankings. Items marked **[decision]** go through section 11.

| # | Where | Problem | Proposed fix |
|---|---|---|---|
| T1 | Course and university structured data | `AggregateRating` (for example 4.4★ from 4,870 reviews) on 33 pages, but only 2 testimonials are shown. Risk of a Google manual action. | Remove the rating markup; the visible stars stay under the owner deferral. **[decision]** |
| T2 | Every course page | Template values shown as program facts: "15–20 hours/week", "80–90 credits", "Full payment (2% off)", "₹500 application fee", the same two named reviews on all 30 courses, salary bands per role (`careerRoleSalary`) | Show only per-program sourced values. Where none exists, say "Confirm with the university". The ₹500 fee is evidenced for MUJ/SMU domestic only. **[decision]** for the reviews and salary bands, which are close to the deferral. |
| T3 | Comparison pages and the compare tool | Mark a "best" course on unverified rating, placement and specialization count. FAQs and schema say "Yes, both UGC-entitled" and "equal degree validity" while recognition is pending for all 30. University-wide placement figures sit next to program facts. | Remove winner highlighting. Replace validity answers with the dated recognition status. Label university-wide figures as such. Add a differences-only view. |
| T4 | Course listing sort | Default "popular" sorts by review count; "rating" by unverified ratings | Default to relevance and fee; drop the rating sort, or label it. |
| T5 | Homepage, About | "Every university pays us the same", "lowest-fee guarantee", universal no-cost EMI, "every program checked against UGC-DEB", no legal entity or contact on About | Remove or reword, and add a truthful "How Unnati Vidya is funded and how listings are ordered" section. **[decision]** (owner facts needed) |
| T6 | Articles | Factual errors: "Online MBA under ₹1 lakh" (the cheapest is ₹1.2L); Amity MCA eligibility wrong; "confirmed with the universities" for 3 programs that lack evidence; 2025-26 recognition list cited; "widest fee gap" becomes false after the MAJMC correction; new unsourced salary and "10% discount" claims | Correct each one (list in report 02 §c). These are not covered by the deferral, because they are new claims. |
| T7 | Fee guides (17) | "Every university offers no-cost EMI", no sources or dates, fully templated | Rebuild from category fee evidence (§4). |
| T8 | Specialization pages (101) | 92 single-university templated pages (~300 words, half shared), duplicate pairs (`mca-cybersecurity` / `mca-cyber-security`), language mediums treated as specializations, grammar errors ("with a Accounting") | Keep the 9 multi-university pages as enriched topic pages. Set the rest to noindex or fold them into course pages. Merge duplicates with redirects. **[decision]** |

---

## 3. Publish the verified data we already have

Most of the research is done; it just isn't on the pages.

**Admin work (owner or staff, after deploy):** about 59 proposals. For each: **CMS → Course → Edit → Propose or review revisions → Load** (eligibility, curriculum, fee correction) **→ Submit**, then an administrator applies it under **Catalog revisions**. I can prepare a checklist page with links to each one.

**Code work:**
- **Student-category fees:** a Domestic / NRI / International selector on course, fee-guide and comparison pages, using the MUJ (3 categories) and SMU (2) prospectus evidence. Amity shows "Confirm with university" until its categories are confirmed. Original currency, no conversion.
- **Sources and checked dates** visible beside fees, eligibility and recognition on every course page.
- **Recognition status per program** (2026-27), shown honestly as checked or pending, feeding the validity hub (§4 C1).
- **Intake/deadline model with automatic expiry** (UV01): only confirmed dates; "not yet announced" otherwise.
- **Claims register** (UV02): the existing ratings, testimonials and placement figures, with source, status and owner, kept out of recommendation evidence.

**Owner inputs:** written answers from university admissions on:
- Amity's fee categories and its INR 200 instalment differences;
- mandatory extras (exam, convocation, tax);
- SMU NRI applicability;
- the two held eligibility cases;
- the Amity awarding entity (Noida vs Rajasthan);
- current intake dates.

---

## 4. Richer content: pages, articles and guides

### 4.1 Page templates

These are the new section orders for course, university, article and comparison pages (report 02 §d).

**Course page:** decision summary (fee by category, duration, eligibility in brief, next confirmed intake, checked date) → sections → eligibility by category → semester curriculum (from the prepared outlines once reviewed) → how classes and exams work → full fee breakup and payment schedule → recognition (dated) → admission steps and documents (including ABC ID / DEB-ID) → refunds → support → sources → related programs and guides.

**Article:** short answer first, contents, tables, dated source list, related courses and tools, one Apply now.

### 4.2 Existing 26 articles

| Action | Posts |
|---|---|
| Correct facts now | #2, #7, #11, #17, #18, #21, #22, #24 |
| Rewrite into hub articles | #1, #2, #7, #12, #18 |
| Expand with tables and checklists | #4, #6, #8, #13, #14, #15, #19, #20 |
| Differentiate (owner decision 7: no merges) | #3, #5, #10, #11, #16, #17, #21, #22, #23, #24, #26 |
| Keep and fix | #25 |

That leaves about 15 strong posts. Read times are corrected, `dateModified` reflects real revisions, and each article gets its own sources. **[decision]** on merges and redirects.

### 4.3 New content: 8 clusters, 52 pieces (report 02 §b)

Each cluster has one main hub article plus supporting pieces. About 25 are first priority, using evidence that already exists.

| Cluster | Hub article | First-priority pieces |
|---|---|---|
| 1. Recognition and validity | "Is an online degree valid in India? How to check a program's UGC-DEB entitlement (2026-27)", with a status table for all 30 programs | Step-by-step DEB check; online vs distance vs regular; what NAAC/NIRF/AICTE/AIU/WES badges mean; ABC ID and DEB-ID guide |
| 2. Cost and financing | "Online degree fees 2026-27: full cost at MUJ, SMU and Amity (all 30 programs)" | 8 rebuilt fee guides by degree; MBA total-cost comparison; "No-cost EMI: how it works and what to check" |
| 3. Admissions and eligibility | "How to apply: eligibility, documents, intake dates and steps" | Documents checklist (Indian, NRI, foreign); 17 eligibility guides republished with category corrections; intake calendar; bridge courses for MCA |
| 4. How online learning works | "What studying online is really like: classes, weekly hours, exams and support" | Exam pattern and proctoring by university; curriculum on course pages |
| 5. Online MBA hub | "Online MBA at MUJ, SMU and Amity: fees, eligibility, specializations and how to choose" | 3 enriched MBA comparisons; MBA while working; MBA vs MCA for IT professionals |
| 6. Computing and data | "Online BCA, MCA and MSc Data Science: which fits you?" | BCA after 12th; BCA and MCA comparisons |
| 7. Commerce, humanities, media | "Online B.Com, M.Com, BA and MA: options and fees" | B.Com vs B.Com Honours |
| 8. International and NRI | "Online degrees for NRIs and international learners: fees, eligibility, documents" | USD fee tables for 18 programs; country exceptions |
| Trust | Editorial policy, "How we're funded and how listings are ordered", glossary | |

**Not planned:**
- city or state pages;
- "top 10" lists;
- salary rankings;
- other universities;
- Hindi pages (deferred);
- per-specialization career pages without sourced subjects.

**Who writes:**
- I draft each piece from official sources, with a source list and checked date, into the admin or a reviewed code change.
- Your team reviews and approves.
- Facts that need the universities are flagged rather than guessed.

**[decision]** on cadence and on whether pieces are published in code or the CMS.

### 4.4 Editorial workflow

- A claim-level source register.
- Weekly fee checks during intake; recognition each session; evergreen content every quarter.
- A keyword-to-page map so pages don't compete.
- Redirects for merges.
- A corrections log on the Content Team page.

---

## 5. Learner tools

**Fix the existing tools first** (report 03):
- **Compare:** the T3 fixes, plus print/share with IDs only.
- **Matcher:** budget bands from the catalog (7 programs priced ₹1.8–2.75L only appear under "any"); exclude PG for 12th-pass learners; show each result's eligibility; answers in the URL.
- **EMI calculator:** student category, processing fee, and comparison with semester payments.
- **Shortlist:** print, notes and copy link.

**New tools (ranked by learner value × search demand × feasibility):**

| # | Tool | What it answers | Data status | Effort |
|---|---|---|---|---|
| 1 | **Total cost and payment schedule** by student category | "What will I actually pay, and when?" | MUJ/SMU evidence ready; Amity partial; extras unknown (labelled) | M |
| 2 | **Admission document checklist** (printable) | "What do I need ready?" | MUJ admission manual; SMU and Amity to source | S |
| 3 | **Eligibility checker**, with CGPA-to-percentage inside it | "Can I apply to this program?" | 28 reviewed eligibility texts, to be turned into rules | M |
| 4 | **Recognition check** | "Is this program entitled this session, and how do I check it myself?" | Needs the 2026-27 DEB check | S/M |
| 5 | **Online exams and proctoring explainer**, with a device readiness check | "How do exams work, and is my setup OK?" | Official exam pages to source | S/M |
| 6 | **Online vs distance vs regular helper** | "Which mode is right for me?" | UGC regulation text | S |
| 7 | **Weekly study-time planner** (the learner's own hours) | "Can I fit this around work?" | No invented workload data | S/M |
| 8 | **EMI v2:** loan vs university instalments vs upfront | "Which payment route costs least?" | Category fees | S/M |
| 9 | **Recommender v2 → Groq** | "Which programs fit me, and why?" | Builds on #1 and #3; Groq key needed | M + M/L |
| 10 | **Specialization finder by career goal** | "Which specialization matches my goal?" | Catalog plus curriculum outlines | S/M |

**Later or rejected:**
- **Later, when owner data exists:** scholarship finder, intake tracker with opt-in alerts, payback panel (learner's own salary only).
- **Deferred:** career explorer (no sourced outcome data).
- **Rejected:** résumé helper, general chatbot.

Every tool shows its result without a form. **Apply now** comes after the result and carries the course and fee category.

---

## 6. Technical SEO fixes (report 04)

Lighthouse (lab, mobile) currently scores 99 for performance on 5 of the 6 tested pages and 78 on the home page. SEO scores 100 on all six and CLS is 0. All 260 sitemap URLs return 200 with correct canonicals. These are the fixes:

| Priority | Fix |
|---|---|
| Critical | Remove `aggregateRating` (T1). Deploy (U1–U3). |
| High | **www → apex redirect** (www currently serves a duplicate site; Caddyfile change). Specialization pages (T8). Contextual links into articles (22 of 26 are linked only from `/blog`). `og:url` points to the home page on 201 pages; 59 pages lack og tags. Layout `canonical: "/"` is inherited by `/lead`, `/shortlist` and 404s. Guide descriptions say "MUJ, SMU and Amity" for single-university programs. |
| Medium | Merge near-duplicate single-university fee and UGC guides. Stop linking `/lead?…` (robots-blocked; 188 variants) and use a button instead. Structured data: ItemList for the course carousel; drop `offers.url` to `/lead`; Article image and a real `dateModified`; blog breadcrumb; Organization `sameAs` once social profiles exist. **One analytics path** (decision 17 selected GA4-only; increment 76 implemented it). Home LCP 5.4 s in the older audit (retest after deployment). 148 titles over 60 characters in that audit (increment 76 reduced this locally). Broken Amity source link. |
| Low | Duplicate security headers; IndexNow key file; SVG cache headers; HSTS preload; small contrast and label fixes. |

**Rich results in 2026:**
- **Withdrawn or retired:** FAQ rich results (withdrawn May 2026), Course info results, and the sitelinks search box.
- **Still worth doing:** Breadcrumb, Article, Organization, and the ItemList course carousel.

FAQ content stays because learners use it, but don't expect FAQ snippets.

---

## 7. Organic marketing and growth (report 05)

**Before promoting anything:**
- fix U1–U3;
- set up Search Console, Bing Webmaster Tools and the direct GA4 tag chosen in decision 17;
- record a baseline;
- keep **separate marketing consent** in the newsletter sign-up, outside Apply now;
- create the brand's social profiles;
- publish the "how we're funded" page.

A `site:unnatividya.com` search currently returns nothing, and "Unnati Vidya" searches show other businesses.

**Where to win:**
- **Competitors:** College Vidya has 100+ universities and 550+ advisors; Shiksha and Careers360 are large portals. Neither can match deep, **verified, dated, sourced** facts on three universities.
- **What only this site can offer:** full cost including NRI fees, honest comparisons, help for working professionals, and openness about how the site is paid.
- **Search gap:** "MUJ online MBA fees 2026" is dominated by small sites quoting conflicting, undated figures.

**Keyword plan:** searches are grouped by stage, each mapped to existing pages:
- **Awareness:** validity, UGC, WES.
- **Research:** eligibility, exams, NRI.
- **Comparison:** "X vs Y", "X review".
- **Decision:** fees, EMI, deadlines, documents.

Missing pages (exams, intake calendar, NRI fees) are in §4. Once Search Console has data, rank work by impressions × stage ÷ effort, plus quick wins for pages at positions 4–15.

**Channels, budget-light:**
- **YouTube:** explainers and fee breakdowns; university LMS demos only with permission.
- **LinkedIn and Instagram carousels:** reuse the tables.
- **WhatsApp Channel:** opt-in only. Meta's India marketing message price changed on 1 October 2026.
- **Quora and Reddit:** helpful answers that state the affiliation.
- **Opt-in newsletter and a monthly webinar.**
- **Partnerships:** HR and employer learning teams, coaching networks, NRI associations.
- **One data study per quarter that others can cite,** starting with "True total cost of online degrees at MUJ, SMU and Amity 2026-27".
- **Google Business Profile:** probably not eligible (online-only lead generation).
- **Reviews, referrals and alumni stories:** only when real and with written consent.

**Click-through and AI search:**
- Titles carrying verified numbers and checked dates (patterns in reports 04 and 05).
- Answer in the first sentence; use tables, sources and dates.
- Bing indexing.
- Track referrals from AI assistants in GA4, and spot-check about 20 prompts a month.

**Measurement:**
- Main conversion `lead_contact_saved`, confirmed on the server.
- UTMs carried into the CRM lead.
- The funnel: organic visit → tool use → Apply now start → step 1 saved → preferences → verified → contacted → qualified.
- Weekly and monthly reviews, compared by intake season (Jan/Feb, Jul/Aug).
- No traffic numbers are promised before there's a baseline.

**Roadmap:**
- **Weeks 1–2:** fixes, measurement, social profiles.
- **Weeks 3–6:** MBA, BCA and MCA hubs before the January 2027 intake.
- **Weeks 7–10:** guide refresh plus the first data study and webinar.
- **Weeks 11–13:** title tests, internal links, newsletter.
- **Steady weekly cadence after that:** 2 pages, 1 long video every 2 weeks plus 2 Shorts, 3 social posts, 5 community answers, 3–4 outreach emails.
- **12 months:** NRI guides; July 2027 intake; full DPDP compliance by 13 May 2027.

**Team:** a content editor, part-time video and social help, and a fractional SEO/analytics person.

**Compliance** (not legal advice; confirm with counsel):
- ASCI education-advertising rules: no guaranteed jobs or "100%" claims; name the recognising authority.
- Disclose commercial relationships, including influencers.
- Say plainly that admission and fees sit with the university (UGC's EdTech advisory).
- DPDP: separate marketing consent.
- TRAI: 140/1600-series numbers for calls.
- WhatsApp: opt-in for marketing messages.

---

## 8. Engineering backlog (updated after increment 76)

| Item | Needs |
|---|---|
| Groq recommender (source-grounded, deterministic eligibility first) | Groq API key, model choice, budget/limits; after tools #1 and #3 |
| Manual and weekly scheduled source checks that create drafts only | Day, time and timezone; where the scheduler runs |
| Publishing follow-ups: rendered previews, scheduled publication, **persistent** last-good snapshot and cross-request caching | The process-local 24-hour fallback exists (increment 76); persistence across restarts does not |
| External CRM create/update on step-1 save | Target CRM endpoint, upsert contract, test credentials |
| Real email (ZeptoMail) end-to-end check | Production key confirmation, sender domain, a test inbox |
| Node LTS upgrade (Node 20 is EOL) | Target version; done with the CRM |
| Smaller image (UV17); shared rate limit (UV18) | Website CI exists (increment 76); its first GitHub run still needs review |
| Guide CMS editing and review | Increment 76 implemented the blog article CMS, not a guide editor; decision 8 includes guides |

---

## 9. Original wave order and current interpretation

The effort estimates below were planning estimates, not evidence of completion. Waves 1–3 are implemented locally, with the latest code **not yet pushed to the VPS**. Wave 0 is recorded as deployed but its VPS commit should be checked. After the next release, use [CURRENT_STATUS_AND_RELEASE_PLAN.md](CURRENT_STATUS_AND_RELEASE_PLAN.md) for the order of CMS publication, runtime work, tools and content. GA4-only supersedes the older GTM-only proposal in the Wave 0 row.

| Wave | Contents | Rough effort |
|---|---|---|
| **0 · Make the live site safe and current** | U1–U4: Next.js 16.3.8, smoke suites, readiness check, migrations, deploy, post-deploy check; www redirect; analytics was later set to GA4-only | 2–3 days + your VPS steps |
| **1 · Trust fixes** | T1–T8 (after decisions); article factual corrections; claims register | 4–6 days |
| **2 · Publish the data we have** | Admin approvals (your team, with my checklist); category fee selector; sources and dates on pages; recognition status (after the 2026-27 DEB check); intake model | 5–8 days + admin time |
| **3 · Measurement and foundations** | Search Console, Bing, GA4 events, **separate marketing consent and newsletter/WhatsApp opt-in** (decision 9), Organization profile and `sameAs`, editorial and funding pages, technical SEO highs and mediums, **CMS article editor and migration of the 26 posts** (decision 8), process-local last-good snapshot, website CI | 8–11 days |
| **4 · First tools and hubs** | Tools 1–4; content hubs C1, C2, C3, C5 with their first-priority pieces; enriched MBA, BCA and MCA comparisons | 3–5 weeks |
| **5 · More tools and clusters** | Tools 5–10, Groq recommender, remaining first-priority content, NRI hub, scheduled source checks | 4–6 weeks |
| **6 · Ongoing growth** | Weekly content and video cadence, data studies, outreach, quarterly refresh | Ongoing |

Each implementation wave ends with relevant checks and a docs update. The next owner push/deploy concerns the locally completed Waves 1–3 and any earlier code missing from the VPS; Waves 4–6 remain future work rather than part of that same release. Use the [single deployment runbook](CMS_PUBLISHING_DEPLOYMENT.md).

---

## 10. Owner inputs still needed (original list, updated)

1. ~~Approval of this plan and its order~~: given 5 October; decisions are recorded in §11.
2. For the next release: the intended pushed commit and a fresh VPS commit/migration check, followed by the [runbook](CMS_PUBLISHING_DEPLOYMENT.md).
3. Facts:
   - how Unnati Vidya is paid by universities;
   - ~~legal entity and contact details~~ (provided 5 October 2026, §11 #12; phone to follow);
   - ~~whether the advertised services (document pre-check, loans, post-admission support) exist~~ (yes, §11 #13);
   - where the existing ratings, testimonials and learner counts come from.
4. University admissions answers (listed in §3).
5. Access: Google Search Console (DNS verification), Bing Webmaster Tools and the GA4 property, with one person owning analytics. GTM was removed by decision 17.
6. Later: the Groq key; the external CRM contract; ZeptoMail test inbox; social profile handles; a content reviewer on your side.

---

## 11. Questions and answers

Asked one at a time; answers recorded here.

| # | Question | Answer |
|---|---|---|
| 1 | Wave 0: deploy the full current code on Next.js 16.3.8 now (recommended), or a stopgap (AVIF off or block the image endpoint) first? | **Deploy the current code** (5 October 2026): align on Next.js 16.3.8, re-run the website suites, readiness-check the production catalog, run migrations 0004–0007, deploy. |
| 2 | WhatsApp: remove it (the current code does), or add your own business number? | **Remove** (5 October 2026). The deploy removes the competitor link; Apply now stays the contact route. |
| 3 | Homepage claims ("every university pays us the same", "lowest-fee guarantee", "1.75L+ learners", universal no-cost EMI): remove or reword now? (These are separate from the deferred ratings, testimonials and placements.) | **Owner decision** (5 October 2026): <ul><li>Show **"10k+ learners"** instead of "1.75L+".</li><li>Replace "Every university pays us the same" with **"No hidden charges"**.</li><li>**Keep** "lowest-fee guarantee" and the no-cost EMI wording as they are.</li></ul>These are owner-stated claims: record them in the claims register with the owner as source. T5 is reduced to these changes, plus the About page's entity and contact details. |
| 4 | Remove the rating structured data (stars stay visible)? | **Remove the markup, keep the stars** (5 October 2026). |
| 5 | Template values on every course page (weekly hours, credits, 2% off, the same two reviews, salary bands): remove, or label as "not verified"? | **Per-program values only** (5 October 2026). Show a value only where we have it for that program (e.g. ₹500 application fee for MUJ/SMU domestic); otherwise show "Confirm with the university". The two reviews appear only on the course they're actually about (to be identified; if that can't be established, they move to the claims register). Salary bands stay, labelled "indicative, not verified". |
| 6 | Specialization pages: keep the 9 multi-university ones; noindex or fold the other 92? | **Keep all 101 indexable and enrich them over time** (5 October 2026). Wave 1 fixes the grammar ("with a Accounting"), the long titles and the shared template text. Enrichment comes from the curriculum outlines and official program pages, starting with the 9 multi-university pages. Duplicate pairs (e.g. `mca-cybersecurity` / `mca-cyber-security`) stay for now and are raised again when they are enriched. |
| 7 | Merge 11 articles into stronger ones with 301 redirects? | **Keep all 26 and differentiate** (5 October 2026). Each overlapping post is rewritten to answer a distinct learner question and linked to its related post. There are no redirects. The §4.2 "merge" row becomes "differentiate". |
| 8 | Content: who reviews my drafts, how many pieces a week, and do they go through the CMS or code? | **Draft into the CMS** (5 October 2026). Articles and guides move into the admin panel: an article editor with draft → review → publish, the Content Team byline, sources, dates, preview, revisions and rollback, following the existing catalog workflow (about 3–5 days, added to wave 3). The existing 26 posts migrate into it. I draft each piece from official sources into the CMS as a draft; your team reviews and an administrator publishes. Pace about 3 a week unless changed. |
| 9 | Marketing scope: which channels you'll run (YouTube, LinkedIn/Instagram, WhatsApp Channel, newsletter, webinars), and who on your side | **YouTube, LinkedIn + Instagram, WhatsApp Channel + newsletter** (5 October 2026). Webinars and partnerships are not now. Site support: <ul><li>separate marketing consent on the form (needed for the newsletter and WhatsApp updates);</li><li>an opt-in sign-up with confirmation and unsubscribe;</li><li>Organization `sameAs` links to the new profiles;</li><li>video embeds with transcripts on related guides;</li><li>shareable table images for carousels.</li></ul>I'll prepare scripts and outlines from each published piece. Recording and posting are done by your team. |
| 10 | Approve the wave order (§9)? | **Approved** (5 October 2026), with answers 1–9 applied. Wave 0 starts now; each wave is reported before the next. |
| 11 | Homepage "Approvals verified: UGC, NAAC and AICTE status re-checked every admission cycle" is not accurate until the 2026-27 check: reword, keep or remove? | **Reword** (5 October 2026) to "Approvals you can check: we link each program to the official UGC-DEB list and show when we last checked it." Wave 2 adds the per-program UGC-DEB link and the last-checked date. |
| 12 | About page: which legal entity and contact details to show? | **Owner details** (5 October 2026): Unnati Vidya, A-116, URBTECH Trade Centre, Noida, Uttar Pradesh 201304; admin@unnatividya.com. No phone for now (to be added later). Shown in a "Contact us" section on About and in the site-wide Organization structured data (address and email). |
| 13 | Homepage "Support till enrolment: documents, loans and follow-ups handled until your LMS login arrives": do all three services exist? | **Yes, all three** (5 October 2026). The line stays; it is recorded in the claims register as an owner-stated service. |
| 14 | Add a "How we're funded and how listings are ordered" section to About? | **Not now** (5 October 2026). "No hidden charges" stays the only statement; the funding fact in §10 is no longer needed for wave 1. |
| 15 | Five Amity programs (B.Com, BA, BA JMC, M.Com, MA Public Policy) appear on the 2026-27 UGC-DEB online lists only under Amity University Uttar Pradesh. Which Amity university awards them? | **Amity University Uttar Pradesh (Noida)** (owner, 5 October 2026). The prepared results mark them as listed. The three on UP's "recognized" list carry the printed "valid up to January 2027" note. Recorded in the claims register as owner-stated. |
| 16 | The footer and policy pages showed "Call 1800-120-4050" (toll-free, 9 am – 9 pm). Is it the owner's number? | **Remove it** (5 October 2026). Replaced by admin@unnatividya.com until the owner gives a number. |
| 17 | Analytics loads twice (GTM plus a direct GA4 tag). GTM only, GA4 tag only, or leave it? | **GA4 tag only** (5 October 2026). GTM is removed. Events queue until gtag.js loads, so none are dropped. |
| 18 | Marketing consent wording: one box for email and WhatsApp, two boxes, or the newsletter only? | **One optional box for both** (5 October 2026): "Send me Unnati Vidya's newsletter and WhatsApp updates about online degrees, fees and admission dates. Optional. I can unsubscribe at any time." |
