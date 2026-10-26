# D: Tools, Apply and company pages: design spec, current state, changes, conflicts

Scope: Recommender ("Find my fit"), EMI calculator, Shortlist, Apply now, About, How we verify, Legal, MobilePreview (reference only). The total cost planner, eligibility checker and newsletter pages have no design, so this document gives restyle guidance for them.

Sources read in full: `design_handoff_unnati_vidya/{README.md, Recommender, EMICalculator, Shortlist, Apply, About, HowWeVerify, Legal, MobilePreview}.dc.html`, `uv-data.js`. I also read parts of `UVHeader`, `UVFooter` and `UVFaq`. Current code read: `src/app/recommender/page.tsx`, `src/components/recommender-quiz.tsx`, `src/app/api/recommender/route.ts`, `src/lib/{recommender-matching,groq-recommender,recommender-followup}.ts`, `src/app/tools/{emi-calculator,total-cost,eligibility-checker}/page.tsx`, `src/components/{emi-calculator,total-cost-planner,eligibility-checker,shortlist-view,save-button,lead-form,lead-wizard-modal,lead-form-loader,legal-page-layout,newsletter-signup}.tsx`, `src/lib/{use-shortlist,lead-consent,lead-course-options}.ts`, `src/app/{shortlist,lead,about,how-we-verify,privacy,terms,refund-policy}/page.tsx`, `src/app/newsletter/{confirm,unsubscribe}/page.tsx`, the relevant `src/styles/globals.css` blocks, `docs/IMPLEMENTATION_PROGRESS.md` increments 80–87, `docs/NEXT_PHASE_PLAN_2026-10.md` §5 and §11, `docs/DESIGN_AND_CONTENT_STANDARD.md` and `docs/CLAIMS_REGISTER.md`.

Line references cite `file:approx-line`. "D-" means design file and "C-" means current repo file.

---

## 0. Cross-cutting notes for these pages

### 0.1 Tokens these pages use (from the design)
- Text: `#16133F` (navy/body), `#2B2950` (ink-2), `#4A4867` (ink-3, paragraphs), `#6F6D8C` (ink-4, meta), `#8E8CA8` (ink-5, disclaimers).
- Primary: `#5B4CF0`, hover `#4A3BDB`, `#F4F2FF` (primary-50), `#F1EEFF` (icon tiles), `#ECE9FE` (selected/ring track), `#D6D0FA` (outline button border), `#CFC9FA` (card hover).
- Borders: `#E8E6F3` (cards), `#E4E1F3` (inputs/strong), `#F3F2F9` (row dividers), `#EEECF8` (hero bottom border).
- Surfaces: `#F8F7FD` (tiles, table header, +91 prefix), navy panel `#16133F`.
- Status: success `#12925A` (icon) / `#12784B` (text) / `#E7F6EE` (bg); warning `#A35A0B` on `#FFF4E5` (How we verify) **or `#FFF1E6` (Recommender over-budget pill, D-Recommender:148). The two differ, so pick one.** Error `#B42318`. Match-ring colours `#12A35C` and `#3B82F6` (D-Recommender:145) appear only here and are not in the README token table.
- On navy (EMI): `#B7B3E6` (labels), `#9C98CC` (disclaimer), chart `#8B7CFF` / `#fff` / `#F0A30A`. About navy panel paragraph: `#C3C0E6`.
- Inner-page hero background (EMI, Shortlist): `radial-gradient(520px 280px at 90% 0%, #E6E1FF 0%, rgba(230,225,255,0) 70%), linear-gradient(180deg, #F7F5FF, #FBFAFF)` with a 1px `#EEECF8` bottom border. The About, How we verify and Recommender heroes use `600px 320px at 85% 0%`. Legal uses the linear gradient only. Apply puts `radial-gradient(700px 360px at 90% 0%, …), linear-gradient(180deg, #F7F5FF 0%, #FFFFFF 60%)` on the whole page wrapper.
- Breadcrumb pattern (all inner pages): 13px `#6F6D8C`, flex with gap 6, `chevron_right` icon 16px as separator, current item `#16133F`, Home link `#5B4CF0`.
- Inner H1: `clamp(30px,4.2vw,46px)` / 800 / letter-spacing -0.035em, margin-top 14. Hero paragraph 16px `#4A4867`, margin-top 8.
- Container: `max-width:1240px; padding-inline: clamp(16px,3vw,32px)`. The text-first pages (About hero, How we verify, Legal) use 980px; Apply uses 1160px; the Recommender quiz uses 760px.
- Buttons: primary `#5B4CF0`, white text, 700, radius 10–12, padding 12–15 × 18–20. Outline: 1px `#D6D0FA`, primary text, 700. On navy: white button with navy text, plus a ghost button with a `rgba(255,255,255,0.3)` border.
- `<main>` uses `flex:1` so the footer stays at the bottom. The footer's `margin-top:80px` comes from the UVFooter component.

### 0.2 Shared implementation constraints for every page in this file
- **Icons:** the design uses the Google-hosted `Material Symbols Rounded` font with ligature text. CSP allows only self (constraint 11), so the CDN will be blocked. The repo uses `lucide-react`. Map each ligature to a lucide icon with `aria-hidden="true"`. Suggested map: school→GraduationCap, workspace_premium→Award, business_center→Briefcase, computer→Monitor, account_balance→Landmark, auto_stories→BookOpen, savings→PiggyBank, account_balance_wallet→Wallet, payments→Banknote, diamond→Gem, work→BriefcaseBusiness, sell→Tag, star→Star, check_circle→CircleCheck, arrow_back→ArrowLeft, chevron_right→ChevronRight, verified→BadgeCheck, database→Database, update→RefreshCw, route→Route, restart_alt→RotateCcw, auto_awesome→Sparkles, compare_arrows→ArrowLeftRight, laptop_mac→Laptop, support_agent→Headset, bookmark/bookmark_added→Bookmark/BookmarkCheck, balance→Scale, fact_check→ListChecks, travel_explore→SearchCheck, rule→ListChecks, flag→Flag, open_in_new→ExternalLink, lock→Lock, help→CircleHelp, add/remove→Plus/Minus, call→**remove it (no phone)**. The alternative is self-hosting a subset of the icon font, which is a dependency/size review item. If ligature text renders without the font, screen readers read "check_circle" aloud, so every icon must be `aria-hidden`.
- **Font:** load Plus Jakarta Sans through `next/font` (self-hosted), never the Google CDN `<link>`.
- **Scroll reveal** (uv-data.js:88–101): sections below the fold start at `opacity:0`. That breaks constraint 11 ("content visible without JS, no scroll-reveal that hides content"). Implement only as progressive enhancement: CSS starts visible and JS adds a class after the observer is set up, or drop it. Disable it under reduced motion, as the design already does.
- **UVFaq** (used on Recommender and EMI): the question rows are `<div onClick>` with no button role, `aria-expanded` or keyboard support, and the answer is removed from the DOM when closed. Keep the current `<details name="…">` exclusive accordions, which are native, keyboard-accessible and visible without JS. Restyle them to the UVFaq look: two columns `flex:1 1 380px`; card border `#E8E6F3` radius 12, open border `#CFC9FA`; summary min-height 52, padding 14×16, `help` icon 20px `#5B4CF0`, question 15px/600, `add`/`remove` 22px; answer 14px/1.65 `#4A4867` with padding `0 16px 16px 48px`. The UVFaq "View all FAQs →" link goes to Guides (UVFaq:16). Decide whether to keep it. FAQPage JSON-LD stays as today.
- **Phone:** each of these pages shows "1800-120-4050" or a `tel:` link in the design. All must be removed (constraint 2). Contact is `admin@unnatividya.com`.
- **CTA label:** every generic enquiry CTA must read exactly "Apply now" and open the modal through `data-open-lead` with `/lead?…&intent=…`. Design variants to fix: "Request a callback" (About), "Report an error" → Apply (How we verify), "Check loan eligibility" → Apply (EMI), "Start application enquiry" (Course page, not in scope here).
- **Design asset URLs** point to `https://unnatividya.com/...`. All the assets these pages use exist locally in `public/`: `/universities/{slug}-logo.svg` and `-campus.webp`, `/approvals/*.svg`, `/brand/*`, `/streams/*`. They also have local state illustrations the design doesn't use: `/states/shortlist-empty.webp`, `/states/no-course-matches.webp`, `/states/application-enquiry-received.webp`, `/hero/recommender-preview.webp`. Use relative paths and `next/image`.
- **Course IDs:** the design catalog (uv-data.js:12–43) uses short IDs that differ from the repo for 8 courses: `maeco-muj`↔`ma-economics-muj`, `maeng-smu`↔`ma-english-smu`, `mapol-smu`↔`ma-political-science-smu`, `masoc-smu`↔`ma-sociology-smu`, `mapp-amity`↔`ma-public-policy-governance-amity`, `bcomh-amity`↔`bcom-honours-amity`, `mscds-amity`↔`msc-data-science-amity`, `mscmath-muj`↔`msc-mathematics-muj`. Always use the published CMS catalog (`getPublishedCatalog` / `useCatalog`), never uv-data.js. `course.emi` in the repo is a string (`"₹7,500/mo"`), not a number. `course.duration` is a string (`"24 months"`), not `months`.
- **Storage:** the design uses `uv_saved` and `uv_compare` with a `uv-store` event (uv-data.js:51–57). The repo uses `uv_shortlist` with `uv-shortlist-changed` (C-use-shortlist.ts:6–7). Keep the repo key, since renaming it would wipe learners' saved lists. The design's default compare list `['mba-muj','mba-smu','mba-amity']` must not be ported, because compare is gated (constraint 3).

---

## 1. Recommender: "Find my fit" (`/recommender`)

### 1.1 Design spec (D-Recommender.dc.html)

#### Quiz view (lines 20–42; logic 118–134)
- **Header:** UVHeader with `active=""`, sticky.
- **Section** (`flex:1`): background `radial-gradient(600px 320px at 85% 0%, #E6E1FF 0%, rgba(230,225,255,0) 70%), linear-gradient(180deg, #F7F5FF, #FFFFFF)`.
- **Inner:** `max-width:760px; margin:0 auto; padding: clamp(28px,5vw,56px) clamp(16px,3vw,32px) 64px`.
- **Eyebrow:** 12px / 700 / letter-spacing 0.06em / `#5B4CF0`: "FIND MY FIT · STEP {n} OF 4".
- **Progress:** `display:grid; grid-template-columns:repeat(4,1fr); gap:6px; margin-top:12px`. Each bar is `height:6px; border-radius:3px`, `#5B4CF0` for index ≤ current step and `#E4E1F3` otherwise. Bars up to and including the current step are filled.
- **H1 (the question):** margin-top 28; `clamp(28px,4vw,40px)`; letter-spacing -0.035em; 800; line-height 1.1.
- **Sub-paragraph:** margin-top 8; `#4A4867`; 16px.
- **Options grid:** `repeat(auto-fit, minmax(min(100%,300px),1fr))`; gap 12; margin-top 24. That gives 2 columns on desktop (696px content) and 1 column below about 648px.
- **Option card:** `display:flex; gap:14px; align-items:center; padding:18px; border-radius:16px; background:#fff; border:1.5px solid #E8E6F3` (selected: `#5B4CF0`); `box-shadow: 0 12px 30px -24px rgba(60,45,170,0.5)`; hover border `#5B4CF0`; cursor pointer.
  - Icon tile: 48×48, radius 12, bg `#F1EEFF`, icon 24px `#5B4CF0`, `flex:none`.
  - Label 800 (16px inherited); sub-label 13px `#6F6D8C`, margin-top 2.
  - Trailing `check_circle` 22px: `#5B4CF0` when selected, `#E4E1F3` otherwise.
- **Footer row:** `display:flex; justify-content:space-between; margin-top:28px`.
  - Left: "Back" (`arrow_back` icon + text), 700, `#4A4867`, gap 6. `visibility:hidden` on step 1.
  - Right: "No sign-up to see results" (13px `#6F6D8C`).
- **Questions (exact copy, D-Recommender:121–124):**
  1. "What is your current education?" / "This decides whether we show undergraduate or postgraduate degrees."
     - `UG` "I've completed 12th" / "Show undergraduate degrees" / `school`
     - `PG` "I've completed graduation" / "Show postgraduate degrees" / `workspace_premium`
  2. "What would you like to study?" / "Pick the field closest to your career goal."
     - Management / "MBA, BBA" / `business_center`
     - IT & Computers / "BCA, MCA, MSc" / `computer`
     - Commerce / "B.Com, M.Com" / `account_balance`
     - Arts & Humanities / "BA, MA" / `auto_stories`
  3. "What is your total budget?" / "Total tuition for the full program. EMI is available on every program."
     - 100000 "Up to ₹1 lakh" / "Most affordable options" / `savings`
     - 150000 "₹1 – 1.5 lakh" / "Balanced choice" / `account_balance_wallet`
     - 200000 "₹1.5 – 2 lakh" / "Wider choice" / `payments`
     - 300000 "Above ₹2 lakh" / "All programs" / `diamond`
  4. "What matters most to you?" / "We'll weigh your matches by this."
     - placement "Placement support" / "Higher placement assistance rate" / `work`
     - fee "Lowest fee" / "Lower total and monthly cost" / `sell`
     - rating "Learner ratings" / "Highest-rated by learners" / `star`
