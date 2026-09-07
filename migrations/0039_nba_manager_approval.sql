-- Priority Module 6 -- Next-Best-Action Engine, manager-approval-for-high-impact-actions.
-- An admin marks specific NextBestActionRule rows as requiring approval; a generated
-- recommendation from one of those rules starts life as PENDING_APPROVAL (invisible to the
-- record owner's normal accept/dismiss flow) instead of PENDING, and must be approved or
-- rejected by the owner's manager (User.managerId, the same relationship ESCALATE_TO_MANAGER
-- already resolves) before it becomes actionable.

alter table "NextBestActionRule"
  add column if not exists "requiresApproval" boolean not null default false;

alter table "NextBestActionRecommendation"
  drop constraint if exists "NextBestActionRecommendation_status_check";

alter table "NextBestActionRecommendation"
  add constraint "NextBestActionRecommendation_status_check"
  check ("status" in ('PENDING', 'ACCEPTED', 'SNOOZED', 'DISMISSED', 'COMPLETED', 'NOT_USEFUL', 'EXPIRED', 'PENDING_APPROVAL', 'REJECTED'));
