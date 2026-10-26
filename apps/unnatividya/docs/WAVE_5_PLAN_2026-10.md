# Wave 5: tools, clusters and platform (plan, October 2026)

**Status: approved 14 October 2026 (V1–V10; V11–V16 added 24 October).** Done: A1 Node 24 (increment 96), tools B1–B5 (increment 97), CMS C1–C3 (increment 98; C1 previews already existed). Also done: dependency security fixes (increment 99), E fees by visitor location (increment 100), clusters D1–D4 (increment 101). Wave 5 is built and validated: all 71 suites passed on 25 October 2026 (see the end of increment 101 in IMPLEMENTATION_PROGRESS.md).

Wave 5 comes from [NEXT_PHASE_PLAN_2026-10.md](NEXT_PHASE_PLAN_2026-10.md) §4.3, §5 and §9: "Tools 5–10, Groq recommender, remaining first-priority content, NRI hub, scheduled source checks". You chose to build it **before** releasing increments 74–95 (V1), so everything ships in one release. Trust pages (editorial policy, funding page, glossary) are **out of scope** (V2).

## 1. Already done (not repeated)

| Item | Where |
|---|---|
| Tool 9, Groq recommender | `/recommender` (increment 81) |
| Scheduled source checks | Weekly checker CLI (increment 85); the VPS cron is part of the release |
| Online vs distance vs regular (article) | Prepared draft `online-vs-distance-vs-regular-degree` (increment 95). The new helper tool (B2) uses the same facts. |
| Hubs C1, C2, C3, C5 and the enriched comparisons | Wave 4 (increments 91–95) |

## 2. Scope

### A. Platform (first, because everything else is tested on it)

| # | Item | What changes | Effort |
|---|---|---|---|
| A1 | **Node 24 for the CRM and the website** (V5) | Shared `.nvmrc`, both Dockerfiles (`node:24-bookworm-slim`), both `engines` fields and the lock files (regenerated with the isolated npm 10 method; never `npm install` inside `crm/`). Re-test everything: CRM lock check, types, lint, 2,155 unit tests and build; the website's types, lint, build, library suites and every smoke suite, locally and in the CI rehearsal. | S/M |

### B. Learner tools (V3: all five)

Each tool is free, needs no sign-up, keeps any answers in the browser only, shows its sources with dates, and ends with Apply now. None ranks programs.

| # | Tool | What it does | Data | Effort |
|---|---|---|---|---|
| B1 | **Online exams and device check** | Per university: how exams are held (online, proctored, centre), what proctoring needs, with source and date. A browser-only check of camera, microphone, connection and screen, with no recording kept or sent. | Official exam pages, programme guides or FAQs of MUJ, SMU and Amity only (the W3 rule). Anything not found shows "Confirm with the university". | M |
| B2 | **Online vs distance vs regular helper** | Four or five questions (attend in person? study around work? exams at a centre?) lead to the modes that fit, each explained with the UGC 2020 regulation facts. | Regulations 2, 15 and 22, already sourced | S |
| B3 | **Weekly study-time planner** | The learner enters work, travel and family hours and gets the free hours left per week, with a printable plan. It never claims a university workload. | The learner's own numbers | S/M |
| B4 | **EMI v2: loan vs instalments vs upfront** | Compares a loan (learner-entered rate, tenure and processing fee), the university's semester instalments (published schedules only) and paying upfront, showing totals and timing. It points to the no-cost EMI article's checklist. | Published fees and schedules; learner inputs | S/M |
| B5 | **Specialization finder by career goal** | The learner picks a goal (from the career roles in the catalog) and sees the programs and specializations whose published career roles mention it, with links. | Catalog career roles and specializations | S/M |

### C. CMS improvements (V6, V7)

| # | Item | What changes | Effort |
|---|---|---|---|
| C1 | **Article previews** | A reviewer opens a submitted article revision rendered exactly as the public page (noindex, admin-only) before applying it. | S/M |
| C2 | **Scheduled publishing** (V7) | An admin can approve a revision with a go-live date and time (IST). A script in the website container applies due revisions every 5 minutes through the same validated apply path, recording each in the audit log. One cron line on the VPS. Needs website migration `0010`. | M |
| C3 | **Guides editable in the CMS** | The hand-written eligibility and career-scope guide text (per-university facts, the "what's different" note, FAQs, sources, last reviewed) moves into the CMS with draft → review → apply, history and rollback. A one-time import copies today's text, never overwriting, as the article sync does. Fee and UGC guides keep reading the catalog. Needs migration `0011`. | L |

### D. Content clusters (V4: same pattern as Wave 4)

The hubs are **catalog pages** where their facts change. Supporting pieces are **CMS drafts** with a review note, in batches of 3–4. Every claim has an official source, and facts that need the university are flagged.

| # | Cluster | Hub (catalog page) | First-priority pieces (CMS drafts) | Reuses |
|---|---|---|---|---|
| D1 | How online learning works | "What studying online is really like: classes, exams and support", reading each university's published details and linking tools B1–B3 | Exam pattern and proctoring by university; a "studying while working" revision | B1 sources; `studying-while-working-fulltime` |
| D2 | Computing and data | "Online BCA, MCA and MSc Data Science: which fits you?", with programs, fees, eligibility and specializations from the catalog | BCA after 12th (revision); BCA comparisons; MSc Data Science career scope (revision) | `online-bca-after-12th-guide`, `online-bca-vs-bsc-computer-science`, `online-msc-data-science-career-scope` |
| D3 | Commerce, humanities and media | "Online B.Com, M.Com, BA and MA: options and fees", from the catalog | B.Com vs B.Com Honours (revision); M.Com and MA posts checked against current pages | Existing commerce/humanities posts |
| D4 | NRI and international | "Online degrees for NRIs and international learners: fees, eligibility, documents", showing USD fees from published category blocks and the NRI/foreign document lists | WES evaluation (revision); country exceptions | MUJ/SMU USD blocks (18, prepared); **Amity researched now (V8)**; `wes-evaluation-online-degrees` |