- **Interaction:** clicking an option stores the answer and **auto-advances** (`step+1`, max 4). Back steps back and keeps the answers. There is no Continue button, no URL update and no analytics. Step 4 shows the results.
- **URL:** `?results=1` jumps straight to results with demo answers `{lvl:'PG', stream:'Management', budget:200000, goal:'placement'}` (line 114). This is a prototype preview hook, not real state.

#### Scoring (lines 136–142)
For every course at the chosen level, with no stream or budget exclusion:
- `sc = stream match ? 52 : 8`
- `+= fee ≤ budget ? 26 : max(0, 26 − (fee − budget)/3000)`
- `+= clamp01(g) × 20`, where `g` is `(uni.placement − 78)/10` for placement, `1 − fee/275000` for fee, and `(course.rating − 4.1)/0.6` for rating.
- `match = min(97, round(sc))`, sorted descending. Top 3 are recommendations; ranks 4–6 go to "Explore more programs".

#### Results view (lines 44–104; logic 135–157)
- **Hero section:** radial `600px 320px at 85% 0%` + `linear-gradient(180deg,#F7F5FF,#FBFAFF)`, 1px `#EEECF8` bottom border. Inner max 1240, padding `22px clamp(16px,3vw,32px) 32px`.
  - Breadcrumb: Home › "Find my fit" (a clickable span `#5B4CF0` that restarts) › "Your recommendations".
  - Eyebrow (margin-top 18): "PERSONALIZED RECOMMENDATIONS".
  - H1 (margin-top 8): `clamp(32px,4.6vw,52px)`, letter-spacing -0.04em, 800, line-height 1.04: "Your personalized <span style=color:#5B4CF0>recommendations</span>".
  - Paragraph (margin-top 12, 16px `#4A4867`, max-width 620): "Based on your answers, here are the best matching online degree programs for your goals, background and budget."
  - Trust row (flex wrap, gap 24, margin-top 20). Each item has a 40px circle (white, 1px `#E4E1F3` border, icon 20px `#5B4CF0`), a title (14px/800) and a sub-line (12px `#6F6D8C`):
    - `verified` "Curated by experts" / "Rules + counsellor review"
    - `database` "Real university data" / "Fees, eligibility, placements"
    - `update` "Updated regularly" / "Every admission cycle"
- **Main:** max 1240, padding `24px clamp(16px,3vw,32px) 0`, `display:flex; flex-wrap:wrap; gap:24px; align-items:flex-start`.
- **Aside "Your journey":** `flex:1 1 280px`, max-width 320px (100% below 860px), 1px `#E8E6F3` border, radius 18, padding 22, white. `position:sticky; top:92px` on desktop, static on mobile.
  - Head: `route` 24px `#5B4CF0`, "Your journey" 17px/800, "Here are the details you shared with us." 13px `#6F6D8C`.
  - Rows (margin-top 16): `display:flex; gap:12px; padding:10px 0; border-bottom:1px solid #F3F2F9`.
    - Number circle: 26px, `#5B4CF0`, white 12px/800.
    - Label 13px/800: "Current education" / "What you want to study" / "Budget range" / "What matters most".
    - Value 13px `#4A4867`, margin-top 2: the chosen option label.
    - "Edit" 13px/700 `#5B4CF0`, which jumps to that quiz step.
  - "Retake quiz": margin-top 16, centred, padding 12, radius 11, 1px `#D6D0FA` border, `#5B4CF0`, 700, `restart_alt` 20px. It sets step 0 and does **not** clear the answers.
- **Results column:** `flex:999 1 560px; min-width:0`, column, gap 14.
  - Headline card: padding 16×20, 1px `#E8E6F3` border, radius 16, space-between, wraps.
    - `auto_awesome` 26px; headline 17px/800 "{n} programs match your preferences" (n is always 3); sub-line 13px "Ranked by stream fit, budget and what matters most to you."
    - "Compare these" button (`compare_arrows` 18px, padding 9×14, radius 10, `#D6D0FA` border, 13px/700) → `Compare?ids=a,b,c`.
  - **Recommendation card** (×3): flex wrap, gap 20, centred, padding 20, 1px `#E8E6F3` border, radius 18, white.
    - Match ring: 96px circle with `background: conic-gradient(COL calc(match*3.6deg), #ECE9FE 0)` and an inner 80px white circle. Inside: "{match}%" 24px/800 (letter-spacing -0.02em) and "Match" 11px/700 `#6F6D8C`. COL is `#12A35C` if ≥85, `#3B82F6` if ≥70, else `#5B4CF0`.
    - Info (`flex:1 1 260px`): university logo 32×32 `object-fit:contain` with `alt=""`; title 18px/800 ("Online MBA"); university name 13px `#6F6D8C`.
    - Reason pills (margin-top 10, gap 6): 12px/700, padding 4×9, radius 6.
      - "Matches {stream}" (green: `#E7F6EE` / `#12784B`)
      - "Within budget" (green) or "₹X over budget" (`#FFF1E6` / `#A35A0B`)
      - Priority pill: "{placement}% placement support", "★ {rating} rating" or "EMI ₹X/mo" (green)
    - Static badge row (margin-top 12, gap 16, 13px `#4A4867`, icons 17px), shown for every program: `verified` (`#12925A`) "UGC Entitled" · `workspace_premium` "NAAC A+" · `laptop_mac` "100% Online".
    - Price block (min-width 130): fee 22px/800, "Total program fee" 12px; EMI 16px/800 (margin-top 6), "EMI approx." 12px.
    - Actions (column, gap 6, `flex:1 1 150px`, max-width 200): "View details" (primary, padding 10, radius 10, 13px/700) → Course; "Shortlist" / "✓ Shortlisted" toggle (outline, padding 9); "Apply now" (outline, with a `call` icon 16px) → `Apply?course=id`.
  - Disclaimer, 12px `#6F6D8C`: "Preference-based suggestions are a starting point, not an admission decision."
- **Help CTA** (full-width flex item, margin-top 12): radius 20, `linear-gradient(135deg,#F4F2FF,#EEEAFF)`, padding `clamp(20px,3vw,28px)`, flex wrap, gap 18.
  - 60px white circle with `support_agent` 30px.
  - "Need help choosing the right program?" 19px/800, then "Our education experts can help you compare programs, understand eligibility, fees and placement support." 14px `#4A4867`.
  - Primary button with `call` icon: "Apply now" (padding 13×20, radius 11).
- **Explore more programs** (margin-top 20): H2 `clamp(22px,3vw,28px)`/800/-0.025em, "Explore more programs"; paragraph "A few more options you might be interested in."; right link "View all programs →" (14px/700) → Courses. Grid `auto-fill minmax(min(100%,300px),1fr)`, gap 14, with 3 UVCards (ranks 4–6).
- **FAQ** (margin-top 28): UVFaq with title "Frequently asked questions" and subtitle "Get quick answers about our recommendations." Items (line 156):
  - "How are these programs recommended?" → "We score every program at your level on stream fit, budget fit and the priority you chose, using listed fees and university data."
  - "Why is my match percentage different for each program?" → "Each program scores differently on stream, budget and your priority. Higher means a closer fit to your answers."
  - "Are the fees and details up to date?" → "We re-check fees and approvals against university sources every admission cycle."
  - "Can I get help from an expert?" → "Yes — counselling is free. Call 1800-120-4050 or request a callback."
- **Responsive:** below 860px (JS `window.innerWidth`) the aside goes full width and static, above the results. Everything else reflows through flex-wrap and auto-fit.
- **Accessibility present:** text labels on everything; decorative logos have `alt=""`.
- **Accessibility missing:**
  - Option cards, Back, Edit, Retake and Shortlist are `<div onClick>`, so there is no keyboard access and no radio semantics.
  - No focus move on step change, and the H1 changes per step without an announcement.
  - Progress bars have no text alternative beyond the eyebrow.
  - Auto-advance on selection is a WCAG 3.2.2 risk if it fires on keyboard arrow selection.
  - Ligature icons are not `aria-hidden`, and the ring's colour carries meaning.
  - There is no `aria-live` region for results.

### 1.2 Current implementation (C-recommender-quiz.tsx, C-api/recommender/route.ts, increment 81)
- **Page** (`src/app/recommender/page.tsx`): metadata "Find Your Online Course", canonical `/recommender`, FAQPage JSON-LD, and 6 FAQs as a `<details name="recommender-faq">` list (C-recommender/page.tsx:15–22). The FAQs cover how matching works, AI use, no sign-up, no matches, follow-up questions and fee quotes.
- **Intro** (C-recommender-quiz:116): H1 "Find a course that fits your preferences", "Five quick questions. Free results, with no sign-up required." and the disclosure "We filter published course data first. Groq may order suitable options; it cannot change listed fees or decide admission eligibility."
- **Five questions** (C-recommender-quiz:12–18), all hard filters except priority:
  1. "Which degree level are you exploring?" UG / PG / Show both levels
  2. "Have you completed a bachelor's degree?" Yes / Not yet / Prefer not to say. "Not yet" excludes PG.
  3. "Which subject interests you?" 4 streams + "Explore all subjects"
  4. "What is your total tuition budget?" Up to ₹1,00,000 / Up to ₹1,80,000 / No budget limit yet
  5. "What matters most when comparing options?" Lower listed tuition / Shorter listed duration / Balanced shortlist
- **UI:** radio `fieldset` with an sr-only legend; Continue/Back buttons, with Continue disabled until an answer is chosen; "Question n of 5"; the heading receives focus on each step change; `trackEvent` analytics for each step and on completion.
- **Results:**
  - Edit buttons per answer ("{label} · Edit").
  - "{n} programs match your filters. Showing {k}; this is not a quality or admission ranking."
  - An `aria-live` mode line: "Checking the published options for a tailored order…", "AI-assisted order, using only published course facts." or "Showing the standard filter results. AI ordering is currently unavailable."
  - Up to 3 result cards: name — university; level · stream · duration; listed total tuition; reason sentences; source link ("Check university/source page (host)"); "View course" and "Apply now" (`/lead?course=id&intent=recommender`, `data-open-lead`).
  - "Compare these N" (`/compare?add=…`) and "View all N matches" (`/courses?level&stream&maxFee`).
  - "Retry AI ordering" on provider or invalid-output failure.
  - **Follow-up chat**, "Ask about these courses": 4 example question buttons, a `role="log"` history with sources, a 300-character textarea and "Ask question". The help text warns "Please do not enter contact details here."
  - An empty state that explains the PG-vs-no-bachelor conflict, and "Start again".
- **Server:** `matchingCourses` applies hard filters (level, qualification, stream, budget ≤). `sortMatches` sorts by fee or duration. Up to 12 candidates go to Groq (`rankWithGroq`), which may only choose IDs and pre-approved `reasonKeys` (level, subject, budget, lower_tuition, shorter_duration, catalog_option). The server composes the reason text. Rate limits: 8 per 10 minutes per IP; Groq 10 per minute and 250 per day. The standard fallback is used when Groq is unconfigured, rate-limited or errors.
- **Follow-up** (`/api/recommender/follow-up`): intent classification over 9 intents. Answers are composed server-side from published facts; off-topic questions and personal details are rejected.
- **Not present today:** progress bars, icon option cards, auto-advance, journey sidebar, match %, reason pills, university logo, Save/Shortlist on results, "Explore more programs" cards, help CTA panel, answers in the URL (NEXT_PHASE_PLAN §5 asks for "answers in the URL").
- **CSS:** `.course-matcher`, `.matcher-*` (globals.css:3829–3864), in the old palette (`#544cc8`, `#cfdae6`, radius 8).

### 1.3 Changes required (map to `src/components/recommender-quiz.tsx`, `src/app/recommender/page.tsx`, globals.css `.matcher-*`)
1. **Quiz shell:** restyle `.course-matcher` to the design section (gradient bg, 760px inner, paddings).
   - Replace "Question n of 5" with the eyebrow "FIND MY FIT · STEP n OF N" and the N-bar progress grid. Add `aria-hidden` on the bars, keep a text step count, and use `role="progressbar"` or keep the eyebrow as the accessible text.
   - Keep a short intro and the Groq disclosure, either above the eyebrow or below the options. The Standard requires the explanation to match the calculation.
2. **Question heading:** keep the existing `ref`/`tabIndex=-1` focus-on-step behaviour. Decide whether the question should be the page H1 as in the design. If so, server-render a stable page H1 for SEO (visible or sr-only, e.g. "Find a course that fits your preferences") and render the question as the step heading with H1 styling.
3. **Option cards:** render each as `<label class="matcher-option">` wrapping a visually hidden native `<input type=radio>` (keep the fieldset/legend), styled as the design card. Add the 48px icon tile (lucide), label, sub-label and trailing check icon. Use `:has(input:checked)` for the 1.5px `#5B4CF0` border and `:has(input:focus-visible)` for the focus ring. Add the sub-label copy per option (new copy needed for the current options; see 1.4).
4. **Advance behaviour:** either keep an explicit "Continue" (recommended for accessibility and WCAG 3.2.2), or auto-advance on pointer click only, never on keyboard arrow-key changes. Keep Back as a real `<button>` styled as the design's text button, and keep "No sign-up to see results".
5. **Questions:** see 1.4 for the 4-vs-5 decision. If the owner keeps 5, use 5 bars and "STEP n OF 5". Map icons, for example:
   - Level: UG `GraduationCap`, PG `Award`, both `Layers`.
   - Qualification: `BadgeCheck` / `School` / `HelpCircle`.
   - Stream: the 4 design icons plus `Compass` for "Explore all subjects".
   - Budget: `PiggyBank` / `Wallet` / `Infinity`.
   - Priority: cost `Tag`, duration `Clock`, balanced `Scale`.
