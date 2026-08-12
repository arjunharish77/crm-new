# Gap Analysis — what is missing or broken in the current app

Ordered roughly by impact. Each item states what exists today, what is wrong or absent, and what to build.

---

## A. Broken or incomplete right now

### A1. `/tools/emi-calculator` route does not exist — footer links to it
`components/emi-calculator.tsx` exists, and `site-footer.tsx` links to `/tools/emi-calculator`, but there is no `src/app/tools/` directory. **The footer link 404s on every page of the site.**

**Build:** `src/app/tools/emi-calculator/page.tsx` per `designs/EmiCalculator.dc.html`:
- Program `<select>` populated from the real catalog (label: `name — shortName · ₹fee`). Selecting a program sets fee and tenure (36 months for 36-month programs, else 24).
- Sliders: total fee `50,000–300,000` step 5,000; down payment `0–150,000` step 5,000; tenure `6–48` step 3; interest `0–16%` step 0.5.
- Standard EMI formula; when rate is 0, `emi = principal / months`. Label 0% as "0% (no-cost)".
- Dark result card: EMI (38px), loan amount, total interest, total payable.
- Sidebar: "Get exact loan terms" → lead wizard; "Cheapest programs by EMI" list from the catalog.
- Add to the sitemap and to the fees section of every course page ("Open EMI calculator →").

### A2. `data/media.ts` references three assets that do not exist in `public/`
`counselorGuidanceMedia` → `/hero/counselor-guidance.webp`, `compareIllustration` → `/illustrations/compare-programs.webp`, `leadWizardSuccessIllustration` → `/illustrations/lead-wizard-success.webp`. There is no `public/illustrations/` directory and no `counselor-guidance.webp`. Anywhere these are rendered, the image is broken.

**Fix:** either source the three images, or remove the exports and the call sites. The redesign does not depend on them — Compare uses a lock card (no illustration), the wizard success step uses a CSS tick, and the counsellor block on `/lead` is typographic.

### A3. Every approval and university logo SVG is letterboxed
Detailed in `README.md` §5 with the exact corrected `viewBox` for each file. Today a wordmark sized at `height:34px` renders about 8px tall inside a 34px square. This affects course cards, listing rows, both detail heroes, the compare table, the footer badge row and the shortlist. **Fix the eight brand SVGs and the eighteen partner SVGs at the asset level**, then the design's `height/width:auto` rules work everywhere.

### A4. Header does not collapse early enough
`globals.css` collapses the header at 900px. With the sixth nav item ("Guides") added, the header overflows between roughly 900px and 1150px — the CTA is clipped and the document gains a horizontal scrollbar. **Raise the breakpoint to 1100px** and use `display:none !important` on `.uv-header-nav`, `.uv-header-cta` and the shortlist control, because their inline display styles otherwise win.

---

## B. Missing pages and sections

### B1. Individual degree-guide pages need the article treatment
`/online-degree-guides/[slug]` exists and `guide-content.ts` is large (115 KB), but the listing has no featured-guide slot and the guides are not surfaced in the primary nav. **Add:** "Guides" to the header nav; the featured-guide hero on the listing (`designs/Guides.dc.html`) with read time, universities compared, and last-updated; and a per-degree card grid showing level badge, program count and lowest fee, generated from the catalog rather than hand-listed.

### B2. Blog article page needs a real sidebar and inline imagery
See `designs/Article.dc.html`: author block with avatar and role, cover image, a violet callout for the "UnnatiVidya check" note, one inline image mid-article, a sticky sidebar with three related posts (thumbnail + title), a compare CTA card, and a sources card. End-of-article dark CTA band opening the wizard with the article topic as context.

### B3. Specializations page needs search and grouping
Currently a flat page. **Build** `designs/Specializations.dc.html`: an index built by walking every course's `specializations[]`, skipping `"General"`, grouped by stream, each tile showing which programs offer it (`MBA · MUJ · +2`), with a live search box and a designed empty state. Roughly 90 unique tracks across the catalog — this is a strong programmatic-SEO surface, so give each stream group an anchor and consider per-specialisation pages later.

### B4. Course detail is missing several sections
Compared with `designs/Course.dc.html`, add:
- **Eligibility as its own section** with a green "SOURCE VERIFIED" badge driven by `dataQuality.eligibility === 'verified'`. Show the badge only when true.
- **Specialisation cards** (3-up grid) rather than a plain list, with "Elective track · sem 3–4" subtext.
- **Fee plan table** with three rows (full payment with 2% off, semester-wise, no-cost EMI) and the EMI row tinted `#F4F3FC`.
- **Admission process** as four numbered cards.
- **Career outcomes** using `careerRoleSalary` per role — not one shared band — plus a placement stats strip and the partner logo row.
- **Certificate section** using the real `public/certificates/{courseId}-certificate-sample.webp`.
- **Rating breakdown** (5★→1★ bars) above the reviews.
- **Similar programs** (same stream, 3 cards).
- **Sources card** listing `sourceUrls` plus the UGC-DEB notification and a "last verified" line linking to `/how-we-verify`.
- Right rail: enquiry form, compare link, "Why learners pick {shortName}", and an AI-recommender card.

### B5. University detail is missing several sections
Compared with `designs/University.dc.html`, add: fact tiles grid from `factTiles`; recognitions as 2-up cards each with its approval logo; the full program table (name + level badge, duration, fee, EMI, View link); placement support chips; **campus gallery** using the three `*-moment-*.webp` files, which are currently unused; scholarship table from `universityEnrichmentById[id].scholarships`; FAQ accordion from the enrichment FAQs; "other universities" cards; and a sources card.

