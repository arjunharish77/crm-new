# C: Universities, University detail, Specializations, Specialization detail, Guides hub and Article: specs, current state, changes and conflicts

Read-only research. Sources:
- Design: `apps/unnatividya/design_handoff_unnati_vidya/{Universities,University,Specializations,Specialization,Guides,Article}.dc.html`, `uv-data.js`, `README.md` (and a glance at `UVFaq`/`UVCard` for how these pages use them).
- Current code: `src/app/universities/page.tsx`, `src/app/universities/[slug]/page.tsx`, `src/app/specializations/page.tsx`, `src/app/specializations/[slug]/page.tsx`, `src/lib/specializations.ts`, `src/components/specialization-explorer.tsx`, `src/app/online-degree-guides/page.tsx`, `src/components/guide-explorer.tsx`, `src/app/online-degree-guides/[slug]/page.tsx`, `src/app/blog/page.tsx`, `src/components/blog-explorer.tsx`, `src/app/blog/[slug]/page.tsx`, `src/components/article-view.tsx`, `src/components/section-pill-nav.tsx`, `src/data/{catalog,media,nirf-rankings,blog,guide-content}.ts` and `src/styles/globals.css`.
- Rules: `0-constraints-checklist.md`, `docs/DESIGN_AND_CONTENT_STANDARD.md`, `docs/CLAIMS_REGISTER.md`, `docs/CONTENT_AND_UI_EXPANSION_PLAN.md`, `docs/IMPLEMENTATION_PROGRESS.md` (increments 77 and 80).

Line numbers are approximate and refer to the design `.dc.html` file named in each section unless stated otherwise.

---

## 0. Cross-cutting notes for all six pages

### 0.1 Page shell shared by all six designs
- Root: `min-height:100vh; display:flex; flex-direction:column; background:#fff`. Body: `font-family:'Plus Jakarta Sans',system-ui,sans-serif; color:#16133F; -webkit-font-smoothing:antialiased`. Global link: `#5B4CF0`, no underline; hover `#4A3BDB` with underline. Card-style links suppress the underline through a `style-hover` override.
- Header: `<dc-import name="UVHeader" active="unis|specs|guides">`, which is sticky at top 0, z-index 40 and 68px tall. The active values are Universities and University = `unis`, Specializations and Specialization = `specs`, Guides and Article = `guides`.
- Footer: `UVFooter`, after `main`. The footer adds `margin-top:80px`.
- FAQ: `UVFaq` with props `items`, `title` and `subtitle`. Its header row always shows **"View all FAQs →"**, linked to `Guides.dc.html` (UVFaq line 16). No FAQ page exists, so the link sends people to the Guides hub. Accordion: only one item opens at a time. The `help` icon, question text and `add`/`remove` icon sit in a clickable **div**, with no `button`, `aria-expanded` or keyboard support. Answers are not rendered while closed (`sc-if`), so they are invisible without JS and to find-in-page.
- Program card: `UVCard course-id` appears only on Specialization detail. It shows ★ rating (reviews), a generic "UGC-entitled" pill, a stat block, "N specialisations" (linked to the Specializations hub), View details and "+ Compare".
- Inner-page hero background: two variants.
  - Listing heroes (Universities, Specializations, Guides): `radial-gradient(520px 280px at 90% 0%, #E6E1FF 0%, rgba(230,225,255,0) 70%), linear-gradient(180deg,#F7F5FF,#FBFAFF)` plus `border-bottom:1px solid #EEECF8`.
  - Detail heroes (University, Specialization, Article): `radial-gradient(520px 280px at 0% 0%, #ECE8FF 0%, rgba(236,232,255,0) 70%), linear-gradient(180deg,#F7F5FF,#FBFAFF)`. Specialization and Article add the same bottom border. University has no border.
- Container: `max-width:1240px; margin:0 auto; padding-inline: clamp(16px,3vw,32px)`. Article uses 880px.
- Breadcrumb (all pages): `font-size:13px; color:#6F6D8C; display:flex; gap:6px; align-items:center` (detail pages add `flex-wrap:wrap`). The separator is a Material Symbol `chevron_right` at 16px. The current item is a `span` with `color:#16133F`. It is **not** a `<nav aria-label="Breadcrumb">` or a list, and it has no `aria-current="page"`.
- Scroll reveal: in `uv-data.js` (L88–101), `main section` elements below 90% of the viewport start at opacity 0 / translateY(24px) and animate in over 0.6s. Constraint 11 says content must not be hidden by scroll-reveal, so either drop this or make it pure progressive enhancement (CSS `@media (prefers-reduced-motion: no-preference)` plus a JS-added class that never hides content when JS fails). The 77th increment already limits card motion to a 2px lift over 160ms.
- Fonts and icons: the design loads Google Fonts for Plus Jakarta Sans and Material Symbols Rounded. The CSP allows only `self`. Self-host Plus Jakarta Sans through `next/font/local` or `next/font/google` (self-hosted at build). Replace Material Symbols with the existing `lucide-react@0.563.0`; every name below was checked in `node_modules`:

| Material Symbol (design) | lucide-react | Material Symbol | lucide-react |
|---|---|---|---|
| chevron_right | ChevronRight | arrow_forward | ArrowRight |
| verified | BadgeCheck | verified_user | ShieldCheck |
| workspace_premium | Award | support_agent | Headset |
| menu_book | BookOpen | event / calendar_month | CalendarDays |
| payments | Banknote | laptop_mac | Laptop |
| work | Briefcase | work_history | BriefcaseBusiness |
| savings | PiggyBank | military_tech | Medal |
| credit_card | CreditCard | redeem | Gift |
| description | FileText | record_voice_over | MessagesSquare (or Mic) |
| groups | Users | how_to_reg | UserCheck |
| business_center | Briefcase | computer | Monitor |
| account_balance | Landmark | auto_stories | BookOpenText |
| search | Search | category | Shapes |
| check_circle | CircleCheck | help | CircleHelp |
| add / remove | Plus / Minus | school | GraduationCap |
| trending_up | TrendingUp | calculate | Calculator |
| compare_arrows | ArrowLeftRight | fact_check | ClipboardCheck |

Mark every decorative icon `aria-hidden="true"`. With ligature fonts, the design's icon text such as "chevron_right" and "verified" would be read aloud.

### 0.2 URL mapping: the design's query-param URLs must map to the existing SEO routes (constraint 10)

| Design URL | Must become | Notes |
|---|---|---|
| `Universities.dc.html` | `/universities` | — |
| `University.dc.html?id=muj` | `/universities/manipal-university-jaipur` (`/universities/[slug]`) | Slugs: `manipal-university-jaipur`, `sikkim-manipal-university`, `amity-online` |
| `Courses.dc.html?uni=muj` | `/courses?university=muj` | The current CourseExplorer reads `university` (ids or short names, `course-explorer.tsx` L44–45). It does not read `uni`. |
| `Compare.dc.html?uni=muj` / `?ids=a,b` | `/compare?add=a,b,c` (the gated tool only reads `add`, `compare/page.tsx` L17) or the public editorial pages `/compare/[course]/[pair]` | There is no `uni=` support, and the tool is gated (constraint 3). |
| `Apply.dc.html?uni=muj` | `/lead?university=muj` with `rel="nofollow"` and `data-open-lead` (modal) | Label is exactly "Apply now". |
| `Specializations.dc.html` | `/specializations` (keep the `q`, `stream` and `degree` query state) | — |
| `Specialization.dc.html?key=mba-finance` | `/specializations/[slug]` | **Slug algorithms differ.** The design's `slugify` turns `&` into "and" (`mba-analytics-and-data-science`). The repo's `specializationKey` drops `&` (`mba-analytics-data-science`, `src/lib/specializations.ts` L20–22). Keep the repo slugs, because all 101 are indexed. |
| `Guides.dc.html` | `/online-degree-guides` (and `/blog` for articles) | See §5. |
| `Article.dc.html?slug=mba-fees` | `/online-degree-guides/mba-fees` (programmatic guide) or `/blog/[slug]` (CMS article) | Guide slugs are `{courseKey}-{fees\|eligibility\|career-scope\|ugc-approval}`, e.g. `b-com-fees`. |
| `EMICalculator.dc.html` | `/tools/emi-calculator` | — |
| `HowWeVerify.dc.html` | `/how-we-verify` | — |
| `Recommender.dc.html` | `/recommender` | — |

### 0.3 Assets the design references, checked against `public/`
The design loads everything from `https://unnatividya.com/...`. Use local `/public` paths through `next/image`.

| Design asset | In `public/`? | Notes |
|---|---|---|
| `/universities/{manipal-university-jaipur,sikkim-manipal-university,amity-online}-logo.svg` | Yes, all 3 | Already used via `universityMedia[id].logo` |
| `/universities/{slug}-campus.webp` | Yes, all 3 | **`amity-online-campus.webp` is 2.6 MB** (others are 100–150 KB). Always serve it through `next/image` with `sizes`, and consider re-encoding. Current alt text: "Manipal University Jaipur campus", "Sikkim Manipal University campus", "Amity University Noida campus". |
| `/universities/manipal-university-jaipur-partner-logo-{1..6}.svg` | Yes | **SMU and Amity partner logos 1–6 also exist.** The design shows partners for MUJ only (`hasPartners: muj`, University L134). The current page shows all three, gated by `publicAssetExists`. |
| `/approvals/{ugc,naac,aicte,wes,aiu}.svg` | Yes, all 5 | "QS ranked" (Amity) has no image, so the design filters it out of the recognition grid. |
| `/universities/*-moment-{1..3}.webp` | Yes | Not used by the design. The Campus & learner moments section stays removed, as the expansion plan says. |
| `/blog/*.webp` (26 covers) | Yes | **The design never uses article covers.** Its Guides hub and Article have no images. The current blog uses them on cards, in the article hero and in the rail. |

### 0.4 Data differences (design `uv-data.js` vs repo catalog)
- University reviews: design SMU "2,180" vs repo 2110; Amity "5,960" vs repo 4870. Learners: design SMU/Amity "—", repo 38,000+ and 85,000+ (deferred claims). Highest package and partners: design SMU/Amity "—", repo ₹15 LPA / 210 and ₹21 LPA / 400. The README says SMU/Amity review counts and some university descriptions are placeholders. **Use repo/CMS values, never `uv-data.js`.**
- About text differs. The design's `about` for MUJ equals the repo's `enrichment.overview[0]`. SMU and Amity design text is new: "…with some of the lowest listed tuition in our catalog" and "…with WES recognition and the widest program range of the three". This is comparative marketing copy and is not in the repo.
- Specializations: the design derives **71** specializations from its data. The repo has **101** (`allSpecializationPages`, verified by parsing `catalog.ts`). The design's degree list and counts are therefore wrong for production.
- Guides: the design has **6** hard-coded guides (`uv-data.js` L58–65). The repo has **68** programmatic guides (17 degrees × fees/eligibility/career-scope/ugc-approval) plus **26** CMS blog articles.

---

## 1. Universities listing: design `Universities.dc.html` → route `/universities`

### 1.1 Design spec, top to bottom

**Header**: UVHeader `active="unis"` (L18).

**Hero** (L19–25). Listing hero background, bottom border `1px #EEECF8`.
- Inner: `max-width:1240px; margin:0 auto; padding:24px clamp(16px,3vw,32px) 36px`.
- Breadcrumb: "Home" › "Universities".
- H1 "**Universities we cover**": `margin:14px 0 0; font-size:clamp(30px,4.2vw,46px); letter-spacing:-0.035em; font-weight:800`. There is no line-height, so it uses the default. Add `text-wrap:balance` per the README.
- Paragraph: `margin:10px 0 0; color:#4A4867; font-size:16px; max-width:620px`. Copy: "**Three institutions, every program checked against the UGC-DEB entitlement list. Approvals re-checked every admission cycle.**" (L23)

**Main** (L26): `flex:1; max-width:1240px; width:100%; margin:0 auto; padding:32px clamp(16px,3vw,32px) 0; display:flex; flex-direction:column; gap:18px`.

**University cards** (L27–46). One per university, in object order muj, smu, amity.
- Card: `display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr)); border:1px solid #E8E6F3; border-radius:20px; overflow:hidden; background:#fff`. With two columns, the image is on the left. Once the container is under ~680px, the image stacks on top. There is no hover state.
- **Media cell** (L29): `position:relative; min-height:240px; background:#ECE9FE`. `<img src=campus alt="">` is absolutely positioned (`inset:0`, 100%/100%, `object-fit:cover`).
  - **Rating badge**, top-left: `position:absolute; left:16px; top:16px; background:#fff; border-radius:10px; padding:6px 10px; font-size:13px; font-weight:800`. Content: "★ {rating} " plus `<span style="font-weight:500;color:#6F6D8C">({reviews})</span>`, e.g. "★ 4.7 (3,240)". The star is a text glyph in the inherited colour, not the `#F0A30A` star token.