**Amity NRI and foreign fees (V8):** researched from Amity's official pages only. Anything found becomes prepared CMS category-fee proposals with source and date (the same flow as MUJ and SMU). Anything not found shows "Confirm with Amity".

### E. Fees by visitor location (added 14–24 October 2026, decisions V11–V13)

You asked for fees to follow the visitor's location: Indian fees in India, international fees elsewhere. Your team will enter Amity's international fees in the CMS.

| # | Item | What changes | Effort |
|---|---|---|---|
| E1 | **Category fees entered by hand in the CMS** | Catalog revisions get a form for student-category fee rows (category, currency, total, per semester, semesters) with the source link, source label and checked date, so your team can enter Amity's international fees. The existing checks still apply (the INR row must equal the course fee). | M |
| E2 | **Visitor fee group** | The browser's time zone sets the default group (India → Indian applicants; elsewhere → NRI, or the university's single international fee). A visible "Showing fees for" switch (Indian / NRI / Foreign national) overrides it and is remembered in that browser. Nothing is sent anywhere. | S/M |
| E3 | **Where it applies** | Course pages (category selector, headline fee), fee guides and the fees hub, course cards, listings, university pages and comparison tables, and the total cost planner's starting category. The EMI calculator stays INR-only. Where no fee is published for the visitor's group: "Confirm the fee for international applicants with the university". | M/L |

Pages are rendered with the Indian fee first and switch in the browser after loading, so a page never depends on the visitor's location to render.

## 3. Order and effort

1. **A1, Node 24**, with a full re-test (about 1–2 days).
2. **Tools B2, B3, B5, B4, B1** (code, about 1–1.5 weeks; B1 includes sourcing).
3. **CMS C1, then C2, then C3** (about 1.5–2 weeks; two migrations).
4. **Clusters D4 (with the Amity research), D2, D3, D1** (about 2–3 weeks of drafting, in review batches).

Each step ends with tests, screenshots at 390 and 1280 px, the docs and a progress-log entry. Questions come one at a time.

## 4. Rules carried over

All Wave 4 rules stay:
- Apply now only, contact-first, no phone numbers;
- no invented facts; new catalog facts go through prepared CMS proposals;
- ratings never used for ranking; no "Best" or winner highlighting;
- byline "Content Team, Unnati Vidya"; three universities; English only;
- never stage, commit or push; you push at the end.

## 5. Release impact

- **New website migrations:** `0010` (scheduled publishing) and `0011` (guides in the CMS).
- **New VPS cron:** the 5-minute scheduled-publish job, plus the existing weekly source check.
- **New one-time import:** guides into the CMS (after migration).
- **Images:** Node 24 for both apps; no new `.env` key expected.

## 6. Decision log

| # | Decision | Date |
|---|---|---|
| V1 | Build Wave 5 before releasing increments 74–95. | 14 Oct 2026 |
| V2 | Scope: new learner tools, content clusters, platform upgrades. Trust pages are out. | 14 Oct 2026 |
| V3 | All five tools: exams and device check, mode helper, study-time planner, EMI v2, specialization finder. | 14 Oct 2026 |
| V4 | Clusters follow Wave 4: catalog-page hubs where facts change, CMS drafts for supporting pieces. | 14 Oct 2026 |
| V5 | Node 24 LTS for both the CRM and the website (one shared version). | 14 Oct 2026 |
| V6 | CMS: guides editable in the CMS, article previews, scheduled publishing. | 14 Oct 2026 |
| V7 | Scheduled revisions go live through a VPS cron every 5 minutes. | 14 Oct 2026 |
| V8 | Research Amity's NRI/foreign fees from official pages only; found amounts become prepared CMS proposals, the rest "Confirm with Amity". | 14 Oct 2026 |
| V9 | The header Tools menu lists every tool in labelled groups (two columns on desktop); no separate /tools page. EMI v2 extends the existing EMI calculator, so the menu has 10 tools. | 14 Oct 2026 |
| V10 | The exam device check may use the camera and microphone on `/tools/exam-check` only (this origin, in the app and Caddy). The test starts on click, the preview stays on screen, nothing is recorded or sent, and every other page stays blocked. | 14 Oct 2026 |
| V11 | Fees follow the visitor's location, detected from the browser's time zone (no IP lookup), with a "Showing fees for" switch remembered in the browser. Your team enters Amity's international fees in the CMS. | 24 Oct 2026 |
| V12 | It applies to course pages, fee guides and the fees hub, listings and comparisons, and the total cost planner (the EMI calculator stays INR-only). | 24 Oct 2026 |
| V13 | Outside India, the NRI fee shows first where a university lists one, otherwise its single international fee. | 24 Oct 2026 |
| V14 | Cluster D4 drafts: revise the WES evaluation post only, from WES's official pages. No country-by-country rules; learners are told to check with the receiving country. | 24 Oct 2026 |
| V15 | Cluster D2/D3 drafts: revise four posts from the current official pages (BCA after 12th, BCA vs BSc Computer Science, MSc Data Science careers, B.Com vs B.Com Honours at Amity). | 24 Oct 2026 |
| V16 | Cluster D1 drafts: revise "studying while working full time" from sourced facts only; no separate exam-pattern article (the exam check covers it). | 24 Oct 2026 |