6. **Results hero:** add the design hero (breadcrumb, eyebrow, H1, paragraph) with **reworded copy** (see 1.4). Replace the trust row with accurate items, e.g. "Published catalog only / Filters first, then ordering", "Source links / Each result links to its official page", "AI optional / Standard order if AI is unavailable". This needs owner approval.
7. **Journey aside:** render from `questions`/`answers`, with one row per question (5 or 4), number circles and "Edit" as `<button>` calling the existing `edit(step)`. "Retake quiz" calls `restart()`, which clears answers (unlike the design; keep clearing). Use a sticky aside at ≥860px via CSS `@media (min-width:860px)`, not JS width state. Today's `.matcher-answer-summary` buttons are replaced by this aside.
8. **Headline card:**
   - Headline "{matches.length} programs match your filters · showing {results.length}".
   - Subline is the existing mode text (keep it `aria-live`): "AI-assisted order, using only published course facts." / "Standard order: lowest listed tuition first." / "Checking…".
   - "Compare these" → `/compare?add=…` (gated) for ≥2 results.
   - Keep "View all N matches" (`/courses?…`) as a secondary link here or below the cards.
9. **Result card:**
   - Design layout with the university logo (`universityMedia[id].logo`), course name and university.
   - Reason pills built from the existing reason keys, with new short labels (e.g. level→"Postgraduate", subject→"{stream}", budget→"Within your budget", lower_tuition→"Lowest listed tuition among matches", shorter_duration→"Shortest listed duration among matches", catalog_option→"Fits your filters"). Keep the full sentences available, e.g. as a `title`/sr-only text or a line under the pills.
   - Price block "Listed total tuition" (not "Total program fee") plus EMI `course.emi` labelled "EMI from" if the owner retains the no-cost EMI claim.
   - Replace the static badges with the per-program recognition chip from `src/lib/program-facts.ts` (dated UGC-DEB result or "being re-checked"), and drop the "NAAC A+" institution badge or label it "University: NAAC A+".
   - Keep the source link line.
   - Actions: "View details" → `/courses/[slug]`; Save → reuse `SaveButton` or a labelled toggle backed by `useShortlist` ("Save" / "Saved", `aria-pressed`); "Apply now" → `/lead?course=id&intent=recommender` with `data-open-lead` and **no phone icon**.
10. **Match ring:** remove it or replace it (see 1.4). If kept as a visual, show the rank ("1", "2", "3") in a 96px ring that is fully filled, with no percentage.
11. **Follow-up chat:** keep it. Place it after the result cards and the disclaimer, before the help panel, as a design card (1px `#E8E6F3` border, radius 18, padding 22).
    - Example questions as chips (radius 99, `#D6D0FA` border, 13px/700, min-height 44).
    - Turns styled as `#F8F7FD` tiles with radius 14.
    - Textarea styled as design inputs (border `#E4E1F3`, radius 11, padding 13×14).
    - "Ask question" as a primary button.
    - Keep `role="log"`, `aria-live`, the error `role="alert"` and the "do not enter contact details" note.
12. Keep "Retry AI ordering", restyled as an outline button.
13. **Help CTA panel:** keep it with reworded copy. The button is "Apply now" → `/lead?intent=recommender` with `data-open-lead` and no `call` icon.
14. **Explore more programs:** show matches ranked 4–6 (current `matches.slice(3,6)`, filters respected) using the shared Program card from the Courses redesign. If fewer than 4 matches exist, hide the section. Keep the "View all N matches" link.
15. **Empty state** (`results.length === 0`): restyle with the design empty-state pattern (dashed `#D6D0FA` border, radius 20) and `/states/no-course-matches.webp`. Keep the current conflict-explanation copy.
16. **FAQ:** keep the current 6 FAQ items (accurate to Groq behaviour) and the JSON-LD. Restyle as described in 0.2.
17. **URL state:** add answers to the URL (e.g. `/recommender?level=PG&qualification=bachelors&stream=Management&budget=180000&priority=cost`) so results are shareable and survive Back (NEXT_PHASE_PLAN §5). Do not port `?results=1`. Add `robots: noindex` for parameterised states or canonicalise to `/recommender`, which is already the canonical.

### 1.4 Conflicts / questions
1. **4-step design vs 5 hard-filter questions (constraint 10).** The design has 4 steps (education, stream, budget, priority) with **soft scoring**: over-budget and other-stream programs still rank, with "₹X over budget" pills and an "+8" off-stream score (D-Recommender:136–149). The current tool uses hard filters, and the Standard and FAQ promise "does not silently recommend courses outside your selected filters". Keep the hard-filter semantics and the current server code.
   - Option A: 5 steps in the design's visual style.
   - Option B: merge level and qualification into the design's step 1 ("I've completed 12th" → UG only / "I've completed graduation" → UG or PG choice / "Show both levels"). That changes the agreed 5-question tool and **needs owner confirmation**.
   - Neither option matches the design one-to-one.
2. **Priority options use placement and ratings** (D-Recommender:124, 139, 149). They conflict with constraint 5 (ratings must not drive ranking or recommendations) and constraint 4 / Standard §147 (placement is unverified and kept out of recommendation evidence). Placement is also a university-wide figure that cannot rank programs. Keep the current cost / duration / balanced priorities.
3. **Match percentage** ("{match}%", capped at 97, rings coloured by threshold) is pseudo-precise and has no counterpart in the Groq ordering. The Standard says "Recommender explanations must match the actual calculation". Under hard filters every result matches 100% of the filters. Recommend removing the % (ask the owner whether the ring should become a rank indicator).
4. **Over-copy and claims to change:**
   - "best matching online degree programs" (D:50): implies quality ranking. Current copy: "this is not a quality or admission ranking."
   - Trust items "Curated by experts — Rules + counsellor review" (false: there is no counsellor review step), "Real university data — Fees, eligibility, placements" (eligibility and placement not verified) and "Updated regularly — Every admission cycle" (verification is ongoing). See D:129.
   - Sub-line "Ranked by stream fit, budget and what matters most to you." (D:72): wrong for hard-filter + Groq/fee ordering.
   - Budget sub-line "EMI is available on every program." (D:123): an owner-stated no-cost EMI claim exists (claims register). Repeating it on a tool needs confirmation; the Standard says "do not add new universal no-cost EMI promises".
   - FAQ (D:156): "We score every program…" (wrong mechanism), "We re-check fees and approvals … every admission cycle" (not yet true per How we verify), "Call 1800-120-4050 or request a callback" (constraint 2).
   - Help panel copy "Our education experts can help you … placement support" (D:95): "experts" and placement support are new service claims, and the `call` icon implies a phone call.
5. **Static badges** "UGC Entitled · NAAC A+ · 100% Online" on every result (D:81) conflict with constraint 8: recognition must be the per-program dated UGC-DEB result, and institution badges must not imply program approval. "100% Online" per program is unverified.
6. **Budget bands.** The design uses ₹1L / ₹1–1.5L / ₹1.5–2L / >₹2L; the current tool uses ≤₹1L / ≤₹1.8L / any. The design bands are better aligned with the catalog: they fix the §5 issue that "7 programs priced ₹1.8–2.75L only appear under 'any'". As hard filters they should be "Up to" ceilings: ≤100000, ≤150000, ≤200000, "No limit". Update `recommenderAnswersSchema`, `RecommenderAnswers["budget"]` and the course-filter URL `maxFee`. Confirm with the owner.
7. **Features the design omits that must stay** (constraint 10): Groq AI ordering + mode line + retry; follow-up chat; per-result source links; "View all N matches"; the no-match explanation; analytics events; the focus management. The design has no slot for any of them, so placement is a design decision (proposed in 1.3).
8. **"Find my fit" vs current "Find my course".** The header/footer label (C-site-header:22, C-site-footer:38) needs an owner decision. The "Find my fit" breadcrumb label is new copy.
9. **"Compare these"** must go to the gated `/compare?add=` (constraint 3), not a public `?ids=` comparison.
10. **"Retake quiz"** in the design preserves the old answers (it only sets step 0). The current "Start again" clears them. Decide which behaviour is wanted.
11. **Option sub-labels** such as "Most affordable options", "Balanced choice", "Wider choice" and "All programs" are mild marketing copy. "Highest-rated by learners" must go (ratings).
12. **Ambiguity:** for UG the "Above ₹2 lakh / All programs" band is effectively "any". The design's step 1 maps graduation to PG only, so graduates never see UG; the current tool allows "Show both levels".

---

## 2. EMI calculator (`/tools/emi-calculator`)

### 2.1 Design spec (D-EMICalculator.dc.html)
- **Header:** UVHeader with `active="tools"`.
- **Hero** (lines 19–25): inner-page gradient (520×280 at 90% 0%), inner padding `22px clamp(16px,3vw,32px) 28px`.
  - Breadcrumb: Home › "Tools" (plain text, not a link) › "EMI calculator".
  - H1 (margin-top 14, `clamp(30px,4.2vw,46px)`, 800, -0.035em): "EMI calculator".
  - Paragraph: "Estimate your monthly payment for any program before you speak to the university."
- **Main:** max 1240, padding `28px clamp(16px,3vw,32px) 0`, column, gap 32.
- **Two-card grid:** `repeat(auto-fit, minmax(min(100%,400px),1fr))`, gap 20, `align-items:start`. Two columns from about 852px of container width.
- **Left input card** (lines 28–35): 1px `#E8E6F3` border, radius 18, padding 24, column, gap 24.
  - **Program:** `<label>` column gap 8; label text 14px/800 "Program". Select: padding 13×14, radius 12, 1px `#E4E1F3` border, 15px/600, white. Options "{Online X} — {UNI} (₹fee)" for all 30 courses.
  - **Down payment:** row space-between 14px/800, "Down payment" and value `#5B4CF0`. Range 0..`round(fee×0.5/5000)×5000`, step 5000, `accent-color:#5B4CF0`, full width, margin-top 10. Below it a min/max row 12px `#6F6D8C`: "₹0" and "{50% of fee}".
  - **Tenure:** label 14px/800 (margin-bottom 10). `grid-template-columns: repeat(5,1fr); gap:6px` of pills: padding 11×4, radius 10, 14px/700, centred, labels "6m 12m 18m 24m 36m". Selected: bg `#5B4CF0`, border `#5B4CF0`, white. Default: white, border `#E4E1F3`, text `#2B2950`.
  - **Interest rate:** row "Interest rate (p.a.)" and value `#5B4CF0` ("No-cost" at 0, else "{r}%"). Range 0–18, step 0.5. Note 12px `#6F6D8C`: "0% = no-cost EMI through university loan partners."
- **Right result card** (lines 36–47): radius 18, padding 28, bg `#16133F`, white, column, gap 20.
  - "Your monthly EMI" 14px/600 `#B7B3E6`; amount `clamp(40px,6vw,56px)`/800/-0.03em, margin-top 4; "for {n} months · {Online X}, {UNI}" 14px `#B7B3E6`.
  - Stacked bar: height 12, radius 6, track `rgba(255,255,255,0.12)`, overflow hidden. Segments in % of total payable: down `#8B7CFF`, principal `#fff`, interest `#F0A30A`.
  - 2×2 figures grid (gap 14). Each has a 10px swatch (radius 3) with a 12px `#B7B3E6` label, and a value 18px/800 (margin-top 2): "Down payment", "Loan amount", "Total interest", "Total payable" (no swatch).
  - Buttons (flex wrap, gap 8, margin-top auto): "Check loan eligibility" (white bg, navy 800, padding 13, radius 11, `flex:1 1 160px`) → `Apply?course=id`; "View program" (1px `rgba(255,255,255,0.3)` border, white 700) → Course.
  - Disclaimer 12px `#9C98CC`: "Estimate only. Final EMI depends on lender approval and current university terms."
- **"Same plan, other universities"** (lines 49–55): H2 `clamp(20px,2.6vw,26px)`/800/-0.02em, margin-bottom 14. Table: 1px `#E8E6F3` border, radius 16, `overflow-x:auto`, inner `min-width:520px`.
  - Grid columns `2fr 1fr 1fr 1fr`. Header row bg `#F8F7FD`, 13px/800 `#4A4867`: "Program", "Total fee", "Your EMI", (empty).
  - Rows have a `#F3F2F9` divider: logo 24px + "{Online X} — {UNI}" 14px/700 · fee 14px · "₹X/mo" 14px/800 · "Use this →" 13px/700 `#5B4CF0` (clickable span).
  - The current program's row bg is `#F4F2FF`. Rows include every course with the same degree short name across universities, at the same down payment (capped at 50% of each fee), tenure and rate.
- **FAQ:** UVFaq titled "EMI questions", subtitle "How financing works for online degrees.":
  - "What is no-cost EMI?" → "The interest is absorbed by the university or lender, so you pay only the program fee split into monthly instalments."
  - "Can I pay semester-wise instead?" → "Yes — every listed program offers semester-wise payment as well as full payment."
  - "Do I need a co-applicant?" → "This depends on the lender. A counsellor can check your eligibility."
  - "Is there a processing fee?" → "Some lenders charge one. Confirm the total payable and financing charges before applying."
