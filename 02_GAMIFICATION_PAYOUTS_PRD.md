# PRD: Gamification + Partner Payout System

Give this file to Claude Code/Codex alongside `SCHEMA.md` and the prompt in
`03_GAMIFICATION_PAYOUTS_PROMPT.md`. Fill in the `[NEEDS INPUT]` sections before
starting — Claude Code should ask you rather than guess on these.

## 1. Scope

Two connected but separable sub-systems:
1. **Gamification** — points, leaderboards, badges/milestones for internal sales
   reps (and optionally partners) tied to CRM activity (leads converted, calls
   made, response time, etc.)
2. **Partner Payouts** — commission calculation and GST-compliant invoice
   generation for **external agents/channel partners**, who get their own
   login/portal inside this same app (separate role, not a separate app).

## 2. Partner Portal (same app, new role)

- New role: `PARTNER` (or `CHANNEL_PARTNER`), scoped like existing roles via the
  existing `permission-templates` / `roles` system — reuse it, don't reinvent.
- Partner sees only: their own referred leads/opportunities, their own
  commission ledger, their own invoices/payout history, their own gamification
  stats (if enabled for partners).
- Partner does **not** see other partners, internal pipeline data, or admin
  screens.
- Onboarding: how does a partner get created/invited? [NEEDS INPUT — self
  signup with admin approval, or admin-only creation?]

## 3. Commission Engine

You indicated commission structure is a mix and not fully decided — so build a
**rule-based commission engine**, not a hardcoded formula:

- A `commission_rules` table: each rule has a scope (per partner, per product/
  opportunity-type, or global default), a type (`FLAT`, `PERCENTAGE`, `TIERED`),
  and a value/tier definition (JSON for tiered slabs, e.g. volume bands with
  different %).
- A rule resolves at the point commission is calculated — most specific match
  wins (partner+product > product > partner > global default).
- Commission triggers on a **status change** (e.g. opportunity moves to
  "Enrolled"/"Won"), not on lead creation — avoids paying out on leads that
  never close. [NEEDS INPUT — confirm the exact trigger stage per your pipeline]
- Every commission calculation writes an immutable ledger entry (append-only,
  never edit/delete — corrections happen via new offsetting entries). This is
  important for audit and for invoice generation to be traceable.

## 4. Payout Cycle & Invoice Generation

- Payout cycle: [NEEDS INPUT — monthly, bi-weekly, on-demand?]
- Invoice must be GST-compliant:
  - Your business GSTIN [NEEDS INPUT]
  - HSN/SAC code for the service being invoiced [NEEDS INPUT]
  - Invoice numbering series (sequential, no gaps — GST rules require this)
  - Place of supply logic (partner's registered state vs. your state)
  - CGST+SGST vs IGST split logic based on above
- Output as downloadable PDF per partner per cycle, plus a summary export for
  your finance team (CSV/Excel) covering all partners in a cycle.
- Status flow per payout: `Draft` → `Approved` → `Invoiced` → `Paid` (with a
  reference/UTR field for the actual bank transfer, entered manually).

## 5. Gamification

- Point-earning events: reuse the existing `activities`/`opportunities` change
  events already flowing through the system — don't build a second event
  pipeline, hook into what exists.
- Leaderboard: team-level and individual, filterable by date range.
- Badges/milestones: rule-based (e.g. "10 conversions in a month"), admin-
  configurable, not hardcoded.
- Does gamification apply to partners too, or internal reps only? [NEEDS INPUT]
- Are points ever converted into payout amounts (i.e. gamification feeds the
  commission engine), or are they a fully separate recognition system with no
  monetary link? [NEEDS INPUT — this materially changes the data model]

## 6. Non-negotiables carried over from the rest of the app
- Every new table needs tenant scoping (multi-tenant model already exists —
  follow the same pattern as `leads`/`opportunities`).
- Every commission/payout mutation needs an audit trail entry (governance
  module already does this for leads/opportunities — extend it, don't
  duplicate it).
- Field-level permissions should apply to commission/payout fields the same
  way they do elsewhere in the app.
