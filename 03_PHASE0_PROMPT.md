# Phase 0 Prompt — paste into Claude Code (run this FIRST, before any feature work)

I'm working on the CRM app in this repo. Before adding any new features, I need
you to fix foundational gaps. Do these in order, and stop to show me each result
before moving to the next:

1. Read `SCHEMA.md` in the repo root (I've exported my real Supabase schema
   there — tables, columns, RLS policies, foreign keys). Treat it as the source
   of truth for the data model. If it's missing, stop and tell me — do not
   guess at the schema.

2. Read `LEADSQUARED_GAP_CHECKLIST.md` in full. This is the existing tracked
   gap list for this project — treat it as authoritative for what's done vs.
   pending, and update it (don't replace it) as you complete work.

3. Create a proper `.env.example` at the repo root listing every environment
   variable actually referenced in the codebase (grep for `process.env`),
   with placeholder values and a one-line comment on what each is for.

4. Set up a minimal test harness:
   - Pick a lightweight approach appropriate for this Next.js 16 + Supabase
     app (e.g. Vitest for unit tests, Playwright only if you think end-to-end
     coverage is worth the setup cost right now — your call, tell me why).
   - Write smoke tests for: login/auth flow, lead create/read/update, and one
     RLS/tenant-isolation check (a user from tenant A cannot read tenant B's
     data).
   - Don't try to achieve full coverage — this is a safety net for future
     regressions, not a test-everything exercise.

5. Audit the admin pages at `src/app/dashboard/admin/rate-limits`,
   `src/app/dashboard/admin/retention`, and `src/app/dashboard/admin/usage`.
   For each, tell me clearly: is it wired to real backend enforcement, or is
   it a UI stub with no effect? Don't fix anything here yet, just report back.

6. Confirm the production build (`npm run build`) still passes and
   `tsc --noEmit` is clean after your changes.

After each step, summarize what you did and what you found before continuing
to the next step. If you hit a decision point (e.g. which test library), ask
me rather than picking silently.