- **Logic** (lines 63–81):
  - Defaults `id='mba-muj', down=0, n=24, rate=0`. `?id=` sets the course **and sets tenure `n` to the course duration in months**.
  - Changing the program resets down to 0. "Use this →" changes the id but keeps down, clamped at 50% of the new fee.
  - Formula: `P = max(0, fee − down)`, `r = rate/1200`, `EMI = r ? P·r·(1+r)^n / ((1+r)^n − 1) : P/n`, `interest = EMI·n − P`, `total = down + P + interest`. All values are formatted with `₹` + `toLocaleString('en-IN')`, rounded.
- **Responsive:** the cards stack below about 852px of content width, the tenure pills stay 5 across (about 60px each at 360px, still ≥44px tall) and the table scrolls horizontally.
- **Accessibility missing:**
  - The range inputs and tenure group have no programmatic labels: text sits in a `<div>`, and only Program uses `<label>`. Ranges have no `aria-valuetext` (they announce raw numbers, not ₹).
  - Tenure pills and "Use this" are `<div>`/`<span>` with onClick.
  - No `aria-live` on the result.
  - The stacked bar has no text alternative, although the legend values are present.

### 2.2 Current implementation (C-emi-calculator.tsx, C-tools/emi-calculator/page.tsx)
- **Page:** breadcrumb "Home > EMI Calculator"; H1 "Online degree EMI calculator"; sub-line "Choose a listed program or enter your own fee. See monthly repayments, interest and the overall payment including your down payment." 7 FAQs + FAQPage and Breadcrumb JSON-LD; `StickyMobileBar` "Apply now" (`/lead?intent=emi-calculator`).
- **Inputs:**
  - Optional program select ("Enter fee manually" default, "Name — UNI · listed INR ₹X").
  - **Applicant fee category select** (increment 82: `costChoices`, INR only; USD or unavailable categories produce no estimate), with a source and checked date, and a link to the total cost planner with the course and category.
  - Four number inputs: fee ₹0–1 crore, down 0..fee, months 1–120 (integer), rate 0–50%. Each has help text, inline errors, `aria-invalid` and `aria-describedby`.
- **Formula:** same reducing-balance maths using `expm1`/`log1p` (numerically stable), `principal/months` at 0%, and 0 EMI when principal is 0.
- **Output:** `aria-live` region "Estimated monthly EMI"; amount; "For N months" or "No loan needed for these inputs."; a `<dl>` with Down payment, Loan amount, Total interest, Loan repayments, Overall payment including down payment; note "Rounded to the nearest rupee…".
- **Next step box:** "This is a planning estimate, not a loan offer or approval…", "View selected course", "Apply now" (`data-open-lead`, carries course + category), "Browse courses and fees".
- **Analytics:** `emi_calculator_used`, `emi_calculation`.
- **No URL prefill:** the page does not read `?course`/`?id`, and the course page links to `/tools/emi-calculator` without the course (C-courses/[slug]/page.tsx:365).
- No peer table, stacked bar, sliders or tenure pills.
- **CSS:** `.emi-layout`, `.emi-input-panel`, `.emi-result` (`#263238` dark slate), `.emi-next-step` (globals.css:1543, 3804–3825).

### 2.3 Changes required (`src/components/emi-calculator.tsx`, page.tsx, `.emi-*` CSS)
1. **Hero:** design hero (gradient, breadcrumb Home › Tools › EMI calculator, H1, paragraph). Keep "Tools" as plain text unless a `/tools` index exists; there is none today. Copy decision in 2.4.
2. **Layout:** the two-card auto-fit grid (min 400px) replaces `.emi-layout`. Left: `.emi-input-panel` restyled as the design card. Right: `.emi-result` restyled navy `#16133F`, radius 18, padding 28.
3. **Program select:** the design select style. Keep the "Enter fee manually" option and the applicant fee category select with source/date (constraint 10, increment 82).
4. **Down payment:** add the slider (step 5000, `accent-color`) **paired with** the existing number input, or replace the input with the slider plus a min/max legend.
   - Keep validation (0..fee).
   - The 50% cap is a design assumption; the current tool allows up to the full fee. Decide (2.4).
   - Use `<label for>` and `aria-valuetext="₹X"`.
5. **Tenure:** add the 5 tenure pills (6/12/18/24/36) as a radio group (`role="radiogroup"` or hidden radios), plus "Custom" that reveals the existing 1–120 month input, so the current flexibility is not lost. Pill min-height 44.
6. **Rate:** slider 0–18, step 0.5, label "No-cost" at 0 … plus a numeric input for 0–50 (the current range). See 2.4 for the note wording.
7. **Result card:**
   - Amount `clamp(40px,6vw,56px)`.
   - Subline "for {n} months · {course}, {UNI}", or "for {n} months" in manual mode.
   - Stacked bar with `role="img"` and `aria-label` ("Down payment ₹X, loan ₹Y, interest ₹Z").
   - 2×2 figure grid: Down payment / Loan amount / Total interest / Total payable. Keep "Loan repayments" either as a fifth row or folded in, and keep the "No loan needed" state and the "Correct the highlighted inputs" invalid state.
   - Keep `aria-live`.
8. **Buttons:** replace "Check loan eligibility" with **"Apply now"** (white button, `data-open-lead`, `/lead?intent=emi-calculator&course=…&category=…`) and keep "View program" when a course is selected. Disclaimer: keep the design line, merged with the current "not a loan offer or approval" wording.
9. **"Same plan, other universities":** add it, computed with the current `emi` formula using each peer's listed INR fee. Hide the table when the selected category is non-INR or the fee is manual.
   - Label the fee column "Listed tuition". Make "Use this →" a `<button>`. The current row uses `aria-current="true"` plus the `#F4F2FF` bg.
   - **No "lowest" highlighting** (constraint 4 spirit). Column header "Your EMI" is OK.
10. **URL:** support `?course=<id>` (consistent with `/tools/total-cost?course=` and `/tools/eligibility-checker?course=`) and optionally `&category=row-n`. Treat the design's `?id=` as an alias or ignore it. Update the course page link (C-courses/[slug]/page.tsx:365) to pass the course.
    - Do **not** set the tenure to the course duration (see 2.4).
11. **FAQ:** keep the current 7 accurate FAQs and JSON-LD, restyled. Do not adopt the design FAQ copy (2.4).
12. Keep the `StickyMobileBar` "Apply now" and the "Total cost planner" link.

### 2.4 Conflicts / questions
1. **"Check loan eligibility" button** (D:45) links to the Apply form. There is no loan-eligibility backend, so the label is misleading and breaks the exact "Apply now" rule (constraint 1). Use "Apply now".
2. **"0% = no-cost EMI through university loan partners."** (D:34), "No-cost" slider label and FAQ "What is no-cost EMI?…" form a universal no-cost-EMI promise inside a tool. The owner retained no-cost EMI wording on existing locations (claims register "Owner-stated exception"). The Standard (§ line 81) says not to add new universal no-cost-EMI promises, and the current FAQ says "The default 0% is an interest-free scenario, not confirmation of an available offer." Recommend "0% models an interest-free plan; it does not confirm an offer." **Owner decision.**
3. **FAQ "every listed program offers semester-wise payment as well as full payment."** (D:81) is unverified. The total cost planner shows "Not published for this category", and the "Full payment" plan was removed (constraint 6). Do not use it. "A counsellor can check your eligibility" is a new loan-eligibility service claim.
4. **Tenure set to course duration** on `?id=` (D:65) conflates course length and loan term. The current FAQ explicitly separates them ("Course duration and loan repayment period are different"). The only tenures are 6–36 months, against the current 1–120.
5. **Down payment capped at 50% of fee and interest capped at 18%** are design assumptions. The current ranges are 0..fee and 0–50%. Narrowing is a product decision.
6. **The design has no applicant category / INR-only guard / manual fee entry / source and checked date / total-cost link.** All must stay (constraint 10, increment 82). The peer table must not mix categories.
7. **Hero copy:** "Estimate your monthly payment for any program before you speak to the university." is fine as copy, but "any program" is wrong for USD categories. The current H1 "Online degree EMI calculator" is SEO-tuned; the design's H1 is "EMI calculator". Pick one; recommend keeping the "Online degree" keyword.
8. **Header nav:** the design's "Tools" goes only to the EMI calculator (UVHeader:56). The site has 3 tools plus the recommender (C-site-header:22–25), so the Tools menu must list all of them.
9. **Ambiguity:** the min/max legend shows `inr(fee×0.5)` while the slider max is rounded to 5000, so they can disagree slightly.

---

## 3. Total cost planner (`/tools/total-cost`) and eligibility checker (`/tools/eligibility-checker`): no design exists

### 3.1 What exists (increments 82, 84, 86, 87)
- **Total cost planner** (C-total-cost-planner.tsx):
  - Hero: eyebrow "Free learner tool", H1 "Plan the full cost of an online degree".
  - Up to 3 courses. Each card has an applicant-category select, a status line ("Published category-specific tuition" / "Listed INR tuition; applicant category still needs confirmation" / "No published fee for this applicant category") and a `<dl>` (listed tuition, semester instalments, application fee "Not verified; confirm if payable", exam/resit/convocation/taxes "Not included here").
  - Each card also has a published other-charges note, a semester schedule `<details>`, a schedule-mismatch warning, source and checked date, a personal allowance input, a subtotal ("Tuition + your allowance"), and "View course facts" / "Apply now" (`data-open-lead` with category).
  - Shared: comparison banner (same category and currency only), print button, 4 FAQs + JSON-LD, `?course=&category=` prefill.
- **Eligibility checker** (C-eligibility-checker.tsx):
  - Form: program, applicant category, qualification route, recognised institution, marks % (hidden when no threshold), reserved category, education outside India, AIU equivalence.
  - Result card labels: "Matches published academic criteria" / "Needs university confirmation" / "Does not meet the selected published criteria", with reasons, rule source and date, and a final note. Actions: "Read course eligibility", "Apply now".
  - "Check the same answers against N other programs" grouping; an explainer section of 3 tiles; `?course=` prefill.
  - The page is **noindex** until a complete rule is published (0 published today; 7 prepared).

### 3.2 Changes required (restyle only; no behaviour change)
- **Hero:** use the EMI hero pattern (gradient, breadcrumb Home › Tools › {name}, H1 `clamp(30px,4.2vw,46px)`, paragraph). Keep the "Free learner tool" eyebrow, styled as the design eyebrow (12px/700/0.06em `#5B4CF0`).
- **Cards:** `.total-cost-card` and `.eligibility-form` take the design card style (1px `#E8E6F3` border, radius 18, padding 24, gap 24). Selects and inputs use the design input style (padding 13×14, radius 12, border `#E4E1F3`, 15px/600, min-height 48).
- **Total cost subtotal** `.total-cost-result`: use the navy result style from EMI (bg `#16133F`, white, value `clamp(28px,4vw,40px)`/800, labels `#B7B3E6`, note `#9C98CC`). The facts `<dl>` uses a `#F8F7FD` tile with radius 12 and padding 12 (the UVCard stat block style).
- **Status lines and eligibility outcomes:** use the How-we-verify pill style (11px/800/0.05em, padding 4×8, radius 6).
  - Success (`#E7F6EE`/`#12784B`) for "Published category-specific tuition" and "Matches published academic criteria".
  - Warning (`#FFF4E5`/`#A35A0B`) for "needs confirmation" states.
  - "Does not meet…" needs an error tint not defined in the design. Propose `#FEF3F2`/`#B42318`, matching the error colour; **needs design sign-off**.
- **Comparison banner and empty state:** the design dashed empty-state box (1.5px dashed `#D6D0FA`, radius 20) for "Start with a course"; the gradient CTA panel style (`linear-gradient(135deg,#F4F2FF,#EEEAFF)`, radius 18) for the comparison status.
- **Explainer tiles** (eligibility "What the result means"): How-we-verify process tile style (bg `#F8F7FD`, radius 16, padding 20).
- **Buttons:** "Apply now" primary, "View course facts" / "Read course eligibility" outline, "Print this fee view" outline. Min-height 44.
- Keep all copy, FAQ/JSON-LD and noindex logic.
- **Navigation:** the Tools menu must list EMI calculator, Total cost planner and Eligibility checker, plus the recommender (constraint 10). The design header (UVHeader:56) only has "Tools → EMI calculator".

### 3.3 Conflicts / questions
- The design omits both tools entirely, including in the header nav, footer and Guides "tool shortcut tiles" (README §11). Every tool list in the new design must add them.
- There is no design token for a negative or "does not meet" state, and no design for print styles.

---

## 4. Shortlist (`/shortlist`)

### 4.1 Design spec (D-Shortlist.dc.html)
- **Hero** (lines 19–28): inner-page gradient; inner padding `22px clamp(16px,3vw,32px) 28px`, flex wrap, space-between, `align-items:end`, gap 16.
  - Left: breadcrumb Home › "My shortlist"; H1 "My shortlist" (inner H1 style); paragraph 16px `#4A4867`. Paragraph text: if items exist, "{n} saved program(s) · saved on this device"; otherwise "Save programs to compare and revisit later."
  - Right (only when items exist): "Compare {min(3,n)}" (primary, padding 12×18, radius 11, `compare_arrows` 20px) → `Compare?ids=<first 3 saved>`, and "Clear all" (white, 1px `#E4E1F3` border, padding 11×16, 700, `#4A4867`). Clear all runs immediately, with no confirm or undo.
