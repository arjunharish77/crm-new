# Page-by-Page Build Specs

Every measurement here is taken from the corresponding file in `designs/`. Open the file alongside this document. Values not mentioned are in the markup — treat the inline styles as authoritative.

Conventions used below: **CARD** = `background:#fff; border:1px solid #CFDAE6; border-radius:8px`. **DARK** = `#263238`. **TINT** = `#F4F3FC`. **PAGE** = `#F7F8F9`.

---

## Home — `Home.dc.html` → `/`

Sections top to bottom:

1. **Announcement bar** (in header component) — DARK, 12px, centred, gold link.
2. **Hero** — `linear-gradient(180deg,#F4F3FC,#fff)`, grid `1.05fr 0.95fr`, gap 56, padding `56px 24px 52px`.
   - Left: eligibility pill (white, green dot, "Only UGC-entitled degrees · re-verified every admission cycle") → H1 46px → 17px subhead, max-width 520 → search bar (56px tall, 1.5px border, radius 8, violet Search button, submits to `/courses?q=`) → "Popular:" chip row (4 chips linking to real course slugs) → four stats (30 programs / 3 universities / 1.75L learners / ₹0 counselling).
   - Right: `hero/student-online-degree.webp` at 420px height, radius 12, modal shadow. Two floating CARDs: bottom-left offset `-28px` (lowest MBA ₹1,20,000, SMU, EMI, green "UGC-entitled · verified today"), top-right offset `-20px` (average package ₹7.2 LPA). On mobile drop the floats below the image.
3. **Approvals strip** — white, hairline top and bottom, centred row: label `APPROVALS WE CHECK` (11px/700, `letter-spacing:1px`, `#AAAAAA`), five badge SVGs at 40px height, then "How we verify →".
4. **Popular degrees** — H2 + subline, "Browse all 30 →" right-aligned. 3-col grid of course cards: university logo (34px) + level badge; title 18px; university 13px; rating · reviews · duration row; up to 3 specialisation chips; then a hairline-topped footer with fee 19px/700 + "total · EMI x" and View / Enquire buttons. Card ids used: `mba-muj, bca-muj, mca-muj, mba-smu, bcom-muj, msc-data-science-amity`.
5. **Universities** — PAGE background band. 3 cards: 150px campus photo with the university logo on a white chip at bottom-left; name, city · est.; approval badge row (30px); hairline-topped 3-stat grid (programs, placement, avg package).
6. **AI recommender band** — TINT panel, border, radius 12, grid `1fr 1fr`. Left: "UnnatiAI" pill, H2 30px, copy, gradient CTA + outline "Compare manually", "Takes about two minutes" note. Right: `hero/recommender-preview.webp`, cover, min-height 320.
7. **Stream explorer** — PAGE band, 4 tiles: name 17px, "{n} degrees", example short names joined by `·`, "from ₹x →" in violet. All computed from the catalog.
8. **How it works** — 3 columns, each with a 3px left violet rule: `01 · COMPARE`, `02 · COUNSEL`, `03 · ENROL`.
9. **Compare CTA** — DARK band, headline + copy left, violet "Open compare" button right.
10. **Testimonials** — 3 CARDs: gold stars, 15px quote, avatar initials circle + name + program.
11. **FAQ** — PAGE band, max-width 820, 5 accordion items, first open.

---

## Courses — `Courses.dc.html` → `/courses`

- **Header block** (white): breadcrumb, H1 32px, count line — `"{visible} of {total} UGC-entitled programs · fees verified for the July 2026 cycle"` — and a right-aligned outlined "Not sure? Ask UnnatiAI" button with a gradient dot.
- **Trending comparisons bar** — TINT, label + four preset links into `/compare`.
- **Body** grid `262px 1fr`, gap 24.
  - **Filter rail** (CARD, sticky `top:88px`): "Filters" + "Clear all"; sections DEGREE LEVEL / STREAM / UNIVERSITY as checkbox lists, each row showing a live count in `#AAAAAA`; TOTAL FEE UNDER range `75,000–275,000` step 5,000 with a live `Up to ₹x` label.
  - **Results**: search input (flex) + sort `<select>` (most reviewed / fee asc / fee desc / highest rated). Each result is a CARD, grid `1fr 190px`: left has logo + level badge + stream, title `{name} — {university}` 19px, a meta row (rating + reviews, duration, **fee bold**, EMI), up to 4 specialisation chips plus `+n more` in violet, and the approval badge row (28px); right column stacks View details / Enquire now / "+ Add to compare".
  - **Empty state** as described in README §6.
- Sorting is applied after filtering; "most reviewed" is the default and sorts by `reviews` desc.

---

## Course detail — `Course.dc.html` → `/courses/[slug]`

