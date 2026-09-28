-- WP16 fix (F26): admin sessions were pure stateless signed tokens with no way to invalidate one
-- early -- a deactivated/deleted admin's already-issued cookie kept working until its natural 8h
-- expiry, and there was no way to force a re-login (e.g. after a suspected credential leak).
alter table cms_user add column if not exists is_active boolean not null default true;
alter table cms_user add column if not exists session_valid_after timestamptz not null default now();

comment on column cms_user.is_active is 'False disables the account immediately: getAdminSession rejects any token for this user regardless of its signature/expiry.';
comment on column cms_user.session_valid_after is 'Any session token issued (iat) before this timestamp is rejected; bump it to force re-login everywhere (e.g. on password reset or suspected compromise).';