- **Main:** max 1240, padding `28px clamp(16px,3vw,32px) 0`, column, gap 32.
- **Has items:**
  - Grid `repeat(auto-fill, minmax(min(100%,300px),1fr))`, gap 14, of UVCards (the full Program card: icon, title, university, bookmark toggle, UG/PG badge, "UGC-entitled" pill, ★ rating (reviews), stat block Duration/Total fee/EMI from, specialisations link, "View details" / "+ Compare").
  - CTA panel: radius 18, `linear-gradient(135deg,#F4F2FF,#EEEAFF)`, padding 22, space-between, wraps. Contents: 52px white circle with `support_agent` 26px; "Get a second opinion on your shortlist" 17px/800; "A counsellor will review it against your career plan — free." 14px `#4A4867`; "Apply now" primary (padding 12×18, radius 11).
- **Empty:**
  - Dashed box: padding `clamp(32px,6vw,64px) 20px`, centred, 1.5px dashed `#D6D0FA`, radius 20, column, gap 12.
  - CSS illustration 180×130: a back card 120×84 radius 16 `#ECE9FE` rotated -8deg at (18,22); a front card 120×84 white with 1px `#E4E1F3` border, shadow `0 14px 30px -18px rgba(60,45,170,0.45)`, rotated 6deg at (44,14), containing 3 skeleton bars (8px, widths 60/85/45%, `#ECE9FE`/`#F3F1F9`); a 56px `#5B4CF0` circle with a white `bookmark` 28px at (62,64) with shadow `0 10px 24px -8px rgba(91,76,240,0.6)`; a 10px `#F0A30A` dot top-right and an 8px `#12A35C` dot bottom-left.
  - "Your shortlist is empty" 22px/800; "Tap the bookmark on any program to save it here. Your shortlist stays on this device." (max-width 420, `#4A4867`).
  - Buttons: "Browse programs" (primary) → Courses; "Find my fit" (outline) → Recommender.
  - Section "Popular with learners" (H2 `clamp(22px,3vw,28px)`): 3 UVCards `['mba-muj','mca-smu','bca-muj']`.
- **Live update:** the page listens to the `uv-store` event.
- **Accessibility missing:** "Clear all" is a div; nothing announces removals; there is no undo.

### 4.2 Current implementation (C-shortlist/page.tsx, C-shortlist-view.tsx)
- `noindex`. Hero "Your shortlist" with breadcrumb "Home > Shortlist".
- The view has a focusable H2 ("{n} saved programs" / "Your saved programs") and help text "Saved in this browser. Use the heart on a course to save it for later."
- **Remove with undo:** a status line "Removed X — UNI." and an "Undo removal" button, with focus returned to the heading.
- **Empty state:** `/states/shortlist-empty.webp` image, "Nothing saved yet", "Save courses while you explore, then return here to compare your options.", "Browse courses".
- **Toolbar:** "Choose two or three saved programs to compare."; "{k} of 3 selected · Listed tuition ₹min–₹max"; "Compare selected (k)" (`/compare?add=…`, enabled at 2–3) or disabled; "Browse more courses".
- **Cards:** logo, Remove, name, university, `<dl>` (Listed total tuition, Duration, EMI from), `<details>` "Ratings and placement figures" (Rating x / 5 · University placement rate y%), a "Select for comparison" checkbox (max 3), "View course" and "Apply now" (`data-open-lead`, `intent=enquire`).
- **Save control:** heart (`lucide Heart`), `SaveButton` with `aria-pressed`. Storage `uv_shortlist`.

### 4.3 Changes required (`src/app/shortlist/page.tsx`, `src/components/shortlist-view.tsx`, `save-button.tsx`, `.shortlist-*` CSS)
1. **Hero:** the design hero with H1 "My shortlist" (or keep "Your shortlist"; minor). Dynamic subtitle "{n} saved program(s) · saved on this device" or the empty subtitle. Because the hero is server-rendered but the count is client-side, render the subtitle inside the client component, or render the hero actions in `ShortlistView`.
2. **Hero actions:**
   - "Compare {k}" primary → `/compare?add=` (gated). Keep the current **selection model** (choose 2–3), or default the selection to the first 3 saved and let users change it; the design just takes the first 3.
   - "Clear all" as a `<button>` with confirm or undo (reuse the undo pattern) and a status announcement.
3. **Cards:** use the shared Program card from the Courses redesign. Additions needed for the shortlist:
   - A "Select for comparison" checkbox, because the card's "+ Compare" toggle writes a separate compare list and the shortlist's selection model differs. Agree one model with the Courses/Compare designer.
   - A Remove action (the bookmark toggle in the card works as remove; keep the undo).
   - "Apply now" (`data-open-lead`, `intent=enquire`).
   - Ratings: constraint 5 allows visible stars, but the current shortlist hides them in `<details>`. Choose one approach.
   - Replace the "UGC-entitled" pill with the per-program recognition chip.
4. **Save icon:** the design uses a **bookmark** (`bookmark`/`bookmark_added`, 36×36, saved bg `#ECE9FE`); the site uses a heart (`SaveButton`). Switch to lucide `Bookmark`/`BookmarkCheck` site-wide and update the copy "Use the heart…" → "Tap the bookmark…". Keep `aria-pressed` and `aria-label`.
5. **Second-opinion panel:** add it with reworded copy (4.4). "Apply now" → `/lead?intent=shortlist` (new intent; add it to `INTENT_LABELS` in the lead wizard modal) with `data-open-lead`. Optionally carry the selected course.
6. **Empty state:** use the design dashed box. For the illustration, either keep `/states/shortlist-empty.webp` (existing asset) or build the CSS illustration with `aria-hidden`; pick one. Copy: "Your shortlist is empty" + "Tap the bookmark on any program to save it here. Your shortlist stays on this device." Buttons "Browse programs" / "Find my fit" (→ `/recommender`).
7. **Suggested cards** under the empty state: optional, with relabelled heading (4.4). Course IDs `mba-muj`, `mca-smu` and `bca-muj` exist in the repo catalog.
8. Keep `noindex`, the loading state ("Loading your saved courses…") and focus management.

### 4.4 Conflicts / questions
1. **"Popular with learners"** (D:44) claims popularity with no defined basis. The Standard says to avoid "'most popular' without a defined basis". Rename it (e.g. "Programs to start with") or drop it.
2. **"A counsellor will review it against your career plan — free."** (D:33) is a new service promise. The owner confirmed free counselling and "Support till enrolment", but not "shortlist review". Needs owner OK.
3. **"Compare N" → `Compare?ids=first3`** (D:26, 58) conflicts with constraint 3 (gated, `/compare?add=`) and drops the current choose-2-or-3 selection.
4. **"Clear all" with no undo or confirmation** is a regression against the current undo pattern.
5. **The UVCard "+ Compare" toggle** introduces a second persisted compare list (`uv_compare`, default 3 MBAs) that does not exist today. That list must not bypass the gate.
6. **Heart vs bookmark:** the icon and copy change affects the header ("Saved courses") and every card. The header label "Shortlist (n)" vs the current "Saved courses" is an owner/copy decision.

---

## 5. Apply now: `/lead` page and the `data-open-lead` modal

### 5.1 Design spec (D-Apply.dc.html)
- **Page wrapper bg:** `radial-gradient(700px 360px at 90% 0%, #E6E1FF 0%, rgba(230,225,255,0) 70%), linear-gradient(180deg, #F7F5FF 0%, #FFFFFF 60%)`.
- **Main:** `max-width:1160px; padding: clamp(24px,5vw,56px) clamp(16px,3vw,32px) 0; display:grid; grid-template-columns: repeat(auto-fit, minmax(min(100%,420px),1fr)); gap: clamp(28px,5vw,56px); align-items:start`. Two columns from about 900px.
- **Left column** (lines 20–28):
  - Eyebrow "FREE COUNSELLING · NO OBLIGATION".
  - H1 (margin-top 12, `clamp(32px,4.6vw,50px)`, -0.04em, 800, line-height 1.05): "Start your application enquiry".
  - Paragraph (margin-top 14, 16px/1.6 `#4A4867`, max-width 480): "Share your contact details, then choose your course and optional university preference. Our team will follow up."
  - Perks (column, gap 16, margin-top 28). Each has a 44px white tile (radius 12, 1px `#E4E1F3` border, icon 22px `#5B4CF0`), title 800, and copy 14px/1.5 `#4A4867`:
    - `balance` "Unbiased by design" — "Every university pays us the same — advice follows your goals, not commissions."
    - `verified` "Approvals verified" — "UGC, NAAC and AICTE status re-checked every admission cycle."
    - `account_balance_wallet` "Loans & EMI help" — "Quick education loan facility and no-cost EMI options."
    - `support_agent` "Support till enrolment" — "Documents, loans and follow-ups handled until your LMS login arrives."
  - `tel:` link (margin-top 28, 16px/800, `call` icon): "Prefer to call? 1800-120-4050".
- **Right form card** (lines 29–46): white, 1px `#E4E1F3` border, radius 22, padding `clamp(20px,3vw,32px)`, shadow `0 30px 60px -40px rgba(60,45,170,0.5)`.
  - Title "Apply now" 20px/800; "Usually within one working day." 13px `#6F6D8C`, margin-top 4.
  - Fields (column, gap 14, margin-top 20). Each label is a column with gap 6, label text 13px/700. Inputs: padding 13×14, radius 11, 1px `#E4E1F3` border, 15px.
    - "Full name", placeholder "Your name".
    - "Mobile number": a joined control (1px `#E4E1F3` border, radius 11, overflow hidden). A static "+91" prefix (padding 13×12, bg `#F8F7FD`, 15px/700, right border), then an input with placeholder "10-digit mobile", `inputmode=numeric`, borderless. The value strips non-digits and is cut to 10.
    - "Email", placeholder "you@email.com". **Uncontrolled, never validated or submitted.**
    - Two-column sub-grid (`repeat(auto-fit,minmax(180px,1fr))`, gap 12): "Course" select (padding 13×12, options "Online {degree}" for every unique degree, **default "MBA"**), and "University (optional)" (label suffix 500 weight `#6F6D8C`) with options "No preference", "Manipal University Jaipur", "Sikkim Manipal University", "Amity University Online". The list is **not filtered by course** and is not reset when the course changes.
    - Consent label (flex, gap 10, 13px/1.5 `#4A4867`) with a checkbox (16×16, `accent-color:#5B4CF0`, margin-top 3), **checked by default** (`consent: true`, line 66): "I agree to be contacted by Unnati Vidya by phone, SMS, WhatsApp or email about my enquiry."
    - Error: 13px/600 `#B42318` (no `role="alert"`).
    - Submit: a `<div>` "Apply now", padding 15, radius 12, `#5B4CF0`, 800 16px, hover `#4A3BDB`.
    - Note: 12px `#8E8CA8`, `lock` icon 15px: "Submitting an enquiry does not confirm university admission."
- **Validation** (line 79), one message at a time, in order:
  - Empty name → "Please enter your name."
  - Phone length ≠ 10 → "Please enter a valid 10-digit mobile number."
  - Consent unchecked → "Please agree to be contacted."
  - Otherwise the success view shows. **There is no API call.**
- **Success** (lines 47–58): column, gap 12.
  - 60px circle bg `#E7F6EE` with `check_circle` 32px `#12925A`.
  - "Thanks, {firstName}. We'll call you soon." (24px/800); firstName defaults to "there".
  - "A counsellor will call +91 {phone} about the Online {course}{ at UNI}, usually within one working day." (`#4A4867`, line-height 1.6).
  - "WHAT HAPPENS NEXT" (13px/800 `#6F6D8C`, 0.04em) with 3 steps (28px numbered circles `#5B4CF0`, 14px text): "A counsellor calls to understand your goals"; "You get a shortlist with fees and eligibility"; "We help with documents, loans and admission".
  - Links: "Compare programs meanwhile" (outline) → Compare; "Back to home" (`#4A4867`).
- **URL params:** `?course=<id>` (sets the degree and the university from that course) or `?uni=<id>`.
- **Responsive:** single column below about 900px; the form card follows the left column, so on mobile the perks and phone line come **before** the form.
- **Accessibility present:** visible `<label>` wrapping of inputs, `inputmode`.
- **Accessibility missing:**
  - The submit is a `<div>`, not inside a `<form>`, so Enter doesn't submit.
  - Errors are not announced or linked to fields (`aria-describedby`, `aria-invalid`).
  - No `autocomplete` attributes, and the email is not `type=email`.
  - The 16px checkbox target is small (the label helps).
  - No focus move on success, and the "+91" prefix is not programmatically associated.

### 5.2 Current implementation (C-lead/page.tsx, C-lead-form.tsx, C-lead-wizard-modal.tsx, increment 80)
- **`/lead` page** (`noindex`):
  - Breadcrumb "Browse courses > Application enquiry"; H1 "Apply now" or "Apply now — {course — UNI | university}"; "Start with your contact details. Choose a course and optional university preference next."
  - Two-column `.application-layout`: the form panel and an aside "What happens next" with 1. "Save your details", 2. "Choose your preferences", 3. "Verify your email", the note "This is an enquiry to Unnati Vidya. University admission is confirmed separately by the university." and a privacy link.
  - Params: `course` (id or slug), `university` (id or slug), `intent`, `goal`, `category` (row-n, validated).