1. **Dark hero**: breadcrumb; white logo chip (40px logo) + H1 36px + university link · city; meta row (rating + reviews · learners · specialisation count); right-hand box `rgba(255,255,255,0.06)` with a 1px light border holding the approval badges on white chips.
2. **Key facts strip** (white, 5 columns): Duration, Total fee, EMI from, Level, Weekly effort.
3. **Sticky pill nav**: Overview, Eligibility, Specialisations, Curriculum, Fees & EMI, Admission, Careers, Certificate, Reviews, FAQ.
4. **Body** grid `1fr 350px`, gap 44, sections separated by 44px.
   - Overview: paragraph + 3×2 fact tiles (`#F7F8F9` fill).
   - Eligibility: CARD with the green SOURCE VERIFIED badge and the eligibility text.
   - Specialisations: 3-col cards, count in the heading.
   - Curriculum: accordion per semester, bullet rows with a 5px violet dot.
   - Fees: 3-row table with a `PLAN / YOU PAY / PER INSTALMENT` header; EMI row tinted; below it "Open EMI calculator →" and the scholarship note.
   - Admission: 4 numbered cards.
   - Careers: 4 role cards with green salary bands; stats strip (placement %, average, highest, partners); 6 partner logos.
   - Certificate: `340px 1fr` — real certificate image left, explanation right.
   - Reviews: summary block (34px average, stars, count) beside 5→1★ percentage bars, then two review cards.
   - FAQ: accordion, built from `buildCourseFaqs()`.
   - Similar programs: 3 cards, same stream.
   - Sources card: `sourceUrls` + UGC-DEB link + "last verified" line.
   - **Right rail** (sticky `top:130px`): enquiry CARD (name, phone, "Enquire now" → wizard, "Free · no spam" note); "Compare with similar programs" outline button; "Why learners pick {shortName}" TINT card; AI recommender card with gradient CTA.

---

## Universities — `Universities.dc.html` → `/universities`

Horizontal cards, grid `280px 1fr 210px`, min-height 230:
- Left: full-bleed campus photo.
- Middle: logo + green "VERIFIED THIS CYCLE" pill; name 22px; city · established · learners; `about` paragraph; approval badges (34px); hairline-topped 5-stat row (rating + review count, programs, placement, average package, annual fee from).
- Right: PAGE-tinted panel with View university / Enquire now / "See all {n} programs →".
Below the list: DARK CTA band with Compare now + Ask UnnatiAI.

---

## University detail — `University.dc.html` → `/universities/[slug]`

1. **Dark hero** grid `1fr 340px`: breadcrumb, white logo chip (44px), H1 36px, city · est · learners, approval badges on white chips, rating; right — 200px campus photo, radius 8.
2. **Stats band** TINT, 5 columns: placement assistance, average package, highest package, hiring partners, annual fee from.
3. **Sticky pill nav**: About, Recognitions, Programs, Placements, Admission, Scholarships, FAQ.
4. Body grid `1fr 350px`:
   - About: two paragraphs from `overview[]`, then 3×2 fact tiles from `factTiles`.
   - Recognitions: 2-col cards, each with its approval logo (36px) beside title + note.
   - Programs: table `PROGRAM / DURATION / TOTAL FEE / EMI FROM / →`, program name bold with an inline level badge.
   - Placements: 6 partner logos in a bordered panel, four support chips, and the "assistance, not a guarantee" caveat.
   - Campus gallery: three 170px images from `*-moment-*.webp`.
   - Admission: 4 numbered cards from `admissionSteps`.
   - Scholarships: table `CATEGORY / CONCESSION / PROOF REQUIRED`, concession in green, plus the one-per-learner note.
   - FAQ accordion from enrichment FAQs; "Other universities" 2-col cards.
   - Right rail: brochure enquiry CARD, "Why learners pick {shortName}" TINT card, sources card.

---

## Compare — `Compare.dc.html` → `/compare`, `/compare/[course]`

Full behaviour is in `GAP_ANALYSIS.md` §B6. Layout notes:
- Presets row, then `OR BUILD YOUR OWN ({n} of 3)`, then the three slot cards (`uv-3col` grid).
- Picker panel sits directly beneath the slots: CARD with modal shadow; header row = search input + Close; filter chip row; scrollable list capped at 330px.
- Table grid is `190px` plus `1fr` per selected program. Column heads sit on `#F5F5F5` with the university logo above the program name. Final row holds View / Enquire per column.
- The lock overlay is `position:absolute; inset:0` over the blurred table with `rgba(247,248,249,0.55)` behind a 420px card.

---

## AI recommender — `Recommender.dc.html` → `/recommender`