- **Details cell** (L30): `padding:clamp(18px,3vw,28px); display:flex; flex-direction:column; gap:14px`.
  - Row 1 (L31): flex, gap 14, align center. Logo tile: `56×56; border-radius:14px; border:1px solid #ECEAF6; padding:8px; flex:none`, centred, holding `<img alt="">` with max 100%/100%. Then the name (`font-size:22px; font-weight:800; letter-spacing:-0.02em`; this is a **div, not a heading**) and "{loc} · est. {est}" (`14px; #6F6D8C`), e.g. "Jaipur, Rajasthan · est. 2011".
  - About (L32): `margin:0; color:#4A4867; line-height:1.6; font-size:15px`, reading `u.about`.
  - Approval pills (L33): flex wrap, gap 6. Each pill: `font-size:12px; font-weight:700; padding:5px 10px; border-radius:7px; background:#E7F6EE; color:#12784B; display:flex; align-items:center; gap:4px` with a `verified` icon (15px). Values come from `u.approvals`: MUJ "UGC-entitled, NAAC A+, AICTE, WES recognised"; SMU "UGC-entitled, NAAC A+, AIU member"; Amity "UGC-entitled, NAAC A+, WES recognised, QS ranked".
  - **4-stat block** (L34–39): `display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:8px; padding:14px; border-radius:14px; background:#F8F7FD`. Each cell has a value (`18px/800`) and a label (`12px #6F6D8C`):
    1. `{programs}` / "programs" (count of catalog courses: MUJ 9, SMU 9, Amity 12 in the design data)
    2. `{placement}%` / "placement" (**unlabelled university-wide placement**)
    3. `{avg}` / "avg package" (**unlabelled**)
    4. `{feeFrom}` / "fee/yr from" (the university's `feeFrom` string: ₹75,000 / ₹55,000 / ₹99,000)
  - Buttons (L40–43): flex wrap, gap 8, `margin-top:auto`.
    - Primary "**View {short} programs**" (e.g. "View MUJ programs"): `flex:1 1 160px; text-align:center; padding:12px; border-radius:11px; background:#5B4CF0; color:#fff; font-weight:700`, hover bg `#4A3BDB`. The href is the **University detail page**, not a programs list.
    - Outline "**Browse all {programs} courses**": `flex:1 1 160px; padding:11px; border-radius:11px; border:1px solid #D6D0FA; font-weight:700`, primary-coloured text. It goes to `Courses?uni={id}`. No hover style is specified; the README's outline hover is bg `#F4F2FF`.
  - Height: buttons are about 12+~20+12 ≈ 44–46px tall, which meets the 44px target.

**"Universities at a glance"** (L47–56): `section`, `margin-top:40px`.
- H2: `margin:0 0 6px; font-size:clamp(22px,3vw,28px); letter-spacing:-0.025em; font-weight:800`.
- Sub: `margin:0 0 18px; color:#4A4867`. Copy: "**The best value in each row is highlighted.**"
- Table wrapper: `border:1px solid #E8E6F3; border-radius:16px; overflow-x:auto`. Inner `min-width:640px`.
- Header row: `display:grid; grid-template-columns:1.2fr repeat(3,1fr); background:#F8F7FD; border-bottom:1px solid #E8E6F3`. The first cell is empty. Each university cell has `padding:14px 18px; display:flex; align-items:center; gap:8px; font-weight:800`, a 24×24 logo (`alt=""`, contain) and the short name.
- Body rows: same grid, `border-bottom:1px solid #F3F2F9`. The label cell is `padding:13px 18px; color:#6F6D8C; 14px; 600`. Value cells are `padding:13px 18px; 14px`, normally weight 500 in `#16133F` on `#fff`. The **best** cell uses weight 800, `#12784B` and bg `#F3FBF6` (L73).
- Rows (L76):
  1. "Established": no highlight
  2. "Location": no highlight
  3. "Online programs": **max highlighted**
  4. "Annual fee from": **min highlighted**. Values come from a **hard-coded** `feeN = {muj:75000, smu:55000, amity:99000}` (L74), formatted ₹.
  5. "Placement assistance": `{placement}%`, **max highlighted**
  6. "Average package": `₹{avgN} LPA`, **max highlighted**
  7. "Approvals": joined with ", ", no highlight
- The table uses div grids, so it has no `<table>`/`th`/`scope` semantics and no caption. The scroll wrapper has no `tabindex`, `role="region"` or label.

**FAQ** (L57–59): `section margin-top:48px`. UVFaq title "Frequently asked questions", subtitle "About the universities we list." Items (L77):
1. "Are all three universities UGC-entitled?" / "Yes. Every program we list is checked against the UGC-DEB entitlement list each admission cycle."
2. "Which university has the lowest fees?" / "Sikkim Manipal University has the lowest listed annual fee (from ₹55,000/yr). Compare specific programs for exact totals."
3. "Are degrees recognised abroad?" / "MUJ and Amity list WES recognition. Confirm requirements with the receiving country or employer."
4. "Can I switch universities after enrolling?" / "Transfers depend on each university's rules. Talk to a counsellor before you apply."

**Footer**: UVFooter.

**Interactions and state**: none beyond links. No URL params. Responsive behaviour comes only from auto-fit. The 4-stat block is a fixed 4 columns. At a 320px viewport, each cell is about 55–60px wide, so "₹75,000" and "₹7.2 LPA" at 18px/800 will overflow or clip. Use 2×2 under ~420px.

**Accessibility as designed**: university names are divs, not headings, so the page jumps from H1 to the H2 "Universities at a glance". Logos and campus images have empty alt text, which is acceptable because the name is adjacent, but the card as a whole has no accessible name. The rating "★" has no text equivalent such as "Rated 4.7 out of 5". The table has no semantics.

### 1.2 Current implementation (`src/app/universities/page.tsx`, 116 lines)
- `force-dynamic`, reads `getPublishedCatalog()` and wraps in `PublishedCatalogBoundary`. Metadata: title "Online Universities", canonical `/universities`.
- `.page-kicker`: white with a hairline border. Breadcrumb "Home > Universities". H1 "Universities we cover". Subtitle "{n} universities with online degree options. Explore their courses, tuition and entry requirements before choosing."
- Guidance line: "Fees below are listed total tuition in INR. Confirm the current admission session and applicant category on the course page. How we verify information" (link `/how-we-verify`).
- `article.card.uni-row.university-discovery-card`, `aria-labelledby`. Grid 220px media + content, reflowing at breakpoints (globals.css L3698–3722). The campus image comes from `next/image` with real alt text from `universityMedia`.
- `h2` with a link to `/universities/[slug]`. City · Established. About text. Up to 3 `ApprovalBadge` (grey pills).
- `dl.university-course-facts` holds three facts:
  - Online programs.
  - **"Listed total tuition from"**, computed as the minimum of the university's course fees. The 77th increment deliberately shows lowest listed **total tuition** as such, not the "annual fee from" string.
  - Degree levels.
- **Ratings and placement are hidden** in a collapsed `<details>` "Ratings and placement figures": Rating x / 5 (reviews), Placement rate %, Average package. This deliberately de-emphasises deferred claims.
- Actions: "Browse {n} courses" → `/courses?university={id}` (primary); "**Apply now**" → `/lead?university={id}`, `data-open-lead`, `rel="nofollow"` (secondary); "University details →".
- Closing `dark-decision-card`: "Can't decide between universities?" with copy, "Compare now" → `/compare` and "Find my course" → `/recommender`.
- No comparison table, no FAQ and no JSON-LD on this page.
- Styling is the old system: `#544CC8` primary, `#363634` ink, 8px radius, DM Sans.

### 1.3 Changes required
1. Restyle the hero to the design's listing hero: breadcrumb with chevrons, H1 clamp(30–46px)/800, 16px `#4A4867` sub. **Do not use the design's subtitle claim** (see 1.4). Suggested copy, based on the present text: "Three universities. Compare their online degrees, listed total tuition and entry requirements, then check each program's recognition on its course page."
2. Replace `.uni-row` with the design's wide card: 20px radius, `#E8E6F3` border, auto-fit `minmax(min(100%,340px),1fr)`, campus media `min-height:240px` with a cover image through `next/image` (`fill`, `sizes="(max-width: 720px) 100vw, 50vw"`), and a details column with padding `clamp(18px,3vw,28px)` and gap 14.
   - Keep the `article` + `aria-labelledby` and make the university name an **`h2`** styled 22px/800 (heading order).
   - Logo tile 56×56, radius 14, `#ECEAF6` border.
   - Approval pills: design styling is acceptable only if they stay visually "institution-level". Suggest a neutral, non-green pill, or a small "University-level" caption before the pills (see 1.4).
3. Stat block: keep the 4-cell visual but change its contents to honest labels.
   - Programs.
   - "**Listed total tuition from**", computed as now. Do **not** use "fee/yr from" or `feeFrom`.
   - Degree levels (UG · PG), or duration range.
   - Leave placement and average package **out of the prominent block**. Either keep the existing collapsed "Ratings and placement figures" `<details>` under the stats, or label them "University-wide placement assistance (unverified)". Make the grid `repeat(2,…)` under ~420px.
4. Buttons: primary "Browse {n} courses" → `/courses?university={id}`, plus an outline "University details" → `/universities/{slug}`. The design's "View MUJ programs" label is misleading because it goes to the detail page; if it is kept, link it to `/universities/{slug}#sec-programs`. **Keep "Apply now"** (data-open-lead) on each card, or drop it consciously (header and rail still have it). The current page has it; the design doesn't.
5. Rating badge on the image: the owner allows ratings to stay visible (constraint 5), but the expansion plan says not to enlarge them or turn them into trust badges. **Recommendation:** omit the image badge and keep the rating inside the collapsed "Ratings and placement figures" details, or show it small in meta text. The owner needs to decide.
6. "Universities at a glance" table:
   - Implement it as a real `<table>` with `<caption>` (or `aria-labelledby` to the H2), `<th scope="col">` per university and `<th scope="row">` per label.
   - Wrap it in `<div role="region" aria-labelledby tabindex="0">` with `overflow-x:auto`, plus a visible scroll cue on mobile.
   - **Remove best-value highlighting entirely** and remove the sentence "The best value in each row is highlighted." (constraint 4; design standard "A cheapest price is not automatically best value").
   - Rows: Established; Location; Online programs; "Listed total tuition from", computed and labelled as total, not annual; "Placement assistance (university-wide, unverified)"; "Average package (university-wide, unverified)"; "University-level approvals".
   - Optional: "NIRF 2025 University result" with ranked-institution caveats from `nirfUniversityRankings` (Amity's rank belongs to Amity University, Gautam Budh Nagar).
7. Add a FAQ section, but rewrite the answers (see 1.4).
   - Use the existing `details.faq-item` pattern (native `<details name=…>`, works without JS), styled to the UVFaq card look: border `#E8E6F3`, radius 12, open border `#CFC9FA`, `CircleHelp` icon, `Plus`/`Minus` icon, 52px min row.
   - Drop "View all FAQs →", or point it at a real target.
   - Add FAQPage JSON-LD only if the answers are sourced.
8. Keep the closing compare/recommender CTA (`dark-decision-card`). The design dropped it. Restyle it as the navy `#16133F` strip used on Specializations (radius 20, padding clamp(22px,3vw,32px)). Note that `/compare` is gated.
9. Tokens: introduce the design tokens as CSS custom properties alongside or replacing `--uv-*` (`--uv-primary:#5B4CF0`, ink `#16133F`, border `#E8E6F3`, and so on). This is a global decision covered elsewhere.

### 1.4 Conflicts and questions
- **C-U1 Best-value highlighting** (L49 copy, L73 `row()` with 'min'/'max' modes, L76): highlights Online programs (max), Annual fee from (min), Placement (max) and Average package (max) in green. This violates constraint 4 (no "best/Lowest" highlighting on unverified data; placement and package are deferred) and the design standard §4. Remove it.
- **C-U2 Hard-coded annual fees** (L74 `feeN`) and the "fee/yr from" label (L38). They duplicate the deferred `feeFrom` strings and use a different fee period from the rest of the site, which shows total tuition. The 77th increment moved this page to "Listed total tuition from". The design standard says fee periods must align. Use computed total tuition.
- **C-U3 Unlabelled placement and average package** in the prominent stat block (L36–37) and the table (L76). Constraint 4 says these must be labelled university-wide. The claims register lists them as "Deferred", and the expansion plan says "do not enlarge them". The current page hides them in `<details>`.
- **C-U4 Rating badge on campus image** (L29). Ratings may stay visible (constraint 5), but this enlarges a deferred claim into a trust badge, against the expansion plan's "do not … create new trust badges". Review counts in the design data (SMU 2,180, Amity 5,960) differ from the repo (2110, 4870) and are README-flagged placeholders.
- **C-U5 Recognition claims in hero and FAQ.**
  - L23: "every program checked against the UGC-DEB entitlement list. Approvals re-checked every admission cycle."
  - L77 FAQ 1: "Yes. Every program we list is checked … each admission cycle."
  - The owner reworded the near-identical homepage claim (NEXT_PHASE_PLAN §11 #11) to "Approvals you can check: we link each program to the official UGC-DEB list and show when we last checked it". Recognition is per program and dated (constraint 8). Five Amity programs depend on the owner's Amity UP attribution (CLAIMS_REGISTER). Replace these with copy that points to each course's Recognition section.
- **C-U6 "Which university has the lowest fees?"** (L77 FAQ 2): "Sikkim Manipal University has the lowest listed annual fee (from ₹55,000/yr)". This uses the deferred `feeFrom`. SMU's lowest **listed total tuition** in the catalog is ₹75,000 (B.Com/BA/M.Com/MA). If kept, compute the answer from catalog totals and phrase it factually ("lowest listed total tuition is X for Y").
- **C-U7 Approval pills styled as green "verified" success badges** (L33). University-level approvals are "not yet sourced per badge" (CLAIMS_REGISTER), and constraint 8 says institution badges must not imply program approval. The green `verified` icon reads as verification. Use neutral styling and a "University-level" label.
- **C-U8 WES FAQ** (L77 FAQ 3): "MUJ and Amity list WES recognition". This is acceptable as an attributed statement ("list"), but WES is an unsourced university-level badge. Add a source or keep the caveat.
- **C-U9 Omitted current features**: the Apply now per card, the "How we verify" guidance line, the collapsed deferred-figures disclosure and the compare/recommender CTA.
- **C-U10 Placeholder copy**: SMU and Amity `about` in `uv-data.js` are new comparative claims ("some of the lowest listed tuition", "the widest program range of the three"). Use the repo/CMS `about`.
- **C-U11 Heading structure**: university names are not headings. Fix this in implementation.
- **Q**: Should the at-a-glance table show NIRF 2025 results? It would be sourced (`src/data/nirf-rankings.ts`), but it would need the "ranks the institution, not its online courses" caveat in the table.
- **Q**: Should SMU and Amity hiring-partner logos appear anywhere on the listing? The design only shows partners for MUJ, and only on the detail page.

---

## 2. University detail: design `University.dc.html` → route `/universities/[slug]`

### 2.1 Design spec, top to bottom
URL: `?id=muj|smu|amity` (L119), defaulting to `muj`, with unknown ids falling back to MUJ. Production must use `/universities/[slug]` and `notFound()` for unknown slugs, as today.

**Header**: UVHeader `active="unis"`.

**Hero** (L19–44). Detail hero background with **no bottom border**.
- Inner: `max-width:1240px; padding:22px clamp(16px,3vw,32px) 0`.
- Breadcrumb (wraps): Home › Universities › {u.name}.
- 2-column grid (L22): `grid-template-columns:repeat(auto-fit,minmax(min(100%,440px),1fr)); gap:clamp(24px,4vw,48px); align-items:center; margin-top:20px`. It stacks below roughly 950px of container width.
- **Left column**:
  - Logo tile (L24): `64×64; border-radius:16px; background:#fff; border:1px solid #ECEAF6; padding:9px`, holding `<img alt="">`.
  - H1 (L25): `margin:16px 0 0; font-size:clamp(34px,4.6vw,52px); letter-spacing:-0.04em; font-weight:800; line-height:1.04`, reading `{u.name}`.
  - Tagline (L26): `margin-top:10px; color:#5B4CF0; font-size:clamp(15px,1.6vw,18px); font-weight:600`. Built as `approvals.slice(0,3).join(' | ') + ' | Industry-aligned online programs'` (L122). MUJ gives "**UGC-entitled | NAAC A+ | AICTE | Industry-aligned online programs**". SMU gives "UGC-entitled | NAAC A+ | AIU member | Industry-aligned online programs".
  - About (L27): `margin:12px 0 0; color:#4A4867; font-size:15px; line-height:1.65; max-width:560px`, reading `u.about`.
  - Buttons (L28–31): flex wrap, gap 10, `margin-top:22px`.
    - Primary "**Compare {short} programs**" plus an `arrow_forward` icon at 20px: `padding:13px 20px; border-radius:11px; background:#5B4CF0; color:#fff; font-weight:700; display:flex; align-items:center; gap:6px`, hover `#4A3BDB`. Href `Compare?uni={id}`.
    - Outline "**Apply now**" with a leading `support_agent` icon at 20px: `padding:12px 18px; border-radius:11px; border:1px solid #D6D0FA; background:#fff; font-weight:700`. Href `Apply?uni={id}`. **Apply now is the secondary button here.**
- **Right column** (L33–38): `position:relative`.
  - Campus `<img alt="">`: `width:100%; aspect-ratio:16/10; object-fit:cover; border-radius:22px; display:block; background:#ECE9FE`.
  - **Stacked approval badges**, absolute `right:12px; top:12px`, flex column, gap 8. These are the first 3 approvals (`ap3`). Each: `background:#fff; border-radius:12px; padding:9px 14px; font-size:13px; font-weight:700; box-shadow:0 10px 24px -12px rgba(0,0,0,0.3); display:flex; gap:8px; align-items:center` with a `verified` icon (18px, `#12925A`).
- **5-stat strip** (L40–42): `display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,180px),1fr)); background:#fff; border:1px solid #E8E6F3; border-radius:16px; margin-top:32px`. Each cell: `display:flex; gap:12px; align-items:center; padding:16px 18px; border-right:1px solid #F0EEF8`. The right border appears on every cell, including the last cell and wrapped cells. Icon tile: `40×40; radius 10; bg #F1EEFF; colour #5B4CF0`, icon 22px. Value `17px/800`, label `12px #6F6D8C`. Stats (L126):
  1. `menu_book`: "{n} programs" / "Online degrees"
  2. `event`: "{minYears}–{maxYears} years" / "Program duration". Computed from `months/12`, deduplicated and sorted, so "2–3 years". With a single duration it becomes "2–2 years" (edge-case bug).
  3. `payments`: "{min fee}+" / "**Total program fee**"
  4. `laptop_mac`: "100% Online" / "Learn from anywhere"
  5. `work`: "{placement}%" / "**Placement assistance**" (unlabelled university-wide)

**Sticky section tabs** (L45–49): a full-width bar placed **after** the hero section, `margin-top:24px`.
- Bar: `position:sticky; top:68px; z-index:20; background:rgba(255,255,255,0.97); border-bottom:1px solid #ECEAF6`.
- Inner: container, `display:flex; gap:26px; overflow-x:auto`.
- Each tab is a **div** with `onClick`: `cursor:pointer; white-space:nowrap; padding:15px 0; font-size:14px; font-weight:700`. Default colour `#4A4867` with a transparent 2px bottom border. Active colour `#5B4CF0` with a `2px solid #5B4CF0` bottom border.
- Tabs (L124): Overview → `u-about`, Online programs → `u-programs`, Approvals → `u-approvals`, Placements → `u-placements`, **Admission → `u-placements` (same target)**, FAQs → `u-faq`.
- Clicking sets the active state and runs `window.scrollTo(top − 130, smooth)` (L127).
- Active state changes only on click; there is no scroll-spy. "Admission" can never show as active (`label !== 'Admission'`).
- The bar is about 15+~18+15+2 ≈ 50px tall. Header 68 + tabs 50 = 118, so the −130 offset leaves 12px of breathing room.

**Main** (L50): `padding:28px clamp(16px,3vw,32px) 0; display:flex; flex-direction:column; gap:20px`.

**About + Key highlights** (L51–61), `id="u-about"`: grid `repeat(auto-fit,minmax(min(100%,340px),1fr)); gap:20px`.
- Card A: `border:1px solid #E8E6F3; border-radius:18px; padding:24px`.
  - H2 "About {u.name}": `22px/800; letter-spacing:-0.02em`.
  - Paragraph `{about} {about2}`: `margin:10px 0 0; color:#4A4867; line-height:1.7; 15px`.
  - Badge row (flex wrap, gap 18, `margin-top:18px`) repeats `ap3`, each with a 40px **round** `#F1EEFF` tile, a `workspace_premium` icon and 14px/700 text.
- Card B, "Key highlights" (H2 22px/800, `margin:0 0 10px`). Rows: `display:flex; justify-content:space-between; gap:12px; padding:10px 0; border-bottom:1px solid #F3F2F9; 14px`. Key in `#6F6D8C`; value in `<b>`, right-aligned. Rows (L128):
  - Establishment year
  - Location
  - Accreditation (NAAC string)
  - **UGC recognition: "Yes (UGC-entitled)"**
  - Mode of learning: "100% online"
  - Typical program fees: "{min} – {max}"
  - **Average package: {avg}** (unlabelled)

**Online programs** (L62–73), `section id="u-programs"`, `margin-top:20px`.
- Head row: flex wrap, space-between, align end, gap 12, `margin-bottom:16px`. H2 "Online programs at {u.name}" (`clamp(22px,3vw,28px)/800`, `-0.025em`). Link "View all programs →" (14px/700) → `Courses?uni=`.
- Grid: `repeat(auto-fill,minmax(min(100%,260px),1fr)); gap:12px`. **Flat list**, with no UG/PG grouping.
- Row card: an `<a>` with `display:flex; gap:14px; align-items:center; padding:16px; border:1px solid #E8E6F3; border-radius:14px; color:#16133F`; hover border `#CFC9FA` and shadow `0 14px 30px -22px rgba(60,45,170,0.45)`. Contents:
  - 46×46 icon tile (radius 12, `#F1EEFF`/`#5B4CF0`, 24px stream icon: business_center / computer / account_balance / auto_stories).
  - Title (800), e.g. "Online MBA".
  - "{months} months · {fee}" (13px `#6F6D8C`).
  - "{N specialisations}" (12px/700 `#5B4CF0`).
  - A `chevron_right` at the end.
- No Save, EMI or Compare control.

**Approvals & recognition + Scholarships** (L74–85), `id="u-approvals"`: grid `minmax(min(100%,420px),1fr)`, gap 20, `margin-top:20px`.
- Card "Approvals & recognition": a `verified_user` icon (24px primary) beside H2 (20px/800). Sub: "**Recognized and accredited by leading regulatory bodies.**" (14px `#6F6D8C`, `margin:6px 0 14px`).
  - Grid `repeat(auto-fit,minmax(150px,1fr)); gap:10px`. Tiles: `padding:14px; border-radius:12px; background:#F8F7FD; flex column gap 8`. Each has an approval logo `<img alt="">` (height 30px) and a name (14px/800).
  - Only approvals with an image appear (UGC, NAAC, AICTE, WES, AIU), so Amity's "QS ranked" is dropped.
- Card "Scholarships & fee benefits": a `savings` icon. Sub: "**Make quality education more accessible with flexible options.**" Tiles (bg `#F8F7FD`, radius 12, padding 14): a coloured icon (24px), a title (14px/800) and a description (12px `#6F6D8C`, lh 1.45).
  - MUJ (L131):
    - `military_tech` `#C2620E`: "Merit scholarships" / "Up to 20% for eligible categories"
    - `credit_card` `#5B4CF0`: "Easy EMI options" / "**No-cost EMI on all programs**"
    - `redeem` `#C03673`: "Special concessions" / "Defence, differently-abled, alumni"
  - Others (L132):
    - `credit_card`: "Easy EMI options" / "No-cost EMI through loan partners"
    - `calendar_month` `#12925A`: "Semester-wise fees" / "Pay per semester instead of upfront"
    - `support_agent` `#C2620E`: "Ask about concessions" / "Confirm current offers with a counsellor"

**Placements + Admission** (L86–100), `id="u-placements"`: same 2-column grid.
- Card "Placements & career support" (`work` icon).
  - A 2-column grid (`repeat(2,1fr)` fixed, gap 8, `margin-top:14px`) of chips: `padding:12px; radius 12; bg #F8F7FD; 13px/700`, each with a 20px primary icon. Chips (L133, **identical for all three universities**): `description` "Resume clinics", `record_voice_over` "Mock interviews", `work_history` "Job board access", `groups` "Alumni networking".
  - If MUJ: a 3-column grid of 6 partner logos (`height:52px; border:1px solid #F0EEF8; radius 10; padding 8`), each with `alt="Hiring partner"`.
  - Note (12px `#6F6D8C`): "**Placement assistance, not a guaranteed offer — as stated on the university's own pages.**"
  - **No placement figures** appear in this card. The figures appear only in the hero strip and Key highlights.
- Card "Admission process" (`how_to_reg` icon). Sub: "**A simple and transparent enrollment process.**"
  - Vertical steps (flex, gap 14, padding 8px 0): a 30px **round** `#5B4CF0` number (13px/800 white), a title (15px/800) and a description (13px `#4A4867`, lh 1.5).
  - Steps come from `UV.ADMISSION` (generic, the same for all): "Application" / "Fill basic, education, and work-experience details and pay the application fee."; "Fee payment" / "Pay first semester/year fee or full program fee through available payment/EMI options."; "Document upload" / "Upload academic documents, ID proof, and other requested records."; "University approval" / "The university evaluates documents and confirms admission."

**FAQ** (L101): `section id="u-faq"`, `margin-top:28px`. UVFaq title "Frequently asked questions", subtitle "Quick answers about {u.name} and its online programs." Items (L137, **the same for all universities** with the name interpolated):
1. "Is {name} UGC entitled?" / "{short} online degrees listed here are maintained as UGC-entitled online degree programs. Always verify the current admission-cycle entitlement before enrolment."
2. "Are exams online?" / "Official program pages describe online learning and online proctored assessment flows. Exact exam rules can vary by program and cycle."
3. "Does {short} offer EMI?" / "Official pages show no-cost EMI options for many programs, with terms depending on finance partner and selected payment plan."
4. "Is placement support provided for online students?" / "Resume clinics, mock interviews, job board access, and alumni networking support. This is placement assistance, not a guaranteed job offer."
5. "What is the eligibility criteria for admission?" / "UG programs need 10+2; PG programs need a bachelor's degree. Minimum marks vary — check each program page."
6. "How can I speak to an expert?" / "**Call 1800-120-4050** or request a callback — counselling is free."

**Other universities to consider** (L102–107): `section margin-top:28px`. H2 `clamp(22px,3vw,28px)/800`, `margin:0 0 16px`. Grid `minmax(min(100%,340px),1fr)`, gap 12. Each item is an `<a>` with `display:flex; gap:14px; align-items:center; padding:12px; border:1px solid #E8E6F3; border-radius:16px`; hover border `#CFC9FA`. Contents: campus thumbnail `110×76` (radius 12, cover, `alt=""`), name (800), "{loc} · ★ {rating}" (13px `#6F6D8C`), "from {feeFrom}/yr" (13px/700 primary) and `arrow_forward`.

**Not in the design**: no sticky enquiry rail, no mobile sticky Apply bar, no sources, no NIRF, no JSON-LD and no per-university content.

**Accessibility as designed**:
- Tabs are clickable divs: no `<a href="#…">`, no `role`/`tabindex`/keyboard support and no `aria-current`.
- Images all have `alt=""`. That is acceptable for the logo and campus, but the partner logos say "Hiring partner", which is not unique or meaningful.
- The FAQ toggle is not keyboard-operable (UVFaq).
- The stat strip draws a stray right border on wrapped and last cells.
- Contrast is fine. White on `#5B4CF0` is about 5.6:1.

### 2.2 Current implementation (`src/app/universities/[slug]/page.tsx`, 365 lines; increments 77 and 80)
- `generateMetadata`: "{name} Online Degrees", description, canonical, OG image = campus. JSON-LD: `CollegeOrUniversity` with **no AggregateRating** (explicit comment, owner decision), `OfferCatalog` of courses, BreadcrumbList and FAQPage.
- **Dark hero** (`.detail-hero`, `#263238`):
  - Breadcrumb; 60px white logo tile with alt "{short} logo"; H1.
  - "{city} · Established {year} · {learners} online learners". Learner counts are deferred claims.
  - Approval logos on white tiles, each with alt = the approval name.
  - ★ rating (reviews).
  - Campus image, `priority`.
- `.stats-band`: "published programs", "undergraduate", "postgraduate", "listed total tuition from".
- `SectionPillNav` (scroll-spy, `aria-current="location"`, sticky at top 68px). On ≤640px it becomes a "Jump to section" `<select>` that also moves focus. Items: About, Recognition, Programs, Support, Admission, Scholarships.
- `detail-layout`: main stack plus a sticky `aside` at `top:118`.
  - **About** (`#sec-about`): `enrichment.overview` paragraphs plus 6 fact tiles (Established, Location, Online learners, Annual fee from, Batches "January & July", Exams "Online proctored"). These tiles include deferred and unevidenced claims; see 2.4.
  - **Rankings & recognition** (`#sec-rankings`):
    - Intro: "These are university-level claims. A program's online-mode listing depends on its awarding institution and academic session; check the Recognition section of the specific course before enrolment."
    - **NIRF card** (`.nirf-ranking-card`, increment 80):
      - "NIRF India Rankings 2025 · University category"
      - The result: "Rank 58", "Rank band 151–200" or "Rank 22"
      - "Ranked institution: …"
      - An optional note. SMU: "NIRF publishes this as a band…". Amity: "This result belongs to the named Uttar Pradesh institution…".
      - "NIRF ranks the institution, not its online courses or mode of delivery."
      - A source link, "Check the official NIRF 2025 University table" (`target=_blank`, `rel=noopener noreferrer`).
    - Then a 2-column grid of `enrichment.rankings` tiles. Each has an approval icon, a title and a **per-badge explanatory note**, e.g. "AICTE norms compliant: Shown on the official Online MBA MUJ recognition section."
  - **Programs** (`#sec-programs`):
    - Intro: "The figures below are listed total tuition in INR…".
    - **Grouped into "Undergraduate degrees" and "Postgraduate degrees"** (h3).
    - Each course is an `article.guide-fee-card` with h3 link, **SaveButton** (44px), and `dl` Duration / Listed total tuition / EMI from, plus "View program".
    - Empty state text when there are no programs.
  - **Placements & hiring partners** (`#sec-placements`):
    - Caveat: "Career support differs from a guaranteed job. The figures below are university-wide claims; their cohort, collection method and online-program scope are still being reviewed."
    - `dl`: Placement assistance rate, Average package, Highest package, Hiring partners.
    - 6 partner logos per university (all three exist), alt "{short} hiring partner", with a dashed placeholder if a file is missing.
    - Per-university `placementSupport` chips.
    - The "not a guaranteed offer" note.
  - **Admission process** (`#sec-admission`): per-university `admissionSteps` (Amity: Choose program / Submit details / Pay fee / Start learning). The generic fallback includes "LMS login within 72 hours" (flagged in the claims register).
  - **Scholarships & fee concessions** (`#sec-scholarships`): a per-university table from enrichment (concession, listed amount, proof required), plus "Confirm the current admission session…".
  - **FAQ** (`#sec-faq`): **per-university** `enrichment.faqs` (6 each), as native `<details name="university-faq">`.
  - **Other universities to consider**: 2-column cards showing name, city · ★ rating · "from {feeFrom}/yr".
  - **Aside** (sticky):
    - "Get {short} brochure & fee details" / "Talk to a counsellor about eligibility, scholarships and the next batch." with **Apply now** (`/lead?university=`, data-open-lead) and "Compare with others" (`/compare`).
    - "**Before choosing {short}**" checklist (increment 77): "Choose the exact degree and check its eligibility." → `#sec-programs`; "Check program recognition separately from university badges." → `#sec-rankings`; "Confirm your total payable and any concession terms." → `#sec-scholarships`.
    - **Sources** box: hostnames from `enrichment.sourceUrls`, plus "How we verify our data →".
- `StickyMobileBar` with primary "Apply now".
- CSS: `.detail-section{scroll-margin-top:130px}`, 146px on mobile. `.pill-nav{top:68px}`. NIRF card styles are at globals.css L4579–4584.

### 2.3 Changes required
1. **Hero**: switch from the dark `#263238` hero to the design's light detail hero.
   - 2-column auto-fit 440px grid. 64px logo tile (radius 16; keep alt "{short} logo", or `alt=""` because the H1 names it). H1 clamp(34–52px)/800/-0.04em/1.04.
   - Replace the tagline with neutral, non-promotional text such as "{city} · Established {year}". Drop "Industry-aligned online programs" (see 2.4).
   - About paragraph from `enrichment.overview[0]` or `university.about`.
   - Buttons: **"Apply now"** (data-open-lead, `/lead?university=`) and "Compare {short} programs". Decide which is primary: the design makes Compare primary. The compare target must be `/compare?add=` with up to 3 ids from this university (which 3? see Q), or `/courses?university={id}` relabelled "Browse {short} programs".
   - Campus image through `next/image` (`priority`, `sizes`, aspect 16/10, radius 22).
   - **Overlay badges**: render them as neutral "University-level" chips, or remove them from the image (constraint 8). If kept, use the approval logos rather than green "verified" checks.
2. **Stat strip**: use the design's white 16px-radius strip with 40px icon tiles. Contents:
   - "{n} programs" / "Online degrees"
   - "{UG n} · {PG n}" or "2–3 years" / "Program duration". Fix the "2–2 years" edge case.
   - "{min}+" / "**Listed total tuition from**", not "Total program fee".
   - "100% online" / "Learn from anywhere", only if the owner confirms (see Q).
   - **Drop "Placement assistance 88%"** from the strip. If kept, label it "University-wide placement assistance (unverified)".
   - Fix the borders: `border-right` on all but the last cell, and use a grid gap or `:not(:last-child)`.
3. **Sticky tabs**: keep `SectionPillNav`, which has scroll-spy, `aria-current` and the mobile select, and restyle it to the design's underline tabs:
   - Bar `position:sticky; top:68px; z-index:20; background:rgba(255,255,255,.97); border-bottom:1px solid #ECEAF6`, inner gap 26, `overflow-x:auto`.
   - Links 14px/700 with `padding:15px 0` (≈49px target height, OK). Default `#4A4867`; active `#5B4CF0` with a 2px underline.
   - Keep real `<a href="#sec-…">`. Keep `scroll-margin-top:130px` (design offset −130) and 146px on mobile.
   - Tab labels and order (design + current): Overview (`#sec-about`), **Recognition** (`#sec-rankings`; the design says "Approvals"), Online programs (`#sec-programs`), Placements (`#sec-placements`), Admission (`#sec-admission`, its own section; fixes the design's duplicate target), Scholarships (`#sec-scholarships`), FAQs (`#sec-faq`).
   - Keep the ≤640px "Jump to section" select.
4. **About + Key highlights**: two cards (radius 18, padding 24, `#E8E6F3`).
   - About uses `enrichment.overview`. **Replace the repeated badge row** (`workspace_premium` circles) with nothing, or with a link to the Recognition section.
   - Key highlights: keep Establishment year, Location, "Listed total tuition: {min} – {max}" (rename from "Typical program fees") and Batches, if sourced.
   - **Remove** "UGC recognition: Yes (UGC-entitled)" and "Average package" (see 2.4). Remove "Accreditation NAAC A+" unless it is shown as "university-level". Remove "Mode of learning 100% online" unless confirmed. "Online learners" and "Exams: Online proctored" are deferred/unevidenced in the current fact tiles: drop them, or keep them only with owner sign-off.
5. **Recognition section** (design "Approvals & recognition" card):
   - Keep the H2 "Rankings & recognition" (or the design's "Approvals & recognition"), the university-level intro sentence and the **NIRF card**, restyled. Suggested NIRF card: card radius 18, `#E8E6F3` border, result at 24–28px/800, ranked-institution line, notes and the external link with a visible "opens in new tab" cue.
   - Use the design's tile grid (`minmax(150px,1fr)`, bg `#F8F7FD`, radius 12, 30px-high logo, 14px/800 title) **plus the current per-badge note** (`enrichment.rankings[].note`) at 12px `#6F6D8C`.
   - Drop the subtitle "Recognized and accredited by leading regulatory bodies." Use the existing intro instead.
   - Keep QS ranked as a text tile without a logo, instead of dropping it silently. Better still, have the owner decide (see Q).
6. **Online programs**:
   - Keep **UG/PG grouping** (h3 "Undergraduate degrees" / "Postgraduate degrees") and the design's compact row card: 46px stream icon tile, title, "{duration} · {listed total tuition}", "{N} specializations" and a chevron.
   - **Keep SaveButton** (≥44px) and **EMI from**. Two options: a row card with an inline save toggle placed outside the link, so there are no nested interactive elements; or the current `guide-fee-card` restyled.
   - "View all programs →" → `/courses?university={id}`. Keep the intro sentence about listed total tuition.
7. **Scholarships card**:
   - Use per-university `enrichment.scholarships` (title, listed concession, proof required) rendered as the design's tiles, with an icon per category: Medal for merit, Users or Gift for defence/alumni, CreditCard for EMI.
   - **Do not render the design's hard-coded tiles.** "No-cost EMI on all programs" (MUJ) is a new placement of the owner-stated EMI claim. "Semester-wise fees … instead of upfront" is unevidenced for Amity.
   - Keep the "Confirm the current admission session…" line.
8. **Placements card**:
   - Per-university `enrichment.placementSupport` chips in the design's 2-column chip style. Pick each icon from the label: FileText for resume, MessagesSquare for interview, Briefcase for jobs, Users for alumni/network, Headset for guidance.
   - Show partner logos for **all three universities** (the files exist), with alt "{short} hiring partner {n}" or the actual company names if known. Use a 3-column grid on desktop and 2 columns under 420px.
   - Keep the university-wide figures `dl` **with the current caveat sentence**, styled as the design's stat block, labelled e.g. "University-wide placement assistance rate (unverified)".
9. **Admission card**: per-university `enrichment.admissionSteps` in the design's vertical numbered list. Use an `<ol>` with 30px circle numbers. Drop the subtitle "A simple and transparent enrollment process." because it is promotional.
10. **FAQ**: keep per-university `enrichment.faqs` with FAQPage JSON-LD, styled per UVFaq. Never use the design's generic FAQ (see 2.4).
11. **Other universities**: use the design's row card (110×76 campus thumb, name, "{city} · ★ {rating}", "Listed total tuition from {computed min}"). Replace "from {feeFrom}/yr", which is the deferred annual string. Keep `/universities/[slug]` links.
12. **Keep the sticky aside**: Apply now, "Compare with others", the "Before choosing {short}" checklist and **Sources** (hostnames plus How we verify). The design has a single-column layout with no rail. Two choices: (a) keep the 2-column `detail-layout` with the right rail; or (b) move the checklist and sources into the main column, e.g. Sources under Recognition (the expansion plan wants claim-specific source links next to sections). **Keep `StickyMobileBar`** "Apply now" on mobile. Only one sticky action region may show at a time (design standard §3).
13. Keep the JSON-LD as is (no AggregateRating).

### 2.4 Conflicts and questions
- **C-UD1 Missing NIRF card** (increment 80, constraint 10). The design has no rankings section. It must be kept.
- **C-UD2 Missing recognition explanations.** The design omits the university-level intro, the per-badge notes and "check program recognition separately", and replaces them with "Recognized and accredited by leading regulatory bodies." (L77).
- **C-UD3 Badges imply program approval.** The tagline (L26/L122) "UGC-entitled | NAAC A+ | AICTE | …", the green-check overlay badges on the campus image (L35–37) and the repeated `workspace_premium` badge row (L55) all conflict with constraint 8 and the design standard §6 ("Institutional accreditation logos must not imply approval of every listed program").
- **C-UD4 "Industry-aligned online programs"** (L122): invented marketing copy.
- **C-UD5 Key highlights "UGC recognition: Yes (UGC-entitled)"** (L128). Recognition is per program and dated (constraint 8). The claims register removed "UGC-entitled" from course overviews pending 2026-27 publication.
- **C-UD6 Unlabelled placement and average package**: hero stat "88% Placement assistance" (L126) and Key highlights "Average package" (L128). Constraint 4 requires a university-wide label, and the claims register marks these deferred. The design also **drops** the current caveat sentence about cohort and scope (it keeps only "not a guaranteed offer").
- **C-UD7 Generic content presented as university-specific**:
  - Support chips (L133) are the same for all three. SMU's real list is Career guidance / Resume review / Interview preparation / Online learner support; Amity's is Career services / Interview preparation / Job-readiness guidance / Alumni network access.
  - Admission steps (L135, `UV.ADMISSION`) copy MUJ's for all three; Amity's real steps differ.
  - The FAQ (L137) is generic. The current per-university FAQs are sourced from enrichment.
- **C-UD8 Phone number**: FAQ 6 (L137) "Call 1800-120-4050 or request a callback" violates constraint 2. Also "request a callback" suggests a flow that doesn't exist; use Apply now.
- **C-UD9 Scholarships tiles**:
  - MUJ "No-cost EMI on all programs" (L131). The claims register treats this as an owner-stated exception to keep where it already is; the design standard says "Do not add new universal no-cost EMI promises". Putting it on the university page is a new placement.
  - Non-MUJ "Semester-wise fees" is applied to Amity without evidence.
  - The design drops the per-category "proof required" detail.
- **C-UD10 Exams FAQ** "online proctored assessment flows" (L137). The claims register removed "Online proctored" because it isn't evidenced per program. The current fact tiles still show "Exams: Online proctored" (a pre-existing issue).
- **C-UD11 "100% Online / Learn from anywhere"** in the stat strip and "Mode of learning: 100% online": needs owner confirmation per university (exam centres, practicals). This is probably low risk, but nothing in the repo evidences it.
- **C-UD12 Hiring partners MUJ-only** (L90/L134). The repo has real partner logo files for SMU and Amity too, and the current page shows them. Ask the owner whether SMU/Amity logos are verified partners. If not, consider removing them for all three.
- **C-UD13 Omitted current features**: the sticky Apply rail, the Before-choosing checklist, the Sources list (with How we verify), StickyMobileBar, SaveButton on program cards, EMI from, UG/PG grouping, the per-university scholarship proof table, JSON-LD and scroll-spy tabs.
- **C-UD14 URL params**: `?id=` (L119), `Compare?uni=` and `Apply?uni=` (L125). Use `/universities/[slug]`, `/lead?university=` and `/compare?add=`.
- **C-UD15 Tab bug**: "Admission" and "Placements" both target `u-placements` (L124), and "Admission" never shows active. Fix this by giving Admission its own section id.
- **Q**: "Compare {short} programs →": the gated compare tool takes at most 3 courses, and a university has 9–12. Options: link to `/courses?university=` with compare toggles; link to the editorial `/compare/[course]/[pair]` list filtered to this university; or rename the button. The owner needs to decide.
- **Q**: Which button is primary in the hero, "Apply now" or Compare? The design makes Apply secondary with a `support_agent` icon. The design standard says Apply now is the consistent entry label and should be "secondary to View details on discovery cards". Detail pages are not specified.
- **Q**: Should "QS ranked" (Amity) be shown? It is an unsourced university-level badge, and the design drops it silently because it has no logo.
- **Q**: Should learner counts (deferred) stay in the hero? The design omits them. Dropping them reduces deferred-claim exposure.

---

## 3. Specializations listing: design `Specializations.dc.html` → route `/specializations`

### 3.1 Design spec, top to bottom

**Header**: `active="specs"`.

**Hero** (L19–27): listing hero, inner padding `22px clamp(16px,3vw,32px) 28px`.
- Breadcrumb: Home › Specializations.
- H1 "**Explore specializations**": `margin:14px 0 0; clamp(30px,4.2vw,46px); -0.035em; 800`.
- Sub (L23): `margin:8px 0 0; #4A4867; 16px`. Copy: "**{total} specializations across MBA, BBA, BCA, MCA, B.Com and more. See which universities offer each one.**" (total = 71 in the design data; 101 in production).
- **Search box** (L24): a wrapper `display:flex; align-items:center; gap:10px; padding:0 16px; height:52px; background:#fff; border:1px solid #E4E1F3; border-radius:14px; margin-top:20px; max-width:560px`, with a `search` icon (22px `#6F6D8C`) and an `<input>` with `flex:1; border:0; outline:none; font-size:15px; background:transparent; min-width:0`.
  - Placeholder: "**Search Finance, Data Science, Marketing…**".
  - **No `<label>`**, **`outline:none`** with no focus replacement, and the search applies on every change.
- **Degree filter pills** (L25): `display:flex; gap:6px; margin-top:16px; overflow-x:auto; padding-bottom:2px`. Each pill is a **div** `onClick`: `cursor:pointer; white-space:nowrap; padding:8px 14px; border-radius:99px; font-size:13px; font-weight:700; border:1px solid`.
  - Inactive: bg `#fff`, text `#2B2950`, border `#E4E1F3`. Active: bg `#5B4CF0`, text `#fff`, border `#5B4CF0`.
  - Labels: "All", then "Online {degree}" for each degree in data order.
  - Pill height is about 8+~17+8+2 ≈ 35px, which is **below 44px**.

**Main** (L28): padding `28px clamp(16px,3vw,32px) 0`, flex column, `gap:36px`.

**Degree groups** (L29–41): one `section` per degree that has matches.
- Head (flex, gap 12, align center, `margin-bottom:14px`):
  - 40×40 icon tile (radius 11, `#F1EEFF`/`#5B4CF0`, 22px stream icon).
  - H2 "**Online {degree}**" (22px/800, -0.02em).
  - Count "{n} specializations" (13px `#6F6D8C`).
- Grid: `repeat(auto-fill,minmax(min(100%,260px),1fr)); gap:12px`.
- **Spec card** (an `<a>`): `display:flex; flex-direction:column; gap:10px; padding:16px; border:1px solid #E8E6F3; border-radius:14px; background:#fff`. Hover border `#CFC9FA` plus shadow `0 14px 30px -22px rgba(60,45,170,0.45)`.
  - Row 1: name (800, 15px, lh 1.3) and an `arrow_forward` (20px primary), space-between.
  - Row 2 (`margin-top:auto`, space-between, align center): university logos, one per offering course (26×26, radius 7, border `#ECEAF6`, padding 3, white, `alt=""`; flex gap 4), and "from **{min fee}**" (13px `#6F6D8C`, value bold `#16133F`).
  - **No university names in text**, so the logos are the only signal and are invisible to screen readers.

**Empty state** (L42), when no group matches:
- Box: `padding:40px 20px; text-align:center; border:1.5px dashed #D6D0FA; border-radius:20px`, flex column centred, gap 10.
- Illustration, a 180×130 relative box:
  - Back card: 120×84, radius 16, `#ECE9FE`, rotate(-8deg) at left 18 / top 22.
  - Front card: 120×84, white, border `#E4E1F3`, shadow `0 14px 30px -18px rgba(60,45,170,.45)`, rotate(6deg) at left 44 / top 14, holding three bars (8px tall: 60% `#ECE9FE`, 85% `#F3F1F9`, 45% `#F3F1F9`).
  - A 56px `#5B4CF0` circle with a `category` icon (28px white) and shadow `0 10px 24px -8px rgba(91,76,240,.6)` at left 62 / top 64.
  - An orange dot (10px `#F0A30A`, right 4 / top 6) and a green dot (8px `#12A35C`, left 6 / bottom 10).
- Title (20px/800): "**No specializations match "{q}"**".
- Hint (14px `#4A4867`): "**Try a broader term like Finance, Data or Marketing.**"
- Button (a **div**): "**Show all specializations**", `padding:11px 16px; radius 11; #5B4CF0; white; 700`. It clears `q` and the degree.
- Note: when the degree pill is set and `q` is empty, the title would read 'No specializations match ""'. That case is unreachable because every degree has specs.

**Navy CTA strip** (L43–46): `section`, `border-radius:20px; background:#16133F; color:#fff; padding:clamp(22px,3vw,32px); display:flex; flex-wrap:wrap; gap:18px; align-items:center; justify-content:space-between`.
- Title (20px/800): "**Not sure which specialization fits?**"
- Sub (`#C3C0E6`, 14px, `margin-top:4px`): "**Answer four questions and see your best-matching programs.**"
- Button: "**Find my fit →**" (white bg, `#16133F` text, 800, `padding:13px 20px`, radius 11) → `Recommender`.

**Footer.**

**State**: local `q` and `d` (degree). **No URL sync**. Search filters `name.includes(q)` only, not the degree or university.

### 3.2 Current implementation
- `src/app/specializations/page.tsx`:
  - Metadata title "Online Degree Specializations", canonical.
  - JSON-LD BreadcrumbList plus an **ItemList of all 101 pages**.
  - Grey page with a white header block: breadcrumb "Home > Specializations", H1 "**Online degree specializations**" (28px/700), "{n} listed specializations to explore by subject, degree and university".
  - Intro: "Explore the specializations listed in our catalog. Fees and duration refer to the base degree; confirm current elective availability, selection timing and any additional fees with the university."
- `SpecializationExplorer` (client):
  - Labelled search input (`#specialization-query`, `type=search`, maxLength 200, placeholder "Subject, degree or university").
  - "Subject area" `<select>` (stream) and "Degree" `<select>`.
  - **All state lives in the URL** (`q`, `stream`, `degree`) via history push/replace.
  - `role="status"` count "{x} of {n} specializations" and a "Reset search and filters" button.
  - Groups are by **stream** (h2), not degree.
  - Card: h3 spec name, "{degree} · {n} universities/university", "Listed degree tuition from **₹X**", "Explore university options →" or "View specialization →".
  - Empty state: "No specializations match" / "Try a broader search or reset the subject and degree filters." with "Browse all courses".
- Search matches spec name, degree and university names.

### 3.3 Changes required
1. Hero: H1 "Explore specializations" (or keep "Online degree specializations"; either is fine).
   - Sub: "{count} specializations across …". Compute the degree list from data; don't hard-code "MBA, BBA, BCA, MCA, B.Com".
   - Keep the base-degree fee caveat sentence. Place it under the sub, or as a small note above the results.
2. Search: use the design's 52px search box style (radius 14, border `#E4E1F3`, Search icon `aria-hidden`), but keep a **visible or sr-only `<label for>`** ("Search specializations") and `type="search"`. **Replace `outline:none`** with a visible focus ring on the wrapper (`:focus-within` outline 3px `#5B4CF0`). Keep URL `q` state and the current matching on spec, degree and university.
3. Degree pills: implement them as a `role="group"` (aria-label "Filter by degree") of `<button type="button" aria-pressed>`, or as `<a>` links that set `?degree=`.
   - Use the design's colours and radius 99, but give them `min-height:44px` (padding 12×14) to meet constraint 11.
   - Keep `overflow-x:auto` with a visible scroll cue or fade on mobile. With ~16 degrees, horizontal scrolling on phones is significant. Wrapping, or the current `<select>` under 640px, is an option.
   - **Keep the "Subject area" (stream) filter**, or drop it consciously (see Q). The design has only degree pills.
4. Groups: switch the grouping from stream to **degree** (design), with a 40px stream-icon tile, H2 "Online {degree}" and a count. With a stream filter retained, filter within the degree groups.
5. Card:
   - Use the design's card (radius 14, padding 16, hover border/shadow; lift ≤2px and 160ms per increment 77).
   - Name as `h3` and an ArrowRight icon (`aria-hidden`).
   - Logos with **alt = university short name**, or `alt=""` plus a visually hidden "Offered by MUJ and SMU".
   - Fee label: "**Listed degree tuition from ₹X**", not the bare "from ₹X", because a specialization has no fee of its own.
6. Count and reset: keep the `role="status"` "{x} of {n} specializations" and "Reset search and filters". The design omits both.
7. Empty state: use the design illustration (decorative, `aria-hidden`) and the copy 'No specializations match "{q}"' / "Try a broader term like Finance, Data or Marketing." Make **"Show all specializations"** a `<button>` that resets the URL state. Handle the empty-q title. Keep a secondary "Browse all courses".
8. Navy CTA: build it as specified. Fix the copy to the real recommender: it has **5** questions (constraint 10), not four. Suggested: "Answer five quick questions and see programs that match your answers." Button label: "Find my course" (the current nav and site label), or "Find my fit" if the header is also renamed. Decide globally.
9. Keep the JSON-LD BreadcrumbList and ItemList.

### 3.4 Conflicts and questions
- **C-S1 Local state, no URL params**: the design's `q` and `d` live in component state only. The current page keeps `q`, `stream` and `degree` in the URL (the design standard says filters must reflect URL state). Keep the URL state.
- **C-S2 "Answer four questions"** (L44): the recommender has 5 hard-filter questions plus AI ranking (constraint 10). The design's Recommender is a 4-step quiz, so this copy follows that design, not the product.
- **C-S3 "best-matching programs"** (L44): this is acceptable as a recommender description, but the design standard says recommender explanations must match the calculation.
- **C-S4 Hard-coded count and degree list in the sub** (L23 template text "MBA, BBA, BCA, MCA, B.Com and more"). It is fine if generated from data. The design data gives 71; production has **101**.
- **C-S5 Stream filter dropped**: the current "Subject area" filter is not in the design. Ask whether to keep it.
- **C-S6 Accessibility**: an unlabelled input with `outline:none` (L24), div pills (L25), 35px pills (<44px), a div "Show all" button and logos with empty alt (L36).
- **C-S7 Fee wording**: "from ₹X" implies a specialization fee. The current label is "Listed degree tuition from".
- **Q**: Show the header "Specializations" link? It is in the design's header nav, but currently only in the footer and home. Covered by the header spec; it affects `active="specs"`.

---

## 4. Specialization detail: design `Specialization.dc.html` → route `/specializations/[slug]`

### 4.1 Design spec, top to bottom
URL: `?key=mba-finance` (L60), with a default and fallback of `mba-finance`.

**Hero** (L19–31): detail hero with bottom border, inner padding `22px clamp(16px,3vw,32px) 32px`.
- Breadcrumb (wraps): Home › Specializations › {sp.title}, e.g. "Online MBA in Finance".
- Identity row (L22–25): flex, gap 16, align center, `margin-top:20px`, wraps.
  - 64×64 icon tile: radius 16, white bg, `#ECEAF6` border, `#5B4CF0` stream icon at 32px.
  - Eyebrow: `13px/700 #5B4CF0`, "{Postgraduate|Undergraduate} · {stream}", e.g. "Postgraduate · Management".
  - H1: `margin:4px 0 0; clamp(30px,4.4vw,48px); -0.035em; 800; line-height:1.05`, "**Online {degree} in {name}**".
- Description (L26): `margin:14px 0 0; #4A4867; 16px; max-width:680px; line-height:1.6`. Template (L64): "**A {name} specialisation within the {months}-month Online {degree}. Offered by {n} {universities|university} in our catalog, fully online with proctored exams.**" `months` comes from the **first catalog course of that degree**, not necessarily one offering the spec.
- **4-stat strip** (L27–29): `grid repeat(auto-fit,minmax(min(100%,180px),1fr)); background:#fff; border:1px solid #E8E6F3; border-radius:16px; margin-top:24px`. Cells: `padding:16px 20px; border-right:1px solid #F0EEF8`, value 20px/800, label 12px `#6F6D8C`. No icons. Stats (L65):
  1. "{n}" / "universities offer it" | "university offers it"
  2. "₹min – ₹max" (or a single value) / "**total program fee**"
  3. "₹{min EMI}/mo" / "EMI from"
  4. "{cs[0].months} months" / "duration"

**Main** (L32): padding 28px top, flex column, `gap:40px`.

**Universities offering** (L33–37):
- Head (flex wrap, space-between, align end, gap 12, mb 16): H2 "**Universities offering {name}**" (clamp(22–28px)/800).
- If there are 2 or more courses: "**Compare these programs →**" (`padding:10px 16px; radius 10; #5B4CF0; white; 700; 14px`), href `Compare?ids={ids}`.
- Grid `repeat(auto-fill,minmax(min(100%,300px),1fr)); gap:14px` of **UVCard** per course (rating, generic UGC-entitled pill, Duration/Total fee/EMI, "N specialisations", View details, + Compare, bookmark).
- Note (`margin:12px 0 0; 13px; #6F6D8C`): "**Confirm specialisation availability, timing and any fee differences for your admission session.**"

**Who it suits + Other specializations** (L38–47): grid `minmax(min(100%,380px),1fr)`, gap 20.
- Card (radius 18, padding 24, `#E8E6F3`) "**Who it suits**" (H2 20px/800, mb 14). Rows: flex, gap 10, padding 8px 0, 15px, `#2B2950`, each with a `check_circle` icon (20px `#12925A`). Content (L67, **generated**):
  - PG: "Graduates in any discipline looking to specialise" / "Working professionals who need to study around a job" / "Learners targeting roles in {name lowercased}"
  - UG: "12th-pass students starting a career in {stream lowercased}" / "Learners who want a degree while working" / "Anyone exploring {name lowercased} early"
- Card "**Other {degree} specializations**": flex-wrap chips, gap 8. Each chip is an `<a>` with `padding:8px 12px; radius 10; border:1px solid #E4E1F3; 13px/700; #2B2950`; hover border and colour `#5B4CF0`. The list holds **all** specs of that degree across all universities except this one (L68), with no university attribution. Chip height is about 8+16+8+2 ≈ 34px, **below 44px**.

**FAQ** (L48): UVFaq, title "Frequently asked questions", subtitle "About {title}." Items (L70):
1. "Is {title} UGC-entitled?" / "It is part of a UGC-entitled online degree. Always verify current-cycle entitlement before enrolling."
2. "Does the specialisation change the fee?" / "Usually not, but confirm any fee difference for your admission session with the university."
3. "When do I choose my specialisation?" / "This varies by university — some ask at application, others in a later semester."
4. "Will the specialisation appear on my degree?" / "Confirm the certificate and transcript wording with the university."

**Footer.** There is **no Apply now** anywhere in the page body, and no sticky elements.

### 4.2 Current implementation
- `src/app/specializations/[slug]/page.tsx` plus `src/lib/specializations.ts`.
- Pages: 101, built by `allSpecializationPages`, with slug `{courseKey}-{specKey}` where `&` is dropped. Courses are sorted by fee. `isComparison` is true when more than one university offers the spec.
- Metadata via `specializationTitle` (≤60 chars, with "{n} Universities Compared" or "at {short}: Fees" variants) and `specializationDescription`, both data-specific. Canonical is set.
- JSON-LD: BreadcrumbList and FAQPage.
- Header: breadcrumb, H1 "{courseLabel} in {spec}" (28px/700). Sub: "Listed for {n} universities in our catalog — explore options below" or "Listed for {university name} in our catalog".
- `guide-reading-layout`: main plus `right-rail`.
  - `nav.guide-detail-nav` (anchor chips, ≥44px): Fees & duration / Other specializations / Career paths / Related guides / Questions.
  - **Fee and duration (by university)**: `guide-fee-card` per course with university name, "Listed degree tuition", "EMI from", "Duration" and "View program". Caveat: "Fee, EMI and duration refer to the base {degree} program. Confirm specialization availability, selection timing, current tuition and any additional fees with the university."
  - **Other {degree} specializations (siblings)**, **per university**: "{University} lists {n+1} specializations for {degree}, including {spec}. The others:" followed by chip links.
  - **Career paths**: "Specialization-specific career outcomes aren't independently published by these universities — the career paths below are for {degree} graduates generally, not verified as specific to the {spec} track." plus a link to the career scope guide and role chips from `careerRoles`.
  - **Related guides**: "{degree} fees →", plus "{degree} eligibility →" when that guide exists.
  - **FAQ**: data-specific (`specializationFaqs`). Comparison pages get "Which university offers the cheapest…" (fee-based fact), "same curriculum?", "change validity?" and "career roles". Single-university pages get three similar questions. Native `<details>`.
  - **Rail**: "Not sure this specialization is right for you?" / "A counsellor can walk you through the {spec} track against your career goals." with **Apply now** (`/lead?intent=specialization&course=`) and "Free service · no spam · unbiased advice"; "Compare {n} programs" (`/compare?add=`) when there are more than one; "Explore related specializations" (`/specializations?q=`).

### 4.3 Changes required
1. Hero:
   - Use the design's identity row (64px stream icon tile, eyebrow "{level} · {stream}", H1 clamp(30–48px)) with the breadcrumb.
   - Replace the description template with a data-true sentence that drops "fully online with proctored exams". Suggested: "The {spec} specialization within the Online {degree}, listed by {university names} in our catalog. Fees, EMI and duration below refer to the base degree."
   - Compute months from the offering courses only, e.g. "24 months", or a range.
2. Stat strip:
   - "{n} universities list it"
   - "₹min – ₹max" / "**listed degree tuition**" (relabel from "total program fee"; it is the base degree)
   - "₹X/mo" / "EMI from"
   - "{duration}" / "duration"
   - Fix the trailing borders.
3. Universities offering:
   - Render the **redesigned program card** (UVCard equivalent) per course. Whatever the card shows must follow the card rules: ratings are allowed but not enlarged, and recognition shows the per-program status or no generic "UGC-entitled" pill (constraint 8).
   - Keep the base-degree caveat (the current text, which covers more than the design note).
   - "Compare these programs →" → `/compare?add={up to 3 ids}`, which is gated: note the verification step in the label or tooltip, as on compare pages. If only one university lists the spec, show nothing (same as the design).
4. **Replace "Who it suits"** with the current **Career paths** section (with its caveat) styled as the design card: H2 20px/800, chips for roles, the caveat in 14px `#4A4867`, and a link to the career scope guide. If the owner wants "Who it suits", it needs per-specialization sourced content (expansion plan: "flag pages without unique evidence … rather than generating unsupported paragraphs").
5. Other specializations card:
   - Keep **per-university sibling grouping** ("{University} lists N specializations for {degree}…") using the design's chip style.
   - Make chips `min-height:44px`, with padding 12×14 or a line-height increase.
   - A combined de-duplicated list is acceptable as a secondary view only if each chip shows which university lists it, e.g. a small logo.
6. Keep **Related guides** (fees and eligibility links) in the design's card style, as a third card or in the rail.
7. FAQ: keep `specializationFaqs` (data-specific) with FAQPage JSON-LD, in UVFaq styling. You **may add** the design's Q3 ("When do I choose my specialisation?") and Q4 ("Will the specialisation appear on my degree?"), because they are cautious, non-factual and useful. Prefer the program-specific "specialization timing" block from the 79th increment where it has been published.
8. **Add an Apply now CTA** (the design has none in the body).
   - Keep the rail card (radius 18, border `#E8E6F3`), or add a navy strip like Specializations' CTA: "Not sure this specialization is right for you?" plus **Apply now** (`/lead?intent=specialization&course={key}`, data-open-lead).
   - Remove "unbiased advice" unless the owner keeps it; it is an impartiality claim and the design standard §6 says to avoid unsubstantiated impartiality claims.
9. Keep the in-page nav (`guide-detail-nav`) and restyle it as the design's sticky underline tabs, or as pills.
10. Keep metadata and title rules unchanged.

### 4.4 Conflicts and questions
- **C-SD1 `?key=` URL** (L60) and a different slug algorithm. Must stay `/specializations/[slug]` with the repo slugs (101 indexed pages; constraint 10).
- **C-SD2 Invented "Who it suits"** (L40–41, L67). These are generated, unsourced suitability claims. "Graduates in any discipline" is an eligibility claim that is false for some programs (for example MSc Mathematics and MCA prerequisites). This goes against the expansion plan and the design standard §6.
- **C-SD3 "fully online with proctored exams"** (L64). The claims register removed "Online proctored" because it is not evidenced per program.
- **C-SD4 FAQ 1 "It is part of a UGC-entitled online degree"** (L70). Recognition must be the per-program dated result (constraint 8). Link to each course's Recognition section instead.
- **C-SD5 Omitted current features**: per-university sibling specializations, the career paths caveat, related guides (fees and eligibility), the Apply now rail, data-specific FAQ and JSON-LD, the section nav and the "Explore related specializations" link.
- **C-SD6 "total program fee"** label on a specialization (L65). It is the base degree fee. The current label is "Listed degree tuition".
- **C-SD7 Duration from `cs[0]`** and description months from the first degree course (L64–65) may mismatch the offering courses.
- **C-SD8 Program cards inside** carry the generic "UGC-entitled" pill and ★ rating (UVCard). Resolve this in the shared card spec.
- **C-SD9 Accessibility**: chips are about 34px (<44px), the icon ligatures are read aloud, and the UVFaq toggles are not keyboard-operable.
- **Q**: The current FAQ "Which university offers the cheapest …" uses "cheapest" on listed fees. That is a factual fee comparison, so it doesn't break constraint 4, which targets unverified data. Should the wording be softened to "lowest listed total fee"?

---

## 5. Guides hub: design `Guides.dc.html` → routes `/online-degree-guides` and `/blog`

### 5.1 Design spec, top to bottom

**Header**: `active="guides"`.

**Hero** (L19–26): listing hero, padding `22px … 28px`.
- Breadcrumb: Home › "**Guides & articles**".
- H1 "**Online degree guides**" (clamp(30–46px)/800/-0.035em, `margin:14px 0 0`).
- Sub (L23): `margin:8px 0 0; #4A4867; 16px; max-width:620px`. Copy: "**Fees, eligibility, approvals and career scope — written from the same verified data as our comparison tables.**"
- **Category pills** (L24): `margin-top:20px`, same style as the Specializations pills (divs, 13px/700, padding 8×14, radius 99, active `#5B4CF0`/white). Labels: "All", "Fees", "Eligibility", "Careers", "Approvals". Local state only.

**Main** (L27): `gap:40px`.

**Featured guide** (L28–39): the whole card is one `<a>` to the first guide (`g[0]`, always `mba-fees`, regardless of the filter).
- Card: `display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,360px),1fr)); border:1px solid #E8E6F3; border-radius:20px; overflow:hidden; color:#16133F`. Hover: no underline, border `#CFC9FA`.
- Left panel: `min-height:220px; background:linear-gradient(135deg,#5B4CF0,#8B7CFF); padding:28px; display:flex; flex-direction:column; justify-content:space-between; color:#fff`. It holds a large category icon (`payments`, 44px) and, at the bottom, "**FEATURED GUIDE**" (13px/700, letter-spacing .06em, opacity .85).
- Right panel: `padding:clamp(20px,3vw,32px); flex column; gap:10px; justify-content:center`.
  - Category tag: `align-self:flex-start; 12px/800; padding:4px 9px; radius 6; bg #ECE9FE; #5B4CF0`.
  - Title: `clamp(22px,2.6vw,30px)/800; -0.025em; lh 1.15`. This is a **div, not a heading**.
  - Description: `margin:0; #4A4867; lh 1.6`.
  - Meta (13px `#6F6D8C`): "{read} read · **Updated October 2026**" (hard-coded).

**Guide grid** (L40–52):
- H2 `{listTitle}` (clamp(22–28px)/800, mb 16). "All guides" when unfiltered, otherwise "{Cat} guides".
- Grid `repeat(auto-fill,minmax(min(100%,300px),1fr)); gap:14px`.
- Card `<a>`: `flex column; gap:12px; padding:20px; border:1px solid #E8E6F3; radius 16; bg #fff`. Hover border `#CFC9FA` plus shadow `0 14px 30px -22px rgba(60,45,170,.45)`.
  - Row 1: a 44×44 icon tile (radius 12, `#F1EEFF`/`#5B4CF0`, 24px icon; Fees `payments`, Eligibility `school`, Careers `trending_up`, Approvals `verified`) and a category tag (12px/800, padding 4×9, radius 6, bg `#F8F7FD`, `#4A4867`), space-between.
  - Title (17px/800, lh 1.3; a div).
  - Description (14px `#6F6D8C`, lh 1.5, `flex:1`).
  - Footer row (13px, space-between): "{read} read" (`#6F6D8C`) and "**Read guide →**" (`#5B4CF0`/700).
- Data (`uv-data.js` L58–65): 6 guides.
  - "Online MBA fees compared across 3 universities" (Fees, 6 min)
  - "Online MBA eligibility across universities" (5 min)
  - "Online MBA career scope, by university" (7 min)
  - "Is Online MBA UGC approved?" (4 min)
  - "Online MCA fees compared across 3 universities" (5 min)
  - "Online BCA fees compared across universities" (4 min)
  - Descriptions are quoted in uv-data. For example, mba-career-scope: "Roles, salary ranges and placement-assistance records for each program." The MCA fees title says "3 universities" (true for MCA). "Online BCA fees compared across universities" covers MUJ and Amity only.

**Tool shortcut tiles** (L53–57): grid `minmax(min(100%,280px),1fr)`, gap 14. Each tile is an `<a>`: `flex; gap:14px; align-items:center; padding:20px; radius 16; background:#F4F2FF; color:#16133F`, with no border and a 32px primary icon.
- `calculate` "**EMI calculator**" / "Estimate your monthly payment" → EMI calculator
- `compare_arrows` "**Compare programs**" / "Up to three side by side" → Compare
- `fact_check` "**How we verify**" / "Our data sources and process" → How we verify

**FAQ** (L58): UVFaq, title "Frequently asked questions", subtitle "Get quick answers to common questions about online degrees.", items `UV.FAQ_GENERAL` (`uv-data.js` L66–73):
1. "Are online degrees valid for government jobs?" / "Yes. UGC-entitled online degrees are legally equivalent to on-campus degrees for government jobs, PSU recruitment and higher studies."
2. "Is counselling really free?" / "Yes — **universities compensate us equally**, so counselling costs you nothing and our advice carries **no commission bias**."
3. "Can I pay via EMI?" / "**Every listed program offers no-cost EMI** through education loan partners, plus semester-wise payment options."
4. "How do you verify fees and approvals?" / "We check every fee, approval and admission date against the university's own published pages **each admission cycle**, and flag anything we can't independently confirm."
5. "Will my certificate say "online"?" / "No. A UGC-entitled online degree carries the same certificate as the on-campus program — there is no "online" marking that affects how employers or government bodies treat it."
6. "How can I speak to an expert?" / "**Call 1800-120-4050** or request a callback. A counsellor will call you, usually within one working day."

**Interactions**: category filter (local state, no URL). No search, no degree filter and no pagination.

**Accessibility as designed**: div pills; titles are not headings (cards have no heading structure under the H2); the whole featured card is one link, so its accessible name is a run-on of all its text. White "FEATURED GUIDE" at 13px/700 with **opacity .85** on the `#5B4CF0→#8B7CFF` gradient: `#8B7CFF` versus white is about 3.3:1 before opacity, which **fails 4.5:1** for 13px text at the lighter end of the gradient. The label sits bottom-left, where the gradient is mid-tone.

### 5.2 Current implementation: two separate hubs
- **`/online-degree-guides`** (`page.tsx` + `GuideExplorer`):
  - Metadata "Online Degree Guides". JSON-LD Breadcrumb and an ItemList of all guides.
  - Header: breadcrumb "Home > Online Degree Guides", H1 "**Online degree guides**", "Find information by degree and topic, from tuition and entry requirements to careers and recognition.", and a note "By Content Team, Unnati Vidya. Confirm current fees, requirements and admission-session recognition with the university. How we verify information".
  - **68 guides**: 17 degrees × 4 types.
    - Topic "Fees & payments": description "Listed tuition ₹X–₹Y. Explore program fees and payment details."
    - "Eligibility & admission"
    - "Career scope"
    - "Recognition & validity"
  - Explorer: labelled search, **Topic** select and **Degree** select, all in **URL state** (`q`, `topic`, `degree`). `role="status"` count, Reset. Groups by topic (h2), cards "{degree}: {topic}" (h3) with "Read guide →". Empty state links to `/blog`.
- **`/blog`** (`page.tsx` + `BlogExplorer`):
  - Metadata "Online Learning Articles".
  - H1 "**Online learning articles**". Sub: "Explore online learning and career choices with Content Team, Unnati Vidya. For degree-specific fees and entry requirements, browse our degree guides." Link "Browse degree guides for fees, eligibility and recognition →".
  - **26 CMS articles** (`getPublishedArticles`, DB-backed with a last-good fallback). Categories: Validity, Fees & EMI, Careers, Admissions.
  - Explorer: search, **sort** (Newest first / Title A–Z), **category buttons with `aria-pressed`**, all in URL state (`q`, `category`, `sort`). Count and reset.
  - Cards: **cover image** (`/blog/*.webp`, `resolveBlogCover` with a category fallback), "{category} · {read}" (read time computed from words, per the claims register), h2 title link, excerpt, byline "Content Team, Unnati Vidya" plus `<time>` published date, "Read article →" with an aria-label.
  - Bottom dark CTA "Ready to explore your options?" with "Browse courses" and **Apply now** (data-open-lead).
- The header nav groups "Resources: Degree guides (`/online-degree-guides`), Articles (`/blog`), How we verify". There is no single "Guides" item.

### 5.3 Changes required
1. **Keep two routes** (`/online-degree-guides` and `/blog`, constraint 10) and restyle both with the design's hub layout. Options:
   - **(a) Recommended.** `/online-degree-guides` uses the design's Guides hub for the 68 programmatic guides. `/blog` uses the same visual system (listing hero, pills, card grid, featured card) for CMS articles. Each hub links to the other: a "Latest articles" strip of 3 on the guides hub, and the existing "Browse degree guides" link on the blog. Set the header `active="guides"` for both, or split it into Guides and Articles.
   - (b) A combined landing at `/online-degree-guides` that shows both, with articles still linking to `/blog/[slug]`. This risks duplicate listing and confuses canonical intent; not recommended without an owner decision.
2. Guides hub (`/online-degree-guides`):
   - Hero: breadcrumb (rename "Guides & articles" to "Online degree guides"), H1 "Online degree guides".
   - Sub: replace the "verified data" claim (see 5.4). Suggested: "Fees, eligibility, recognition and career scope for each degree, from the same catalog data as our course pages. Each guide lists its sources."
   - Keep the byline note "By Content Team, Unnati Vidya … How we verify information".
   - **Topic pills** "All / Fees / Eligibility / Careers / Recognition" map to the topics Fees & payments / Eligibility & admission / Career scope / Recognition & validity. Prefer "Recognition" over the design's "Approvals", to match "Recognition & validity" and the course pages. Build them as `<button aria-pressed>` or links with ≥44px height, writing the **`topic` URL param**.
   - **Keep search and the Degree filter.** The design lacks them, but with 68 guides they are essential. Style them like the Specializations search box and a native select.
   - Featured guide: choose a sensible, data-driven pick, e.g. "Is Online MBA UGC approved?" or the MBA fees guide.
     - Show **real dates**: UGC guides use the `checkedAt` of the results; eligibility and career guides use `lastReviewed` ("August 2026"); fee guides have no date, so show none.
     - **Remove read times** (guides have no computed read time) or compute them.
     - Make the title an `h2`/`h3` inside the link, and replace the `aria-label` run-on with a heading-labelled link.
     - Fix the "FEATURED GUIDE" contrast: full-opacity white, ≥14px bold, or place it on the darker part of the gradient.
   - Guide cards: use the design's cards (44px icon tile, topic tag, title as `h3`, description, footer "Read guide →"). Remove "{read} read" unless computed. Title "{degree}: {topic}" or a friendlier "Online MBA fees" form. Descriptions come from the current data. Group by topic when "All" is selected (current), or show a flat grid (design). Either is fine.
   - Tool tiles: EMI calculator (`/tools/emi-calculator`), Compare programs (`/compare`; add a gating note such as "Up to three side by side · email verification required", or link to the public editorial comparisons) and How we verify. **Add** "Total cost planner" (`/tools/total-cost`) and "Eligibility checker" (`/tools/eligibility-checker`) (constraint 10 tools), using `#F4F2FF` tiles in auto-fit 280px.
   - FAQ: write hub-specific, sourced answers (see 5.4). Do not reuse `FAQ_GENERAL`.
3. Blog hub (`/blog`):
   - Same hero style. H1 "Online learning articles" (or "Articles").
   - Category pills (current categories, `aria-pressed`, URL `category`) plus search and sort.
   - A featured card: the newest article, with its **cover image** on the left instead of the gradient icon panel (covers exist), title, excerpt, byline and published/updated `<time>`.
   - Card grid in the design's card style, **keeping the cover image** (top, 16:9) plus computed read time.
   - Keep the closing **Apply now** CTA in the navy strip style.
4. Both hubs: keep the JSON-LD Breadcrumb and ItemList, the `role="status"` counts and the reset buttons.

### 5.4 Conflicts and questions
- **C-G1 The design merges blog and guides into one "Guides & articles" hub** (L21 breadcrumb, a single `GUIDES` list, `Article.dc.html` for all). The current site has two routes and two content systems: 68 programmatic guides in code, and 26 CMS articles with cover, body blocks and sources. Constraint 10 says to keep both. The design has no slot for article cover images, categories (Validity / Fees & EMI / Careers / Admissions), sort or CMS content.
- **C-G2 "written from the same verified data as our comparison tables"** (L23). Much of that data is deferred or unverified (ratings, placement, learner counts) and recognition is still pending per program. This is an unsubstantiated verification claim.
- **C-G3 Hard-coded "Updated October 2026"** (L37) and **fixed read times** ("6 min", `uv-data.js`). The claims register removed fixed reading times as overstated; blog read time is now computed. Guides have no read time. Dates must be real (design standard §4: "actual publication/update dates").
- **C-G4 FAQ_GENERAL** (`uv-data.js` L66–73):
  - "Call 1800-120-4050" breaks constraint 2.
  - "universities compensate us equally … no commission bias" is an impartiality claim. The claims register removed "Every university pays us the same", and the design standard §6 says to avoid unsubstantiated impartiality claims.
  - "Every listed program offers no-cost EMI" is an owner-stated exception and should not be added to a new placement.
  - "each admission cycle" verification is the reworded claim from §11 #11.
  - "Yes … legally equivalent" and "no 'online' marking" are unsourced. The current UGC guides say "Individual recruiters can set their own rules" and cite UGC Regulations 2020.
  - "usually within one working day" is an unconfirmed service level.
- **C-G5 Query-param URLs** `Article.dc.html?slug=` (L71). Must be `/online-degree-guides/[slug]` or `/blog/[slug]`.
- **C-G6 Only 6 guides and no search or degree filter.** With 68 guides plus 26 articles, the design's IA does not scale. Keep the current search, degree filter and URL state.
- **C-G7 Featured card contrast** (L31) and the lack of headings in cards (L35, L46).
- **C-G8 Missing tools**: the total cost planner and eligibility checker tiles are absent (constraint 10 tools). This is not strictly required on this page, but recommended.
- **C-G9 Compare tile** "Up to three side by side" doesn't mention the verification gate (constraint 3). Consider "Compare programs (email verification required)" or link to the public editorial comparisons.
- **Q**: Should the header show one "Guides" item (design) covering both hubs, or keep "Resources › Degree guides / Articles"? This is a header-spec decision.
- **Q**: Which guide is featured? Is a featured article (blog) wanted too?

---

## 6. Article: design `Article.dc.html` → routes `/online-degree-guides/[slug]` (4 guide types) and `/blog/[slug]` (CMS)

### 6.1 Design spec, top to bottom
URL: `?slug=mba-fees` (L70), falling back to the first guide.

**Header**: `active="guides"`.

**Hero** (L19–31): detail hero with bottom border, **880px** column, padding `22px clamp(16px,3vw,32px) 36px`.
- Breadcrumb: Home › "Guides" › {g.cat} (the category, not the title).
- Category tag (L22): `display:inline-block; margin-top:20px; 12px/800; padding:4px 9px; radius 6; bg #ECE9FE; #5B4CF0`.
- H1 (L23): `margin:12px 0 0; clamp(30px,4.4vw,46px); -0.035em; 800; line-height:1.1; text-wrap:balance`.
- Deck (L24): `margin:12px 0 0; #4A4867; 17px; line-height:1.6`, reading `g.desc`.
- Meta row (L25–29): flex wrap, gap 16, `margin-top:18px`, 13px `#6F6D8C`, align center.
  - A 28px round `#5B4CF0` avatar "UV" (11px/800 white) and "**Unnati Vidya research team**".
  - "{read} read".
  - "**Updated October 2026**" (hard-coded).
  - A link to How we verify, styled `display:flex; gap:4px; font-weight:700; color:#12784B`, with a `verified` icon (16px) and "**Source-verified**".

**Main** (L32): `max-width:880px; padding:32px clamp(16px,3vw,32px) 0`.
- **TOC box** (L33–36): `padding:16px 18px; border-radius:14px; background:#F8F7FD; border:1px solid #ECEAF6`.
  - Label "**IN THIS GUIDE**" (12px/800, letter-spacing .05em, `#6F6D8C`).
  - Items: flex column, gap 6, `margin-top:10px`. Each item is a **div** `onClick`, 14px/700 `#5B4CF0`, "{n}. {heading}". Click runs `scrollTo(top − 90, smooth)` (L90).
  - Not links, not keyboard-accessible, no `<nav>`. Each item is about 20px tall, **below 44px**.
- **Sections** (L37–50): `section id="a{i}"`, `margin-top:36px`.
  - H2: `24px/800; -0.02em; margin:0`.
  - Paragraphs: `margin:12px 0 0; 16px; line-height:1.75; color:#2B2950; text-wrap:pretty`.
  - Optional table (L41–48): wrapper `margin-top:16px; border:1px solid #E8E6F3; border-radius:14px; overflow-x:auto`, inner `min-width:520px`. Header row: grid `1.4fr repeat(n−1,1fr)`, bg `#F8F7FD`, border-bottom `#E8E6F3`, cells `12px 14px; 13px/800; #4A4867`. Body rows: border-bottom `#F3F2F9`, cells `12px 14px; 14px`. Built from divs, so it has no table semantics.
- Section content is **generated by category** (L75–88). Exact copy:
  - **Fees**:
    - "Fees at a glance": "We list {n} Online {degree} programs. Listed total tuition ranges from {min} to {max}. {cheapest university} has the lowest listed fee." Table: University / Total fee / Per semester (computed `fee/(months/6)`) / EMI from.
    - "Payment options": "Every listed program offers full payment, semester-wise payment and no-cost EMI through education loan partners. **Some universities give a small discount for paying the full fee upfront.**" / "Payment plans and scholarships depend on current university terms and eligibility. Confirm the total payable and financing charges before applying."
    - "What else to compare": "Fee is one row. Check specialisation depth, placement assistance rate and approvals before deciding — our comparison table puts all of these on one screen."
  - **Eligibility**:
    - "Minimum requirements": for MBA, "For MUJ, the requirement is a bachelor's degree (10+2+3) in any discipline with a minimum of 50% marks (45% for reserved categories). **No work experience or entrance test required.**"; otherwise "Requirements vary by university. Confirm the exact percentage with a counsellor." Table: University / Requirement ("Bachelor's degree" or "10+2") / Entrance test (**"Not required" for every row**).
    - "Documents you need": "Academic mark sheets and certificates, a government ID, a recent photograph, and category certificate if applicable. Universities may ask for additional records during document upload."
  - **Careers**:
    - "Placement support by university": "Universities offer placement assistance — resume clinics, mock interviews, job boards and alumni networking. This is assistance, not a guaranteed offer." Table: University / **Placement rate** / **Avg package** (university-wide, unlabelled).
    - "Common roles": for MBA, "Graduates commonly move into roles such as Business Manager (₹6-11 LPA), Marketing Manager (₹7-14 LPA), Finance Analyst (₹5-10 LPA) and Operations Lead (₹8-15 LPA), per MUJ's own program pages. Actual outcomes depend on your experience and specialisation."; otherwise "Outcomes depend on your experience and specialisation. Ask a counsellor for program-specific data."
  - **Approvals**:
    - "What UGC entitlement means": "UGC-entitled online degrees are legally equivalent to on-campus degrees for government jobs, PSU recruitment and higher studies. The certificate carries no "online" marking."
    - "Approval status by university": "We check every program against the UGC-DEB entitlement list each admission cycle." Table: University / UGC (**"Entitled" for every row**) / Other approvals.
    - "How to check it yourself": "Search the UGC-DEB website for the university and program for your admission session. If a program is missing from the current list, do not enrol until it is confirmed."
- **Compare CTA** (L51–54): `margin-top:40px; padding:22px; border-radius:18px; background:linear-gradient(135deg,#F4F2FF,#EEEAFF); flex wrap; gap 16; space-between`.
  - Title (18px/800): "**See these programs side by side**".
  - Sub (14px `#4A4867`): "**Fees, EMI, approvals and placement data in one table.**"
  - Button: "**Compare {degree} programs →**" (`padding:12px 18px; radius 11; #5B4CF0; white; 700`) → `Compare?ids={all ids of that degree}`. This can be more than 3 ids, although the README says compare holds a maximum of 3.
- **Related guides** (L55–58): `section margin-top:40px`. H2 "Related guides" (22px/800, mb 14). A flex column (gap 10) of `<a>` rows: `display:flex; justify-content:space-between; gap:12px; padding:14px 16px; border:1px solid #E8E6F3; border-radius:12px; font-weight:700; color:#16133F`, hover border and text `#5B4CF0`, with an `arrow_forward`. The list is the first 4 other guides, in any category or degree.
- **Footer.** There is **no FAQ section**, **no Apply now**, **no newsletter**, **no sources list**, **no cover image** and **no JSON-LD**.

### 6.2 Current implementation
**A. CMS blog article** (`/blog/[slug]` → `ArticleView`):
- Metadata: `fitTitle`, excerpt, canonical, OG image = cover, `type:article`.
- JSON-LD: Article (author Organization "Content Team, Unnati Vidya" with URL `/authors/content-team`; publisher logo PNG; datePublished/dateModified), BreadcrumbList and FAQPage.
- Layout: `article-layout article-reading-layout` with main and a **rail**.
  - Breadcrumb Home > Blog > {category}.
  - Category pill plus "{read} · Published {date}" and "· Updated {date}" with `<time>`.
  - H1 (`clamp(26px,4vw,34px)`).
  - **Author row**: "UV" avatar (`aria-hidden`), "**Content Team, Unnati Vidya**" linked to `/authors/content-team`, "Editorial team".
  - Intro excerpt.
  - `<details class="article-contents">` "**On this page**", a `<nav aria-label="Article sections">` list of h2 anchors plus FAQ.
  - **Cover image** (900×480, priority).
  - Body blocks: `p`, `h2` (with id and `tabIndex=-1`), `note` ("Unnati Vidya tip:" box), `image`, `links` (heading plus link list).
  - **FAQ** (`<details name="blog-faq">`).
  - **CTA band** "Explore courses for your next step" / "Browse course details or leave your enquiry for the team to follow up." with **Apply now** (`/lead?intent=article-help`, data-open-lead).
  - **`NewsletterSignup variant="article"`** (double opt-in, labelled email, honeypot, status/alert live regions, privacy link).
  - "Back to article start ↑".
  - **Rail**: "More from the blog" (3 related, same category first, with cover thumbs); "Compare course details" → `/compare`; "**Sources**", listing each `post.sources` entry as "{label} · checked {date}", or the default UGC-DEB 2026-27 PDF, plus "How we verify our data →".
- CSS: `scroll-margin-top:100px` on headings, focus outlines, a 640px mobile tweak and reduced-motion `scroll-behavior:auto`.

**B. Programmatic guides** (`/online-degree-guides/[slug]`; 4 types chosen by slug suffix; each has its own metadata, JSON-LD Breadcrumb and FAQPage):
- Shared pieces:
  - Grey page, white header, breadcrumb "Home > Online Degree Guides > {X}".
  - Byline "By **Content Team, Unnati Vidya**" (link). `LastReviewed` ("Last reviewed: August 2026", or the latest checked date for UGC).
  - `guide-detail-nav` anchor chips.
  - `GuideCrossLinks` (same-degree guides of other types, only when they exist).
  - FAQ (`<details>`).
  - `SourceList` ("Sources: hostname, hostname", with `data-track-event` source_link_click).
  - **Right rail** with a type-specific heading, copy and **Apply now** (`/lead?intent={type}-guide&course={key}`), plus "Free service · no spam · unbiased advice".
- **Fees** (`{key}-fees`):
  - H1 "{label} fees compared across universities" or "… fees explained".
  - Intro from `feeGuideIntro`.
  - Fee cards per university: listed total tuition, EMI from, duration, plus an **"Outside India: {category} {fee} (prospectus, checked {date})"** line from category fees.
  - A **Scholarships** table for single-university guides, with a link to the refund policy.
  - Rail "Get the exact fee breakup", and "Compare {label} side by side" (`/compare?add=` max 3).
- **Eligibility** (`{key}-eligibility`):
  - "Eligibility by university": a sourced fact per university, plus "**Use the free eligibility checker**" (`/tools/eligibility-checker?course=`).
  - "What's actually different between universities".
  - Rail "Not sure you qualify?".
- **Career scope** (`{key}-career-scope`):
  - "Roles and industries, by university" (role chips, industries).
  - "**What we could and couldn't verify**" (amber box, `unverifiedClaimsNote`).
  - Rail "Want a realistic outcome estimate?" / "…instead of an unverified average."
- **UGC approval** (`{key}-ugc-approval`):
  - **Status banner**: all listed for {year} (checked {date}), or not every program confirmed.
  - "Status by university": link to the course's `#sec-recognition`, a **status badge** ("On the 2026-27 list" / "Confirm awarding university" / "Check in progress"), "Listed under", "Programme as printed", a note, "Source: official UGC-DEB list · checked {date}" and NAAC/AICTE university-level notes.
  - FAQ built from per-program `recognitionSummary` answers plus a self-check how-to plus a government-jobs answer with the Regulations 2020 caveat.
  - Sources from the results.

### 6.3 Changes required
1. Build **one shared "reading page" shell** in the design style and use it for both `ArticleView` (blog) and the four guide templates:
   - An 880px column (the design standard wants a 65–75 character measure; 880 minus padding is about 816px at 16px, roughly 90–100 characters per line, so consider a ~720px text column inside the 880px shell).
   - The detail hero (gradient, bottom border), category tag, H1 with balance, deck, and a meta row.
2. Meta row:
   - **Byline exactly "Content Team, Unnati Vidya"**, linked to `/authors/content-team`, with the UV avatar `aria-hidden`.
   - Real dates: blog uses Published plus Updated `<time>`; guides use "Last reviewed" or the checked date.
   - Read time: blog only (computed).
   - Replace the "Source-verified" green link with "**Sources**" (anchor to the sources section) or "How we verify" in neutral primary colour (see 6.4).
3. TOC:
   - Use the design box (bg `#F8F7FD`, radius 14, label "IN THIS GUIDE" / "ON THIS PAGE") as a **`<nav aria-label="Guide sections">` with an `<ol>` of `<a href="#id">`**, each with `min-height:44px` (or 8px vertical padding plus 1.5 line-height ≥ 44px including the gap). Keep the CSS `scroll-margin-top:90–100px` (design offset −90; current 100).
   - Blog currently uses a collapsed `<details>`. Use the design's always-open box, which is acceptable because the list is short, or keep details on mobile.
   - The guide `guide-detail-nav` chips can become this TOC.
4. Body typography: H2 24px/800/-0.02em with `margin-top:36px`; paragraphs 16px/1.75 `#2B2950`, `text-wrap:pretty`.
   - Map blog blocks: `note` becomes a tinted callout in the design palette (e.g. bg `#F4F2FF`, left border `#5B4CF0`, radius 12); `image` stays a rounded image (radius 14); `links` becomes the "Related guides" row style.
5. Tables:
   - Use real `<table>` (caption or `aria-labelledby`, `th scope`) inside `div[role=region][tabindex=0][aria-label]` with `overflow-x:auto` and `min-width:520px`, styled per the design (header bg `#F8F7FD`, 13px/800 `#4A4867` header, 14px cells, `#F3F2F9` dividers, radius 14 wrapper).
   - Apply this to the **fee guides**: convert the fee cards into a table (University / Listed total tuition / EMI from / Duration / Outside-India fee with source and checked date). Keep the "View program" links as a column, or as links on the university name.
   - Do **not** add the computed "Per semester" column unless sourced. Semester plans exist per course (`semesterFee` in enrichment is computed), so treat it as unverified.
6. Keep all type-specific content:
   - Fees: scholarships, outside-India line, refund-policy link.
   - Eligibility: per-university facts, eligibility checker link, differentiator note.
   - Career scope: roles and industries chips, the amber "What we could and couldn't verify" box (restyle with warning tokens `#A35A0B` on `#FFF4E5`).
   - UGC: status banner and per-program status badges, "Listed under", "Programme as printed", sources and checked dates. Badge colours: listed = success `#12784B` on `#E7F6EE`; unclear = warning `#A35A0B` on `#FFF4E5`.
7. **FAQ section** on every article and guide, with FAQPage JSON-LD (existing data), in UVFaq styling.
8. Compare CTA:
   - Use the design's gradient box. Copy: "See these programs side by side" / "Fees, EMI and approvals in one table." Drop "placement data", or say "university-wide placement figures".
   - Link to `/compare?add={≤3 ids}` (gated: mention email verification), or to `/compare/[course]/[pair]` editorial pages (public) where they exist.
   - Show it only when more than one university offers the degree (current behaviour for fee guides).
9. **Add Apply now**:
   - Keep the guide rail CTA, or convert it to an in-flow CTA card after the main content. Blog has the "Explore courses for your next step" band. Use one consistent "Apply now" CTA card (navy `#16133F` strip or the gradient box) with `data-open-lead` and intent params.
   - Remove "unbiased advice" from the microcopy unless the owner keeps it.
10. **Keep `NewsletterSignup variant="article"`** on blog articles. Optionally add it to guides. Style it as a `#F8F7FD` card with a labelled email input (≥44px) and a primary "Subscribe" button.
11. **Sources section** (in-flow, after the body or FAQ, styled like the design's Related rows): the blog's `post.sources` with "checked {date}" (or the default UGC-DEB PDF) and the guides' `SourceList` hostnames. Ideally show labels and dates per source rather than bare hostnames (expansion plan). End with "How we verify our data →".
12. Related:
    - Blog: "More from the blog" (3, same category first) in the design's related-row style, optionally with cover thumbnails (56×44).
    - Guides: `GuideCrossLinks` (same degree, other topics) in the same row style. Optionally add 1–2 related blog articles.
13. Blog cover image: keep it (between the meta row and the body, radius 14–20, `next/image` priority). The design has no slot for it.
14. Keep the rail or go single-column? The design is single-column at 880px. The current blog and guides have a right rail (Related, Compare, Sources, Apply). Recommendation: single column per the design, moving rail content into the flow in this order: body → FAQ → Apply now CTA → Newsletter (blog) → Sources → Related. The design standard says the desktop enquiry rail becomes one contextual mobile action.
15. Keep "Back to article start ↑" (blog), `#article-top`, focus outlines and reduced-motion smooth-scroll disabling.

### 6.4 Conflicts and questions
- **C-A1 "Source-verified" claim** (L28): a green `verified` icon linked to How we verify. Many facts in guides and articles are not verified (deferred placement, salary, recognition pending or unclear for some programs). The claims register removed "verified directly / confirmed with the universities" from three posts. Replace it with "Sources" or a "How we verify" link.
- **C-A2 Byline "Unnati Vidya research team"** (L26). Constraint and design standard §4 require exactly "**Content Team, Unnati Vidya**", linked to a truthful profile (`/authors/content-team` exists).
- **C-A3 Hard-coded "Updated October 2026"** (L27) and fixed "{read} read". Dates must be real. Read times for the blog are computed; guides have none.
- **C-A4 Generated section copy with false or unverified statements**:
  - Fees: "Every listed program offers full payment, semester-wise payment and no-cost EMI" and "Some universities give a small discount for paying the full fee upfront" (L77). Constraint 6 forbids the "Full payment (2% off)" template, and the no-cost EMI placement is new. The computed "Per semester" column (L76) is a template value.
  - Eligibility: "No work experience or entrance test required." and "Entrance test: Not required" for every university (L80). These are unverified for SMU and Amity, and there are real per-university eligibility facts in `guide-content.ts`.
  - Careers: "Placement rate" and "Avg package" table (L83). These are university-wide figures, unlabelled and deferred (constraint 4). The salary ranges "Business Manager (₹6-11 LPA)…" (L84) must be labelled "indicative, not verified" (constraint 8).
  - Approvals: "UGC: Entitled" for every university and "We check every program … each admission cycle" (L87); "legally equivalent … The certificate carries no 'online' marking" (L86). Recognition must be the per-program dated result (constraint 8). The certificate claim is unsourced.
- **C-A5 Missing current features**:
  - Newsletter sign-up (constraint 1, 10)
  - Apply now CTA
  - FAQ plus FAQPage JSON-LD
  - Sources with checked dates (constraint 10)
  - Cover image
  - CMS body blocks (note, image, links)
  - Article JSON-LD
  - Eligibility checker link
  - Outside-India category fees with prospectus source
  - Scholarships
  - The career "What we could and couldn't verify" box
  - UGC status banner and badges
  - Guide cross-links
  - Author profile link
  - Back to top
- **C-A6 URL** `?slug=` (L70). Must be `/online-degree-guides/[slug]` or `/blog/[slug]`. The design's breadcrumb "Guides" must split: "Online Degree Guides" for guides, "Blog" for articles.
- **C-A7 Compare CTA** (L53) passes all ids of the degree (could be 3+), says "placement data" and links to the gated tool without explaining the gate. Use ≤3 ids (`add=`), or the editorial pairs.
- **C-A8 Accessibility**: the TOC uses div onClick items (not links or keyboard, about 20px tall); tables are div grids; the icon ligatures are read aloud.
- **C-A9 Related guides** (L92) are the first 4 of any category or degree. The current logic is relevant (same degree, or same category first).
- **Q**: Single column (design) versus the current right rail. The design implies a single column; the owner or designer should confirm where Related, Sources, Newsletter and Apply now go on desktop.
- **Q**: Should guides show a "Last reviewed" date for fee guides? They currently have none. The design implies an "Updated" date on every guide.

---

## 7. Summary of the top conflicts

1. **Best-value highlighting** in the Universities "at a glance" table: min fee, max placement, max average package and max programs in green, with the copy "The best value in each row is highlighted." (Universities L49, L73–76). This breaks constraint 4. Remove it.
2. **Unlabelled, enlarged deferred claims**:
   - Placement % and average package in the Universities card stat block and table, the University hero stat strip and Key highlights.
   - A rating badge overlaid on campus images.
   - The current pages hide or label these. Constraints 4 and 5 and the expansion plan say not to enlarge them.
3. **Recognition overstated**:
   - "every program checked … re-checked every admission cycle" (Universities hero and FAQ)
   - "UGC recognition: Yes (UGC-entitled)" (University Key highlights)
   - Tagline and green-check badges implying program approval
   - "It is part of a UGC-entitled online degree" (Specialization FAQ)
   - Article "UGC: Entitled" for all
   - These break constraint 8. Use the per-program dated results and keep the university-level caveats.
4. **Missing must-keep features**:
   - NIRF card with source (University)
   - Recognition explanations, Sources, Before-choosing checklist, Apply rail and mobile bar
   - Sibling specializations per university, career-paths caveat, related guides (Specialization)
   - Newsletter, sources with checked dates, FAQ, Apply now, covers (Article)
   - The separate `/blog` vs `/online-degree-guides` structure with search, filters and URL state
5. **Invented or placeholder copy**:
   - "Who it suits" checklist
   - "fully online with proctored exams"
   - "Industry-aligned online programs"
   - Generic MUJ support, admission and FAQ content applied to all universities
   - Fee-article claims of a full-payment discount, no-cost EMI everywhere and no entrance test anywhere
   - Unlabelled MBA salary bands
   - "Source-verified"
   - The byline "Unnati Vidya research team"
   - Hard-coded "Updated October 2026" and fixed read times
   - SMU/Amity `about` and review-count placeholders
6. **Phone number and impartiality claims**:
   - "Call 1800-120-4050" in the University and Guides FAQs (constraint 2)
   - "universities compensate us equally … no commission bias" (removed claim)
   - "within one working day"
7. **Query-param URLs** (`?id=`, `?key=`, `?slug=`, `Compare?uni=`/`?ids=`, `Apply?uni=`, `Courses?uni=`). Map them to `/universities/[slug]`, `/specializations/[slug]` (keeping the repo's 101 slugs; the design's `&`→"and" slugify differs), `/online-degree-guides/[slug]` or `/blog/[slug]`, `/compare?add=` (gated, ≤3) and `/lead?university=` / `/courses?university=`.
8. **Accessibility gaps in the design**:
   - Clickable divs for tabs, pills, TOC and FAQ toggles
   - An unlabelled search input with `outline:none`
   - Pills and chips about 34–35px (<44px)
   - Div-grid tables without semantics
   - Material Symbol ligatures that need `aria-hidden` (use lucide-react)
   - Low-contrast "FEATURED GUIDE" label
   - Scroll-reveal hiding content
   - Google Fonts blocked by CSP (self-host Plus Jakarta Sans)
9. **Asset notes**: all referenced logos, campuses and approval SVGs exist locally. SMU and Amity partner logos also exist, while the design shows MUJ only. `amity-online-campus.webp` is 2.6 MB. The design uses no blog covers, although 26 exist.
