-- Gap checklist: "Add rate limiting and abuse controls." Webhook-specific throttling --
-- WebhookSubscription had no rate limit column at all before this (unlike MarketplaceApp,
-- which already got one earlier this session); 60/minute is a generous default matching
-- MarketplaceApp's own default, so no existing subscription's delivery behavior changes
-- unless a tenant admin lowers it.
alter table "WebhookSubscription" add column if not exists "rateLimitPerMinute" integer not null default 60;