Three phases in one page, max-width 900:
- **Quiz** — centred CARD 640px: 5 progress bars, "Question n of 5", 22px question, full-width option buttons (selected = violet border + `rgba(84,76,200,0.06)` fill), "← Back" from question 2.
- **Thinking** — 56px padding, spinning 48px ring (`@keyframes uvspin`), "Scoring all 30 programs against your answers…" for ~1.4s. Replace with the real request.
- **Results** — three cards, grid `72px 1fr auto`: score ring (top match = gradient fill, white text), badge (`BEST MATCH` gradient / `{n}% MATCH` violet), title, meta line, "Why:" sentence, 3 specialisation chips, View / Enquire buttons. Below: "↺ Retake the quiz" and "Compare these three →". Then the chat panel — header with gradient dot and a "demo" note, message list capped at 360px, three suggestion chips, input + Send.
- Page title and subtitle swap between quiz and results phases.

---

## Lead capture — `Lead.dc.html` → `/lead`

Grid `1fr 380px`. Left: H1 34px, positioning paragraph, three green-tick benefit rows (fee and scholarship check, entitlement verification, documents and loan paperwork), three stat cards (1.75L guided, <24 hrs callback, ₹0 to us). Right: the wizard as a sticky CARD, identical steps to the modal. Wizard validation rules are in README §3.

---

## Shortlist — `Shortlist.dc.html` → `/shortlist`

Header with count and fee range, "Compare all" + "Get all brochures". 3-col cards with logo, remove, title, university, duration/fee/EMI row, View / Enquire. Stats strip below (cheapest, spread, highest rated, best placement). Designed empty state.

---

## Specializations — `Specializations.dc.html` → `/specializations`

Count line, search box (460px), then per-stream groups: heading + "{n} specialisations", 4-col tiles showing the track name and which programs offer it. Empty state when the search matches nothing.

---

## Blog + Article — `Blog.dc.html`, `Article.dc.html`

Blog: category chips (All, Validity, Programs, Careers, Admissions), 3-col cards with 170px cover, category pill + read time, title, excerpt, "Read article →" pinned to the bottom. DARK newsletter band at the end.
Article: see `GAP_ANALYSIS.md` §B2. Body copy is 17px with `line-height:1.8` and 20px gaps; H2s are 25px.

---

## Guides — `Guides.dc.html` → `/online-degree-guides`

Featured guide card (`1.1fr 0.9fr`): "MOST READ GUIDE" pill, H2 28px, summary, three meta facts, "Read the guide" CTA, cover image right. Then a 3-col grid of per-degree guide cards (level badge, program count, title, blurb, "from ₹x", "Read →"), generated by grouping the catalog on `shortName`.

---

## How we verify — `HowWeVerify.dc.html` → `/how-we-verify`

Dark hero with H1 38px and a 680px lede. "The four checks" as 2×2 numbered cards. "What we will not publish" as four bordered rows with a ✕ marker. TINT correction CTA card at the end.

---

## Legal — `Legal.dc.html` → `/about`, `/privacy`, `/terms`, `/refund-policy`

PAGE header block with breadcrumb, H1 and a tab strip (render as links between the four routes, active tab = violet text + 2px violet underline). Body grid `1fr 280px`: four `h2 + paragraph` blocks per page, a "last updated" line, and a sidebar with a callback card and related links. Copy for all four pages is in the design's logic class — reuse it or replace with legal-approved text.

---

## Admin — `Admin.dc.html` → `/admin`

Dark 236px sidebar (logo, "ADMIN CONSOLE" label, nav items with count pills, user block with "← Back to site"). Content: white toolbar with page title, subtitle, search and "Export CSV"; four KPI cards; then grid `1.6fr 1fr` — recent leads table left, "leads by program" bars and content-quality panel right. Status pills use `{color}1A` backgrounds: New violet, Counselled green, Follow-up gold, Enrolled green.

---

## Mobile — `Mobile.dc.html`

Eight mobile-web screens at 390px: Home, Courses with the filter bottom sheet, Course detail, University detail, Compare with the lead-gate sheet, Recommender results, Blog with the wizard sheet, EMI calculator. Rules the board encodes:
- Hamburger + slide-down panel; announcement bar stays.
- Filters, the lead wizard and the compare gate become **bottom sheets** with a 38px grab handle, `border-radius:14px 14px 0 0` and an upward shadow.
- Every conversion page gets a **sticky bottom action bar** (primary + secondary, or primary + WhatsApp circle).
- Multi-column grids collapse to one column; the 5-stat strips become 2×2; pill navs scroll horizontally.
- Filter checkboxes become chips; sliders keep a 16px thumb.
- Minimum tap target 44px; primary bottom-bar buttons are 48px.
