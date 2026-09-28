-- WP10 (F15): "require ... unique payment references in the appropriate business scope" --
-- markPayoutPaid previously had no protection against a duplicate provider callback (or a
-- reused reference typed by mistake) recording two payouts against what is really the same
-- real-world payment. Scoped to (tenantId, paymentReference), and only enforced once a
-- reference is actually recorded (most payouts have none until marked PAID).
create unique index if not exists "Payout_tenantId_paymentReference_key"
  on "Payout" ("tenantId", "paymentReference")
  where "paymentReference" is not null;