- **Modal** (`LeadWizardModal`):
  - Any `[data-open-lead]` click (capture phase) opens a portal dialog with `role=dialog`, `aria-modal`, a labelled title "Apply now — {context}" and the description "Start with your details. Choose your course next."
  - Focus trap, inert siblings, Escape to close, focus returned to the opener, body scroll lock.
  - `INTENT_LABELS` give per-entry titles.
- **Form** (`LeadForm`), 3 steps with a "1. Your details / 2. Course preferences / 3. Verify email" progress line and a focused H2:
  - **Step 1:** Name (2–150), Email (`type=email`), Phone with a country-code select (129 codes, flag emoji; the default comes from the timezone, `countryFromTimezone`). Phone pattern: 10 digits for +91, else 4–14.
    - **One required, initially unchecked consent:** `CONTACT_CONSENT_TEXT` = "I authorize Unnati Vidya and its authorised counselling associates to contact me about my application enquiry by email, SMS, WhatsApp, or voice call. I can withdraw this consent at any time." (version `application-follow-up-2026-10-08-v2`).
    - Help text "Your details will be saved when you continue." with a Privacy link.
    - "Continue", disabled until consent is ticked. Continue POSTs `/api/leads`, which saves the lead and dispatches `uv-lead-unlocked`.
  - **Step 2:** Course (required, "Select a course", grouped options from `leadCourseOptions`, about 17 labels); University (optional, "No preference", **filtered to universities that offer the chosen course** and reset when the course changes); an optional applicant fee category (total-cost / category context). Back and "Save and verify email" PATCH the lead, then send the OTP.
  - **Step 3:** email OTP (4–6 digits, `one-time-code`), "Verify email", "Resend code" with a 60s cooldown, "Edit contact details", "Edit preferences".
  - **Done:** `/states/application-enquiry-received.webp`, "Your details are received", "Your email is verified and comparison access is unlocked. Our team will follow up about your enquiry. This is not confirmation of university admission.", "Return to comparison" (back to the `/compare` URL) and "Browse courses".
  - Errors in `role=alert` and notices in `role=status`. Idempotent submission key + bearer token. Analytics (`wizard_open`, `lead_contact_saved`, `otp_sent`, `otp_verified`, …).
- **CSS:** `.application-*`, `.lead-*`, `.lead-modal*` (globals.css:2871–2963, 3552–3562, 3683–3688, 3999–4010).

### 5.3 Changes required (`src/app/lead/page.tsx`, `src/components/lead-form.tsx`, `lead-wizard-modal.tsx`, `.application-*` / `.lead-*` CSS)
1. **`/lead` page:** adopt the design two-column grid (1160px, `auto-fit minmax(min(100%,420px),1fr)`) and the page gradient.
   - **Left:** eyebrow; H1 "Start your application enquiry" (or keep "Apply now — {context}" as the H1 and show the context as a chip; see 5.4); the design paragraph, whose wording already matches contact-first; perks with **owner-approved wording** (5.4); **no phone line**. Replace it with "Prefer email? admin@unnatividya.com" (mailto) only if the owner wants it.
   - Keep the current "What happens next" explanation, adapted to the 3 real steps (save details → preferences → verify email), styled with the design numbered-circle list (28px `#5B4CF0`).
   - **Right:** design form card (radius 22, shadow) containing the unchanged `LeadFormLoader`. Card title: the current step title ("Start your application enquiry" / "Choose your preferences" / "Verify your email"), or "Apply now" plus the step label. Drop "Usually within one working day." unless the owner confirms the SLA.
   - Mobile order: consider showing the form first on small screens (CSS `order`) so it isn't below 4 perks. Design decision; flag.
2. **Step indicator:** replace the text "1. Your details" with the design-style 3-segment progress bars (6px, `#5B4CF0`/`#E4E1F3`, gap 6) plus the text "Step n of 3 · Your details" (keep the text for screen readers).
3. **Field styling:**
   - Labels 13px/700 with gap 6; inputs padding 13×14, radius 11, border `#E4E1F3`, 15px, min-height 48; field gap 14.
   - Course + University side by side in a `repeat(auto-fit,minmax(180px,1fr))` grid **on step 2**.
   - Phone row: style the country-code `<select>` like the design's `#F8F7FD` "+91" prefix segment, joined to the input in one bordered control (`.lead-phone-row`). Keep the 129-code select and the timezone default.
   - Add placeholders: "Your name", "you@email.com", and "10-digit mobile" only when the dial code is +91, else "Phone number".
4. **Consent:** keep the current text, required and **initially unchecked**, styled as the design consent row (13px/1.5 `#4A4867`, checkbox 16–18px, `accent-color #5B4CF0`). Keep "Continue" disabled until checked, or allow submission and show the design-style error "Please agree to be contacted." in `#B42318` with `role=alert`. The current disabled-button approach is fine; an error message is more discoverable.
5. **Errors:** use `#B42318` 13px/600 for `.lead-error` (currently `#a21c1c`) and keep `role=alert`. Optionally add the per-field messages from the design wording: "Please enter your name.", and for phone "Please enter a valid phone number." (not "10-digit" unless +91).
6. **Primary buttons:** padding 15, radius 12, 800 16px, full width. The in-flow labels stay "Continue" / "Save and verify email" / "Verify email" (Standard §5 allows these).
7. **Lock note:** add "Submitting an enquiry does not confirm university admission." (12px `#8E8CA8` with a lock icon) under step 1. It matches existing copy.
8. **Success state:**
   - Design layout: 60px green check circle (or keep the existing `/states/application-enquiry-received.webp`; pick one) and a 24px/800 heading.
   - **Keep the truthful current copy:** "Your details are received" / "Your email is verified and comparison access is unlocked…".
   - "What happens next" list with only owner-confirmed steps (5.4).
   - Buttons: "Return to comparison" (if `returnTo` is `/compare`) or "Compare programs" (outline), "Browse courses" / "Back to home".
9. **Modal:** apply the same card styling to `.lead-modal` (radius 22, padding `clamp(20px,3vw,32px)`, design shadow). Keep all focus-trap and inert behaviour. The modal title stays "Apply now — {context}".
10. **Params:** the design uses `?uni=`; the repo uses `?university=`. Keep `university` and optionally accept `uni` as an alias in `LeadPage` and the modal's param parsing.
11. **Course select:** keep the current required "Select a course" default (unless a context preselects one) and the university filtering and reset (Standard §5).

### 5.4 Conflicts / questions
1. **Single-step form vs contact-first 3-step + OTP** (constraint 1). The design (D:33–45, 79) puts name, phone, email, course, university and consent on one form with no API, no email verification and no lead save on step 1. Keep the 3-step flow and use the design only for visual styling. The design's own paragraph (D:23) already describes a two-stage flow.
2. **+91-only 10-digit phone** (D:35, 77) conflicts with international codes for NRI learners (constraint 1). Keep the country select.
3. **Consent checked by default** (D:66 `consent: true`) conflicts with "ONE required, initially UNCHECKED consent", the DPDP "clear affirmative action" (increment 80) and the version `application-follow-up-2026-10-08-v2`. **Consent wording:** the design's "I agree to be contacted by Unnati Vidya by phone, SMS, WhatsApp or email about my enquiry." differs from the owner-approved text (it omits "authorised counselling associates" and withdrawal). Do not use the design wording.
4. **No email verification step** in the design; the OTP step must stay (it also unlocks compare).
5. **Email optional, unvalidated and unsubmitted** in the design (D:36); it is required in the current flow.
6. **Course defaulting to "MBA"** (D:66) would silently preselect a course; the current flow requires an explicit choice. The **university list is not filtered by course** in the design, which allows impossible combinations such as MSc Data Science at MUJ.
7. **Success copy "Thanks, {name}. We'll call you soon."** and "A counsellor will call +91 {phone} … usually within one working day." (D:50–51):
   - Implies a phone call and an SLA that are not confirmed.
   - Ignores email verification and the real backend state (the Standard says success copy reflects actual backend state).
   - Hard-codes +91.
   - Use the current copy.
8. **"What happens next" steps** (D:81): "A counsellor calls to understand your goals" (call promise), "You get a shortlist with fees and eligibility" (new deliverable not confirmed) and "We help with documents, loans and admission". The last is fine because the owner confirmed documents, loans and follow-ups (claims register "Support till enrolment").
9. **Perks copy** (D:80):
   - "Unbiased by design — Every university pays us the same…" was **removed by the owner** and replaced with "No hidden charges" (§11 Q3, claims register).
   - "Approvals verified — … re-checked every admission cycle" was **reworded by the owner** to "Approvals you can check: we link each program to the official UGC-DEB list and show when we last checked it." (§11 Q11).
   - "Loans & EMI help — Quick education loan facility and no-cost EMI options": loans help is confirmed and no-cost EMI is an owner-stated claim, but "Quick" is unconfirmed.
   - "Support till enrolment" is OK (owner-stated).
10. **"FREE COUNSELLING · NO OBLIGATION"** eyebrow: free counselling is owner-stated (claims register); "No obligation" is new wording that needs an owner OK.
11. **"Prefer to call? 1800-120-4050"** (D:27) conflicts with constraint 2. Remove it.
12. **"Usually within one working day."** (D:32): an unconfirmed SLA.
13. **Page vs modal:** the design is a standalone page ("Apply.dc.html"). The site primarily uses the modal (`data-open-lead`) with `/lead` as the no-JS fallback; keep both. There is no design for the modal chrome (close button, title).
14. **Ambiguity:** should `/lead` keep the contextual H1 "Apply now — {course}"? The design's static H1 loses the context. Proposal: H1 "Start your application enquiry" plus a context chip "For: Online MBA — MUJ".

---

## 6. About (`/about`)

### 6.1 Design spec (D-About.dc.html)
- **Hero** (lines 18–24): gradient (600×320 at 85% 0%), 1px `#EEECF8` bottom border; inner 980px, padding `clamp(32px,6vw,72px) clamp(16px,3vw,32px) clamp(32px,5vw,56px)`.
  - Eyebrow "ABOUT UNNATI VIDYA".
  - H1 (margin-top 14, `clamp(34px,5vw,58px)`, -0.04em, 800, line-height 1.04, `text-wrap:balance`): "India's unbiased marketplace for <span #5B4CF0>UGC-entitled online degrees.</span>"
  - Paragraph (margin-top 18, 18px/1.6 `#4A4867`, max-width 680): "Compare, get counselled, enrol — all free. We help working professionals and students choose an online degree with verified data instead of sales pitches."
  - No breadcrumb.
- **Main:** max 1240, padding `48px clamp(16px,3vw,32px) 0`, column, gap 56.
- **Value cards** (lines 26–30): grid `auto-fit minmax(min(100%,280px),1fr)`, gap 16. Each card has padding 24, 1px `#E8E6F3` border, radius 18; icon 32px `#5B4CF0`; title 19px/800 (margin-top 12); paragraph (margin-top 8, `#4A4867`, line-height 1.6):
  - `balance` "Unbiased by design" — "Every university pays us the same — advice follows your goals, not commissions."
  - `fact_check` "Approvals verified" — "UGC, NAAC and AICTE status re-checked every admission cycle."
  - `support_agent` "Support till enrolment" — "Documents, loans and follow-ups handled until your LMS login arrives."
- **How it works + stats** (lines 31–48): grid `auto-fit minmax(min(100%,380px),1fr)`, gap 40, centred.
  - Left: H2 `clamp(24px,3vw,32px)`/800/-0.025em "How UnnatiVidya works". Steps (column, gap 18, margin-top 20), each a 34px `#5B4CF0` numbered circle (white 800), title 800 and copy (`#4A4867`, 1.55):
    1. "Compare side by side" — "Fees, EMIs, curriculum, approvals and placement records — in one honest table."
    2. "Talk to a real counsellor" — "A free 1-on-1 call to sanity-check your shortlist against your career plan."
    3. "Enrol with support" — "We handle documents, loans and admission follow-ups until your LMS login arrives."
  - Right: a 2×3 stat grid (`repeat(2,1fr)`, gap 1px on `#E8E6F3` to form hairlines, 1px border, radius 18, overflow hidden). Cells are white with padding 22, value 28px/800 and label 13px `#6F6D8C`:
    - "30+" comparison factors
    - "₹0 extra" lowest-fee guarantee
    - "Loans" quick education loan facility
    - "Support" post-admission, till graduation
    - "Jobs" job + internship portal
    - "Community" exclusive learner groups
- **"Talk to us" navy panel** (lines 49–52): radius 22, `#16133F`, white, padding `clamp(24px,4vw,44px)`, grid `auto-fit minmax(min(100%,300px),1fr)`, gap 24.
  - "Talk to us" `clamp(22px,3vw,30px)`/800, then "Counselling is free. Call, or request a callback and we'll reach you within one working day." (`#C3C0E6`, 1.6).
  - Buttons (right-aligned, wrap): "Call 1800-120-4050" (white bg, navy 800, `tel:`) and "Request a callback" (ghost, `rgba(255,255,255,0.3)` border) → Apply.
  - The README §16–18 describes this as "Call + **Apply now**", but the file has "Request a callback". The two disagree.