### B6. Compare needs a scalable selector — the chip list does not survive catalog growth
Current UX lists every course as a chip. At 30 courses it already wraps into five rows; at 60 it is unusable.

**Build** the pattern in `designs/Compare.dc.html`:
- A row of **three slot cards**. A filled slot shows university logo, program name, university, fee and duration, with a remove ✕. An empty slot is a dashed card reading "+ Add a program / Search 30 UGC-entitled degrees".
- Clicking an empty slot opens a **picker panel**: search field, filter chips (UG, PG, four streams, three universities), and a scrollable result list. Each row shows logo, name, university · stream, fee, duration, and a state tag — `Add`, `Selected` (green, disabled) or `Slots full` (grey, disabled).
- Adding auto-closes the picker when the third slot fills; otherwise it stays open.
- Presets row above ("MBA: MUJ vs Amity", "MBA: MUJ vs SMU", "BCA: MUJ vs Amity", "MCA: all three", "B.Com: all three") sets the whole selection at once.
- Table rows: total fee, EMI, duration, level, rating, approvals, placement rate, average package, hiring partners, specialisation count, eligibility. Highlight the best cell per row in green (lowest fee, highest rating, highest placement, most specialisations) — only when more than one program is selected.
- `/compare/[course]` should preselect that course into slot 1 and leave the rest empty.

### B7. Shortlist has no summary or comparison affordance
`shortlist-view.tsx` lists saved items. **Add** a stats strip (cheapest saved, fee spread, highest rated, best placement rate), per-card remove, a "Compare all" button that pushes the saved ids into `/compare`, a "Get all brochures" bulk enquiry, and a designed empty state pointing at `/courses`.

### B8. Home is missing five sections
Compared with `designs/Home.dc.html`:
- Hero right column: real photo with **two floating stat cards** (lowest MBA in catalog with EMI; average package).
- **Approvals strip** with the five real badge SVGs and a "How we verify →" link.
- **Stream explorer** — four tiles (Management, IT & Computers, Commerce, Arts & Humanities) showing degree count, example short names and lowest fee, computed from the catalog.
- **AI recommender band** — tinted panel with the real `hero/recommender-preview.webp` and both CTAs.
- **Three-step "how it works"** with left violet rules, and the trust strip ("Unbiased by design / Approvals verified / Support till enrolment").
- FAQ accordion (5 questions) at the bottom.

### B9. Admin console needs a dashboard
`/admin` exists with sub-pages for leads, courses, universities, CRM sync, content quality, redirects, programmatic SEO and source imports, but no overview. **Build** `designs/Admin.dc.html`: dark sidebar with counts on each nav item, four KPI cards (leads this week, OTP verified, counselled, enrolled, each with a delta), a recent-leads table (learner + masked phone, interest, **source page**, status pill), a "leads by program" bar list, and a content-quality panel (courses source-verified, eligibility verified, awaiting re-check, CRM sync health) linking into the audit page.

### B10. `/how-we-verify` needs the trust argument laid out
**Build** `designs/HowWeVerify.dc.html`: dark hero; "the four checks" as 2×2 cards (UGC-DEB entitlement, fee from the university's own page, eligibility/specialisation audit tied to `dataQuality`, honest placement wording); a "what we will not publish" list; and a "found something wrong?" correction CTA. Link to it from the home approvals strip and from every course page's sources card.

---

## C. Functional gaps

### C1. Lead context is not captured everywhere
Every enquiry entry point must pass context (course id + name, university id, or page topic) into the wizard and onto the lead record, so counsellors open the call already knowing what was being viewed. The design surfaces this in the wizard title and the admin "source" column.

### C2. Compare unlock should be server-side
Prototype uses `localStorage`. In production, set the unlock on the verified session so it survives devices and cannot be bypassed by clearing storage.

### C3. Recommender scoring and chat
The quiz is five questions (goal, level, stream, budget, working status). Scoring in `designs/Recommender.dc.html`: base 60; ±12 for level match, −30 for mismatch; +16 stream match, −18 mismatch; budget band ±6–14; +6 tech goal with IT stream; +5 promotion goal with PG; plus rating and placement adjustments; clamped 41–98. Keep this deterministic and server-side. The "why" line is assembled from the user's own answers plus the university's placement rate — keep that, it is what makes the result defensible. The chat below the results is scripted in the prototype; **wire it to a real LLM with the catalog as context**, and keep the three suggestion chips.

### C4. URL state for filters
Courses, specializations and blog filters should read and write query params so filtered views can be linked and indexed.

### C5. Accessibility
Add: visible focus rings on all controls, `aria-expanded` on accordions and the hamburger, `aria-label` on icon-only buttons (remove ✕, WhatsApp), proper `<label>`s on every form field including the sliders, and a heading hierarchy that does not skip levels.

### C6. Analytics events
`components/analytics.tsx` and `track-on-mount.tsx` exist. Instrument at minimum: wizard open (with context), each wizard step completion, OTP sent, OTP verified, compare unlock, compare selection change, quiz start, quiz complete, chat message, shortlist add/remove, EMI calculation.

---

## D. Content gaps worth raising with the client

- Only 3 universities and 30 programs. Every listing, filter and comparison is built to scale, but the catalog is the constraint on traffic.
- `dataQuality` is only partly populated — `curriculum`, `faqs` and `lastAdmissionDate` are unaudited on most courses, and curriculum is currently generated from a stream-level fallback rather than per-program. The course page shows a verified badge only for audited fields, which makes the gap visible; filling it is a content task.
- Placement statistics are university-level, not program-level. The design labels them as such; keep that wording.
- Career salary bands are marked indicative. Do not present them as sourced data.
- Testimonials in the design are placeholders. Replace with real, attributable quotes before launch.
