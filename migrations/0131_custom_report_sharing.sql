-- Custom report sharing (decided 2026-10-03). "isPublic" existed but nothing set it (the report
-- builder never sent it, and every edit reset it to false) while every report was listed to the
-- whole workspace. It now means "Everyone in this workspace" vs "Only me" and is enforced; every
-- existing report becomes Everyone so nothing disappears. Saved views (chartType SAVED_VIEW) keep
-- their own sharing and are untouched.
update "CustomReport" set "isPublic" = true where "chartType" is distinct from 'SAVED_VIEW' and "isPublic" = false;
