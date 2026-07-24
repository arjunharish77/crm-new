# CRM Upgrade Roadmap

Source of truth: `LEADSQUARED_GAP_CHECKLIST.md` in the repo. Every phase below should
be added as a new section in that file before work starts, and checked off item by
item as it's verified — not just written.

## Phase 0 — Foundation fixes (do first, always)
- [x] Export real Supabase schema into repo as `SCHEMA.md` (see `01_SCHEMA_EXPORT_INSTRUCTIONS.md`)
- [x] Add `.env.example`
- [x] Add minimal smoke tests (auth, leads CRUD, RLS check)
- [x] Confirm `rate-limits` / `retention` / `usage` admin pages are wired to real
      enforcement, not just UI — document whichever is true.
      **Finding: all three are UI stubs.** Each fetches from `/api/platform-admin/...`
      routes that don't exist anywhere in `src/app/api` (that tree only has
      `impersonate/` and `tenants/**`), and there is no supporting enforcement logic
      anywhere in `src/lib` (no rate-limiting engine, no retention-policy-driven
      deletion job, no usage aggregator). `retention`'s "Save Changes"/"Enforce Now"
      buttons call `PATCH .../retention/policy/*` and `POST .../retention/enforce`,
      which 404 — nothing is persisted and no data is ever deleted. Not fixed here
      per instructions; needs real API routes + backing logic before it does anything.

## Phase 1 — Gamification + Partner Payouts — done, pending migration + manual verification
See `02_GAMIFICATION_PAYOUTS_PRD.md` and `03_GAMIFICATION_PAYOUTS_PROMPT.md`. Full breakdown
and remaining gaps (redemption engine, full RBAC sweep, credit notes, etc.) tracked under
"Gamification & Payouts" in `LEADSQUARED_GAP_CHECKLIST.md`. Before using this: run
`migrations/0001`–`0007` in the Supabase SQL Editor and re-export `SCHEMA.md`.

## Phase 2 — Distribution Engine upgrade
- Quotas per user/team, availability/working-hours, skill/property-based matching,
  simulator, fairness reporting (all currently unchecked in the gap checklist).

## Phase 3 — Tasks & Follow-ups (Nudges)
- Task object/table/API, list/calendar/detail views, reminders, linking to
  leads/opportunities/activities, automation triggers + actions for tasks.

## Phase 4 — Communication Module + Omnichannel Orchestration
- Unified thread/inbox model across email, WhatsApp, voicebot, and existing telephony.
- Orchestration layer decides channel/sequence per lead based on rules.
- Needs a vendor decision (see open question below) before build starts.

## Phase 5 — Smart Views
- Build on existing `saved-views` + `filter-builder` — add auto-refreshing,
  rule-based membership (vs. static saved filters).

## Phase 6 — Reporting & Analytics / Insights
- Custom report builder with joins, scheduled report subscriptions, automation
  performance reports, SLA reports — plus a lightweight insights/anomaly layer.

## Phase 7 — Theme Selector + Sales Dashboard
- Theme registry (replace hardcoded `src/theme.ts` single palette) with
  user/tenant-level persisted preference.
- Sales-specific dashboard: pipeline velocity, rep leaderboards (feeds off
  gamification data from Phase 1), quota attainment.

## Phase 8 — Mobile-readiness hardening
- Refresh tokens (Bearer auth already exists — good head start).
- Push notification hooks (ties into Phase 3 nudges and Phase 4 comms).
- Pagination/response-shape consistency audit across all 103+ API routes.
- API versioning strategy so a future mobile app doesn't break on web changes.

## Open decisions to make before Phase 4
- Which email provider (SendGrid/SES/Postmark), WhatsApp BSP (Gupshup/Interakt/
  360dialog), and voicebot vendor. Since you said "any vendor," I'd suggest
  picking whichever gives the fastest India-market WhatsApp Business API
  approval (Interakt/Gupshup are common for Indian edtech) — revisit before Phase 4.