- **Responsive:** auto-fit grids; the stat grid stays 2 columns at all widths (each cell is about 160px at 360px).
- **Accessibility:** mostly static. The icon ligatures need `aria-hidden`. No landmarks issue.

### 6.2 Current implementation (C-about/page.tsx)
- `LegalPageLayout` (breadcrumb, H1 "About Unnati Vidya", "Last updated 5 October 2026", an "On this page" `<details>` TOC, and a right rail with email + Apply now + Related links). Sections:
  - Intro: "information and enquiry platform; the university decides admission and awards the degree".
  - "Explore your options": links to courses, shortlist, recommender, EMI.
  - "How an enquiry works": the 3 real steps and "Apply now" (`data-open-lead`, `intent=about`).
  - "Before making a decision": check official sources; ratings, reviews and placement are not independently verified; Content Team byline link; guides.
  - "Your information and policies": privacy, terms and refund links.
  - "**Contact us**": the owner address "A-116, URBTECH Trade Centre, Noida, Uttar Pradesh 201304" and `admin@unnatividya.com` (owner decision §11 Q12; also used in Organization JSON-LD).

### 6.3 Changes required (`src/app/about/page.tsx`; stop using `LegalPageLayout` here, or give it a hero variant)
1. **Hero:** the design layout and styles (980px, eyebrow, big H1, 18px paragraph). Copy needs owner approval (6.4). Add a breadcrumb for consistency (all other inner pages have one) or confirm omitting it.
2. **Value cards:** the design card style with owner-approved copy: "No hidden charges" ("Counselling is free for learners, and Unnati Vidya adds no charge on top of the university fee."), "Approvals you can check" ("We link each program to the official UGC-DEB list and show when we last checked it.") and "Support till enrolment" (unchanged). These strings exist on the homepage (C-page.tsx:396–398).
3. **How it works:** the design layout. Reword step 1: drop "placement records" and "honest", e.g. "Fees, EMIs, curriculum and approvals, with source links." Check step 2's "call" wording with the owner. Step 3 is fine.
4. **Stat grid:** keep only owner-stated items (6.4). Candidates: "10k+ learners guided" (owner), "₹0 extra · lowest-fee guarantee" (owner), "No hidden charges", "Support till enrolment", "{courses.length} programs" and "3 universities" (live catalog counts). Avoid an odd count in a 2-column grid: use 4 or 6.
5. **"Talk to us" panel:** navy, as designed. Copy: "Counselling is free. Apply now and our team will contact you about your enquiry, or email admin@unnatividya.com." Buttons: **"Apply now"** (white, `data-open-lead`, `/lead?intent=about`) and "Email us" (ghost, `mailto:admin@unnatividya.com`). No phone, and no "within one working day".
6. **Add a "Contact us" block** (missing from the design): the owner address and email in an `<address>`, e.g. as a card beside or under the navy panel. It is required by owner decision Q12.
7. **Keep the current informational content** missing from the design: "How an enquiry works" (3 real steps, "not a university application"); "Before making a decision" (source checks; ratings, reviews and placements unverified; Content Team byline); policy links. Render it as a text section in the 880–980px column after the stats, styled per the Article/Legal body (16px/1.75).
8. "Last updated" can move into the footer of the page or stay under the H1. It is not in the design.

### 6.4 Conflicts / questions
1. **Stat grid** (D:41–46):
   - "Jobs — job + internship portal" and "Community — exclusive learner groups" are named in constraint 9 as claims not to add without owner confirmation. They appear in the current homepage factor grid (C-page.tsx:375–382) but are **not in the claims register**.
   - "Support — post-admission, till graduation" contradicts the owner-confirmed "till enrolment".
   - "30+ comparison factors" is unsubstantiated; the compare table has about 11–12 rows.
   - "Loans — quick education loan facility": loans help is confirmed, "quick" is not.
   - "₹0 extra lowest-fee guarantee" is owner-stated and OK.
   - **Ask the owner** whether Jobs, Community, "till graduation" and 30+ stay anywhere (homepage included).
2. **Hero H1 "India's unbiased marketplace…"** and "with verified data instead of sales pitches" (D:21–22):
   - "Unbiased" is the impartiality claim the owner replaced ("Every university pays us the same" → "No hidden charges"). The Standard bans "unsubstantiated impartiality claims".
   - "verified data" contradicts How we verify ("Catalog verification is ongoing").
   - "UGC-entitled online degrees" as a blanket claim conflicts with per-program recognition (constraint 8).
   - "Compare, get counselled, enrol — all free": free counselling is owner-stated; "enrol free" is ambiguous, since university fees apply.
   - The same tagline is in the design footer (README §2).
3. **"Unbiased by design" and "Approvals verified" cards**: owner-replaced wording (§11 Q3, Q11).
4. **"Call 1800-120-4050"** and "Request a callback" (D:51): no phone (constraint 2), and the CTA must read "Apply now" (constraint 1). The README itself says "Apply now", so the design is inconsistent.
5. **"within one working day"** (D:50): an unconfirmed SLA.
6. **The design drops the Contact section** (address/email), which is an owner requirement and is referenced by Organization structured data. It also drops the enquiry explainer and the "before making a decision" caveats.
7. **"Talk to a real counsellor — A free 1-on-1 call"**: matches existing homepage copy (C-page.tsx:362), but frames contact as a call. Confirm.

---

## 7. How we verify (`/how-we-verify`)

### 7.1 Design spec (D-HowWeVerify.dc.html)
- **Hero** (lines 18–24): gradient (600×320 at 85% 0%); inner 980px, padding `clamp(28px,5vw,56px) clamp(16px,3vw,32px) 40px`.
  - Breadcrumb: Home › "How we verify our data".
  - H1 (margin-top 16, `clamp(32px,4.6vw,50px)`, -0.04em, 800, line-height 1.06): "How we verify our data".
  - Paragraph (margin-top 14, 17px/1.6, max-width 680): "We check every fee, approval and admission date against the university's own published pages each admission cycle, and flag anything we can't independently confirm."
- **Main:** 980px, padding `40px clamp(16px,3vw,32px) 0`, column, gap 44. Section H2s are 24px/800/-0.02em.
- **"Our process"** (H2 margin-bottom 18): grid `auto-fit minmax(min(100%,210px),1fr)`, gap 12 (4 across at 980px). Tiles have padding 20, radius 16, bg `#F8F7FD`; icon 28px `#5B4CF0`; title 800 (margin-top 10); copy 14px/1.55 `#4A4867` (margin-top 4):
  - `travel_explore` "1. Collect" — "Fees, eligibility and approvals from official university pages."
  - `rule` "2. Cross-check" — "Every program against the UGC-DEB entitlement list."
  - `flag` "3. Flag" — "Anything we can't confirm is labelled on the page."
  - `update` "4. Re-check" — "Every admission cycle, and whenever a university updates its pages."
- **"What the labels mean"** (H2 margin-bottom 14): a bordered list (1px `#E8E6F3`, radius 16, overflow hidden). Rows: flex, gap 14, padding 16×18, `#F3F2F9` dividers. Each row has a label pill (11px/800/0.05em, padding 4×8, radius 6, nowrap) and a description (14px/1.55 `#2B2950`):
  - "SOURCE VERIFIED" (`#E7F6EE`/`#12784B`) — "Matches the university's current official page for this admission cycle."
  - "CONFIRM WITH COUNSELLOR" (`#FFF4E5`/`#A35A0B`) — "Published, but varies by case or session — confirm before applying."
  - "BEING RE-CHECKED" (`#ECE9FE`/`#5B4CF0`) — "We're reviewing this for the upcoming cycle. Older data shown until confirmed."
- **"Sources we use"**: grid `auto-fit minmax(min(100%,260px),1fr)`, gap 10. Link cards: space-between, padding 14×16, 1px `#E8E6F3` border, radius 12, 700 `#16133F`, trailing `open_in_new` `#5B4CF0`:
  - "onlinemanipal.com" → `https://www.onlinemanipal.com/all-courses`
  - "UGC-DEB entitlement list" → `https://deb.ugc.ac.in`
  - "amityonline.com" → `https://amityonline.com`
  - They open in the same tab, with no `target`/`rel`.
- **CTA panel** (lines 51–54): radius 18, `linear-gradient(135deg,#F4F2FF,#EEEAFF)`, padding 24, space-between, wraps.
  - "Spotted something out of date?" 18px/800, then "Tell us and we'll re-check it against the source." 14px `#4A4867`.
  - "Report an error" primary → **Apply.dc.html**.
- **Accessibility:** static content. External links lack a new-tab or external indication for screen readers (the icon only), and the icons need `aria-hidden`.

### 7.2 Current implementation (C-how-we-verify/page.tsx)
- `LegalPageLayout` (TOC, rail with email + Apply now + Related), "Last updated 3 October 2026", Breadcrumb + FAQPage JSON-LD. Sections:
  - **"Where the review stands"**: a note box, "Catalog verification is ongoing… field-level verification and publication review are not complete…", and "Do not interpret a listing, badge or last-updated date as confirmation that every detail is verified."
  - **"What we check"**: 4 cards, "Fees and fee categories", "Eligibility and curriculum", "Recognition and intake", "Review before publication", each with honest standards copy.
  - **"Dates, ratings and outcomes"**: ratings, reviews, salary and placement are unverified.
  - **"Report a correction"**: email admin@unnatividya.com with the page link, the wrong detail and the official source; no personal documents; review before publication.
  - **"Common questions"**: 5 FAQs in `<details>`.

### 7.3 Changes required (`src/app/how-we-verify/page.tsx`)
1. Design hero (980px, breadcrumb, H1, 17px paragraph) with **honest copy**, e.g. the current intro: "Use Unnati Vidya to explore your options, then check the source information before deciding. This page explains our review process and its current limits."
2. Add the **"Where the review stands"** status note directly under the hero, as a warning-tinted panel (`#FFF4E5` bg, `#A35A0B` heading, radius 16, padding 20). It must stay.
3. **"Our process"** tiles in the design style. Either:
   - (a) map the 4 current "What we check" items into tiles (icons `Banknote`, `ListChecks`, `BadgeCheck`, `ClipboardCheck`), keeping the full copy; or
   - (b) use the design's Collect / Cross-check / Flag / Re-check with corrected copy. "Re-check — every admission cycle and weekly source checks" is only true once the weekly checker is deployed (increment 85: not yet installed).
   - Add a lead-in line: "These are the standards for reviewing a claim, not a declaration that every check has passed."
4. **"What the labels mean":** design list style, but list the **labels the site actually renders**:
   - "SOURCE VERIFIED" (course eligibility, C-courses/[slug]/page.tsx:265).
   - "Confirm with the university" (constraint 6; replaces "CONFIRM WITH COUNSELLOR").
   - The recognition chip "program status being re-checked for 2026-27" (C-lib/program-facts.ts:71).
   - The tools' labels ("Needs university confirmation", "Listed INR tuition; applicant category still needs confirmation").
   - Reconcile the pill colours with the site-wide status token decision.
5. **"Dates, ratings and outcomes":** keep it as a short text section (required honesty about ratings and placement, constraints 5 and 7).
6. **"Sources we use":** the design link cards with `target="_blank" rel="noopener noreferrer"` and sr-only "(opens in a new tab)". Use the hosts in the catalog: onlinemanipal.com (MUJ and SMU, 237 refs), amityonline.com (97), deb.ugc.ac.in (56), and add nirfindia.org (NIRF card, increment 80).
7. **CTA panel:** "Spotted something out of date?" with the button **"Email a correction"** → `mailto:admin@unnatividya.com?subject=Correction%20report`. Keep the current "Report a correction" instructions (page link, detail, source; no personal documents) inside the panel or just above it.
8. FAQ: keep the 5 current FAQs + JSON-LD, restyled.

### 7.4 Conflicts / questions
1. **Hero claim** "We check every fee, approval and admission date … each admission cycle, and flag anything we can't independently confirm." (D:22) and FAQ_GENERAL "How do you verify…" (uv-data.js:70) contradict the current honest status ("Catalog verification is ongoing", increments 74–87). This is a material trust risk. Do not use it.
2. **"2. Cross-check — Every program against the UGC-DEB entitlement list."** was done for 2026-27 (prepared and owner-attributed for 5 Amity programs) but is not published everywhere. **"4. Re-check — Every admission cycle"**: the weekly checker exists but is not deployed. Wording must reflect that.
3. **"CONFIRM WITH COUNSELLOR"** label (D:39) conflicts with the site's "Confirm with the university" wording (constraint 6). "BEING RE-CHECKED — … Older data shown until confirmed": check that "older data shown" is accurate per field.
4. **"Report an error" → Apply form** (D:53). The README asks where this CTA should go. The lead form creates a sales lead with follow-up consent, which is the wrong channel for corrections. Current behaviour is email to admin@unnatividya.com. Recommend mailto. (A dedicated correction form would need a backend and owner OK.)
5. The design drops the "Where the review stands", ratings/outcomes caveat, FAQ and Content Team byline link. All of these are current trust content.
6. "Sources we use" lists only 3. SMU's official pages are on onlinemanipal.com, which is fine but not obvious; consider labelling it "onlinemanipal.com (MUJ and SMU)".

