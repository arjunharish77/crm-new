# Phase 1 Prompt — Gamification + Partner Payouts (paste after Phase 0 is done)

I'm building a Gamification + Partner Payout module for the CRM in this repo.
Read `02_GAMIFICATION_PAYOUTS_PRD.md` in full first — it's the product spec.
Also re-read `SCHEMA.md` so new tables fit the existing multi-tenant model.

Before writing any code, do this:

1. List every `[NEEDS INPUT]` item from the PRD back to me and ask me to
   answer each one. Do not assume defaults for these — they change the data
   model (especially: whether points convert to money, and the exact
   pipeline stage that triggers commission).

2. Propose a data model (table names, columns, relationships, RLS approach)
   for:
   - `commission_rules` (rule-based engine per the PRD — flat/percentage/
     tiered, scoped by partner/product/global)
   - `commission_ledger` (append-only, never mutated — corrections are new
     offsetting entries, not edits)
   - `payout_cycles` and `payouts` (Draft → Approved → Invoiced → Paid)
   - `partner_profile` (extends or links to the existing user/role model —
     don't create a parallel user system, reuse `roles`/`permission-templates`)
   - `gamification_points`, `gamification_rules`, `badges`/`milestones`,
     leaderboard aggregation approach (materialized view vs. computed on read
     — your call, tell me the tradeoff)
   Show me this model before generating migrations or code.

3. Once I approve the model, implement in this order, confirming each works
   before moving on:
   a. Partner role + portal routing (new role scoped like existing roles;
      reuse `permission-templates`; partner sees only their own data)
   b. Commission rule engine + resolution logic (most-specific-rule-wins)
   c. Commission ledger writing on the confirmed trigger event
   d. Payout cycle management UI (admin side: review, approve, mark paid)
   e. GST-compliant invoice PDF generation per partner per cycle (I'll supply
      GSTIN, HSN/SAC code, and invoice numbering scheme when asked — ask me
      for these explicitly, don't placeholder them silently into production
      code)
   f. Gamification points engine hooked into existing activity/opportunity
      events (do not build a parallel event pipeline)
   g. Leaderboard + badges UI

4. For every new table, use the same tenant-scoping and audit-trail pattern
   as the existing `leads`/`opportunities`/governance modules — extend the
   existing audit system, don't duplicate it.

5. Add tests for the commission calculation logic specifically (this handles
   money — it needs the most coverage of anything in this phase). At minimum:
   correct rule resolution priority, tiered slab boundary conditions, and
   that ledger entries are never mutated.

6. Update `LEADSQUARED_GAP_CHECKLIST.md` with a new "Gamification & Payouts"
   section reflecting what's actually done and verified.

Work in small verifiable increments — after each sub-step, tell me what
changed and how to check it, rather than delivering the whole module at once.
