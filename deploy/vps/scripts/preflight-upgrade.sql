-- Read-only pre-upgrade data check for the 9c3b95f -> 2026-09 release. Changes nothing.
-- Every row must show violations = 0 before running the migration step. A non-zero count names
-- the migration that would fail on this data; stop and resolve it first.
-- (Constraint changes not listed here only widen or restate a constraint production already
-- enforces, so existing data cannot violate them. Verified on a production-equivalent rehearsal.)
begin transaction read only;

select '0045 TelephonyCallLog duplicate (tenantId, provider, callId)' as check_name, count(*) as violations
from (select 1 from "TelephonyCallLog" where "callId" is not null and provider is not null
      group by "tenantId", provider, "callId" having count(*) > 1) d
union all
select '0106 Payout duplicate (tenantId, paymentReference)', count(*)
from (select 1 from "Payout" where "paymentReference" is not null
      group by "tenantId", "paymentReference" having count(*) > 1) d
union all
select '0109 Note entityType outside LEAD/OPPORTUNITY/ACTIVITY', count(*)
from "Note" where "entityType" is null or "entityType" not in ('LEAD', 'OPPORTUNITY', 'ACTIVITY');

rollback;