---

## 8. Legal: Privacy, Terms, Refund policy (`/privacy`, `/terms`, `/refund-policy`)

### 8.1 Design spec (D-Legal.dc.html)
- **One page with `?tab=privacy|terms|refund`** (default privacy; an unknown tab falls back to privacy). Tabs switch client-side state; **the URL does not update** on click.
- **Hero** (lines 18–25): `linear-gradient(180deg,#F7F5FF,#FBFAFF)` (no radial), 1px `#EEECF8` bottom border; inner 980px, padding `28px clamp(16px,3vw,32px) 0`.
  - Breadcrumb: Home › {title}.
  - H1 (margin-top 14, `clamp(30px,4.2vw,44px)`, -0.035em, 800): {title} ("Privacy policy" / "Terms of use" / "Refund policy").
  - "Last updated October 2026" (13px `#6F6D8C`, margin-top 6).
  - Tabs (margin-top 20, flex, gap 24, `overflow-x:auto`): padding 12×0, 700 14px, nowrap. Active tab colour `#5B4CF0` with a 2px `#5B4CF0` bottom border; inactive `#4A4867` with a transparent border. Labels "Privacy", "Terms", "Refund policy".
- **Main:** 980px, padding `32px clamp(16px,3vw,32px) 0`, flex wrap, gap 32, `align-items:flex-start`.
  - **Left nav:** `flex:1 1 200px; max-width:240px; position:sticky; top:92px`; column, gap 4, 14px. Items are `<div onClick>` with padding 6×0, `#4A4867` 600, hover `#5B4CF0`, each scrolling smoothly to the section (offset −90px).
  - **Content:** `flex:999 1 480px`. Each section has `margin-bottom:32px`, H2 20px/800, and a paragraph (margin-top 10, 15px/1.75 `#2B2950`).
  - **Footer box:** padding 18, radius 14, bg `#F8F7FD`, 14px `#4A4867`: "Questions about this policy? Call **1800-120-4050**." (`tel:` link 700).
- **Copy (placeholder, D:46–48; the README says it "needs legal review"):**
  - **Privacy:** "What we collect" (name, mobile, email, course preferences, usage data) / "How we use it" / "Who we share it with" ("Only the university or loan partner relevant to your enquiry, and service providers…") / "Your choices" ("…delete your data at any time by calling us.") / "Your shortlist" ("stored on your device, not on our servers").
  - **Terms:** Using the site / Accuracy ("We verify data against official sources each cycle…") / Enquiries / Third-party links / Changes.
  - **Refund:** Our services are free / University fees / Application fees ("usually non-refundable") / Loans & EMI / "Need help?" ("We can help you raise a refund request with the university.").
- **Responsive:** below about 752px (200 + 32 + 480 + paddings) the nav wraps above the content. Because it stays `position:sticky; top:92px` inside the wrapping flex container, it will stick and overlap the content while scrolling on mobile. That is a layout bug to avoid.
- **Accessibility missing:**
  - Tabs are divs (no `role=tablist`/`tab`, no keyboard support, not links).
  - The section nav is divs, not anchor links.
  - No `aria-current`.
  - Smooth scroll has no reduced-motion guard.

### 8.2 Current implementation
- **Three separate SEO URLs** with canonical metadata: `/privacy` ("Privacy Policy", last updated 8 October 2026), `/terms` ("Terms of Use", 12 August 2026), `/refund-policy` ("Refund and Cancellation Policy", 12 August 2026).
- **`LegalPageLayout`** (C-legal-page-layout.tsx):
  - Breadcrumb, focusable H1 `#policy-start`, "Last updated {date} · Unnati Vidya".
  - "On this page" `<details>` TOC with anchor links (44px targets), content, "Back to top".
  - Right rail (`.uv-rail`): "Questions about any of this?" with the admin@unnatividya.com email and an "Apply now" button (`intent=request-callback`), plus a "Related" nav (Privacy, Terms, Refund, How we verify, Guides, Courses).
  - Also used by About and How we verify.
- **Privacy content** (C-privacy:13–67) covers:
  - Collection (contact, **OTP/consent status**, **UTM/attribution**, CMS activity).
  - Use (enquiry follow-up under the Apply now consent wording; CRM push only when enabled).
  - A **"Newsletter and WhatsApp updates" section with `id="marketing"`** (separate optional consent, double opt-in, unsubscribe; linked from `NewsletterSignup` as `/privacy#marketing`).
  - Sharing ("We do not sell learner enquiry data").
  - Retention and control (deletion **within seven working days** by email).
- **Terms and Refund:** substantive owner-reviewed copy, e.g. "Where our page and the university's own page disagree, the university's page governs", loan refunds routed to the lender in 15–30 working days, and the CRM handoff.

### 8.3 Changes required (`src/components/legal-page-layout.tsx`, the three pages, `.policy-*` CSS)
1. **Keep 3 URLs.** Implement the design "tabs" as a `<nav aria-label="Policies">` of real `<Link>`s to `/privacy`, `/terms` and `/refund-policy`, styled as underline tabs, with `aria-current="page"` on the active one. No `?tab=` param. Footer links stay on the 3 URLs. Optionally add redirects from a `/legal?tab=x` URL if any design link survives, though it is not needed.
2. **Hero band:** a linear gradient band with breadcrumb, H1 (design size), "Last updated {per-page date}" and the tab nav. `LegalPageLayout` gains a `variant="policy"` for this. About and How we verify get their own hero layouts (sections 6 and 7), so `LegalPageLayout` may become policy-only.
3. **Body:** 980px; a left section nav (`flex:1 1 200px; max-width:240px`) as an `<nav aria-label="On this page">` of `<a href="#id">` anchors (min-height 44 for targets; the design's 6px padding is too small). It is sticky **only at ≥ about 768px**. Below that, keep the current collapsible "On this page" `<details>`. Use `scroll-margin-top` (currently 100px; the design offset is 90) instead of JS `scrollTo`, and smooth scrolling only without reduced motion.
4. **Section typography:** H2 20px/800, paragraphs 15px/1.75 `#2B2950`. The current Privacy uses `<ul>` lists; keep the lists with the same type scale.
5. **Footer box:** "Questions about this policy? Email **admin@unnatividya.com**." in the `#F8F7FD` radius-14 box. Decide whether to keep the rail's "Apply now" and "Related" links (8.4); if the rail is dropped, put the Related links in the footer box or below it.
6. Keep all current copy, the `#marketing` anchor, per-page dates and canonical metadata.

### 8.4 Conflicts / questions
1. **One page with `?tab=`** (D:43, README) conflicts with the separate SEO URLs `/privacy`, `/terms` and `/refund-policy` (constraint 10). Use links styled as tabs.
2. **The placeholder copy must not replace the current reviewed copy.** It omits OTP and consent records, UTM attribution, the marketing/newsletter section (`#marketing` is linked from the newsletter form), deletion within 7 working days, CRM handoff, "we do not sell", the source-of-truth clause and loan-refund routing.
   - It adds risky statements: privacy "Who we share it with — … loan partner" (sharing not covered by the current policy), "delete your data … by calling us" (no phone), terms "We verify data against official sources each cycle" (not true yet), and refund "We can help you raise a refund request with the university" (new service claim).
3. **"Questions about this policy? Call 1800-120-4050."** (D:34) conflicts with constraint 2.
4. **The single "Last updated October 2026"** is wrong for Terms and Refund (12 August 2026); keep per-page dates.
5. **The design drops the rail** (email, Apply now, Related links). Does the owner want an Apply now CTA on policy pages? It is useful but not required.
6. **Sticky section nav on mobile** overlaps the content when wrapped (layout bug noted in 8.1).

---

## 9. Newsletter (`/newsletter/confirm`, `/newsletter/unsubscribe`, `NewsletterSignup`): no design

- **Exists:** double opt-in confirm page (a POST button, so link scanners can't subscribe; states "confirmed", "invalid", "try-later" and "missing token"); unsubscribe page (POST; states "done" and "invalid"); `NewsletterSignup` (footer + article variants, honeypot field, `/privacy#marketing` link, copy "Get our newsletter about online degrees, fees and admission dates. We'll email you a link to confirm. Unsubscribe any time."). Both pages are noindex.
- **Design:** no newsletter anywhere. The UVFooter has no sign-up, and the Article design was not checked here for one. Constraint 10 requires keeping the sign-up.
- **Changes:**
  - Restyle the confirm and unsubscribe pages with the inner-page hero pattern (gradient band, H1 `clamp(30px,4.2vw,46px)`).
  - Put the message and button in a centred card (white, 1px `#E8E6F3` border, radius 18, padding 24, max-width 640), using the design primary button. Use the Apply-success style green check circle for "You're subscribed" and "You're unsubscribed".
  - Keep the copy and POST forms.
  - **Footer sign-up:** the design footer (`#1A1646`) needs a sign-up row, e.g. above the bottom bar: input with `rgba(255,255,255,0.08)` bg, `rgba(255,255,255,0.2)` border, radius 11, white text, placeholder `#A9A6D6`; a white "Subscribe" button with navy text; help text `#C3C0E6`. Coordinate with the footer redesign.
- **Conflict:** the design omits a required feature (constraint 10). There is also no design for the article-variant sign-up block.

---

## 10. MobilePreview (`MobilePreview.dc.html`): reference only
- A canvas board (bg `#EEECF5`, padding 48, gap 40) of 18 iframes at 390×844, each inside a 414×868 navy phone frame (radius 52, inner radius 40, shadow `0 30px 60px -30px rgba(22,19,63,0.6)`). It is labelled "UNNATI VIDYA REDESIGN / Mobile — all page types" with the page list (D-MobilePreview:38). Relevant entries: "Find my fit — quiz", "Find my fit — results" (`?results=1`), "EMI calculator", "Shortlist", "Apply now", "About", "How we verify", "Legal" (`?tab=privacy`).
- Not a production page; do not port it. Use it as the visual QA target at 390px. The repo's existing QA convention also checks 320, 768 and 1280px, per increments 82–86.
- Mobile behaviours confirmed by the board:
  - Recommender: the journey aside stacks above the results.
  - EMI: cards stack, and the peer table scrolls horizontally (min-width 520).
  - Apply: the perks and phone line come before the form, so the form sits far down on mobile.
  - Legal: the tabs scroll horizontally, and the section nav sits above the content (and sticks; see 8.1).

---

## 11. Summary: top conflicts
1. **Apply form** (Apply.dc.html:33–81): the single-step form with +91-only 10-digit phone, **consent pre-checked**, different consent wording, optional unsubmitted email, MBA preselected, unfiltered university list, no lead save and **no email OTP** conflicts with the owner's contact-first 3-step flow, international codes, unchecked consent v2 and OTP (constraint 1). The success copy "We'll call you soon … within one working day" promises calls and an SLA that aren't confirmed. Use the design for styling only.
2. **Phone number everywhere** (Apply:27, About:51, Legal:34, Recommender FAQ:156 and `call` icons on Apply now buttons; plus header/footer) conflicts with constraint 2.
3. **Recommender:** the 4-step soft-scoring quiz with a placement/rating priority and a pseudo-precise match % conflicts with the 5 hard-filter Groq tool, the ratings/placement ban (constraints 4 and 5) and the Standard's "explanations must match the calculation". The design also has no slot for AI mode, retry, sources, follow-up chat or the empty state. Static "UGC Entitled · NAAC A+" badges on every result conflict with constraint 8. The design budget bands are worth adopting, with owner confirmation.
4. **Legal** as one page with `?tab=` and placeholder copy conflicts with the 3 SEO URLs and the reviewed policy text (constraint 10, the README caveat). The placeholder adds risky claims (loan-partner sharing, "we verify each cycle", refund help) and drops the `#marketing` section.
5. **About and Apply claims:** "Unbiased by design / Every university pays us the same" and "Approvals verified … re-checked every admission cycle" are owner-replaced wording. "India's unbiased marketplace", "verified data", Jobs / Community / "till graduation" / "30+ comparison factors" stats and "Request a callback" need owner decisions. The design drops the owner-required **Contact us** address and email.
6. **How we verify:** the hero claims full per-cycle verification, contradicting the current "verification is ongoing" status. "CONFIRM WITH COUNSELLOR" should be "Confirm with the university". **"Report an error" → Apply form** should be email (admin@unnatividya.com).
7. **EMI:** "Check loan eligibility" has no backend, and the label must be "Apply now". The "0% = no-cost EMI through university loan partners" note and FAQ "every program offers semester-wise payment" are new universal claims. Tenure is tied to course duration, and the 6–36 month / 18% / 50% caps narrow the tool. The design omits the applicant-category / INR-only guard and manual fee entry (constraint 10).
8. **Omitted features that must be kept and restyled:** total cost planner, eligibility checker (and their nav entries), Groq AI ordering and follow-up chat, shortlist compare-selection and undo, newsletter sign-up and pages, the modal lead entry (`data-open-lead`), and the gated compare (`/compare?add=` rather than the design's `Compare?ids=`).
9. **Platform constraints:** the Google Fonts and Material Symbols CDNs are blocked by CSP, so use next/font and lucide with `aria-hidden`. The design's scroll-reveal hides content without JS. The design's div-based controls (options, tabs, FAQ, buttons) must be rebuilt as native buttons, radios, links and details to meet WCAG 2.2 AA and the 44px target size.
