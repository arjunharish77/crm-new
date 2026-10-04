import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getTenantContext } from "@/lib/db/tenant-context";
import { errorDetail, logEvent } from "@/lib/server/logger";
import { reportError } from "@/lib/server/error-reporting";
import { RateLimitExceededError } from "@/lib/server/rate-limit";
import { ModuleAccessError } from "@/lib/server/module-access-error";
import { UnsupportedFilterError } from "@/lib/query-filters";

export function unauthorized(message = "Unauthorized") {
  return NextResponse.json({ message }, { status: 401 });
}

export function badRequest(message = "Bad request") {
  return NextResponse.json({ message }, { status: 400 });
}

export function forbidden(message = "Forbidden") {
  return NextResponse.json({ message }, { status: 403 });
}

// WP08 (F13): a retried request reusing an Idempotency-Key with a different body hash than the
// original -- distinct from a normal validation failure, so callers can tell "you changed the
// payload under a key you already used" apart from "this request itself is malformed".
export function notFound(message = "Not found") {
  return NextResponse.json({ message }, { status: 404 });
}

export function conflict(message = "Conflict") {
  return NextResponse.json({ message }, { status: 409 });
}

// A refusal whose message is written for the end user (e.g. "Payouts requires Partners. Enable
// Partners first."). The stable code tells apiFetch to show `message` verbatim instead of its
// generic per-status text.
export function moduleDependencyConflict(message: string, status = 409) {
  return NextResponse.json({ code: "MODULE_DEPENDENCY", message }, { status });
}

export function tooManyRequests(message = "Too many requests", retryAfterSeconds?: number) {
  const headers = retryAfterSeconds !== undefined ? { "Retry-After": String(retryAfterSeconds) } : undefined;
  return NextResponse.json({ message }, { status: 429, headers });
}

export function requestTimeout(message = "The request took too long and was cancelled") {
  return NextResponse.json({ message }, { status: 504 });
}

// "Safe content-disposition names" (gap checklist item). A `Content-Disposition` filename
// built from a DB-stored value (a FileObject's originalFilename, an export's stored name) with
// only `.replace(/"/g, "")` stops the obvious quote-breakout but not a CRLF sequence, which in
// an unpatched/older HTTP stack could be used for response-header injection. Whitelisting to a
// safe character set (matching the pattern the Payouts statement/invoice download routes
// already established) closes that off entirely rather than trying to enumerate what's unsafe.
export function safeContentDispositionFilename(filename: string, fallback = "download") {
  const sanitized = String(filename || "").replace(/[\r\n]/g, "").replace(/[^a-zA-Z0-9._ -]/g, "_").trim();
  return sanitized || fallback;
}

const API_KEY_AUTH_ERROR_MESSAGES: Record<string, string> = {
  MISSING_CREDENTIALS: "Missing API key credentials",
  API_KEY_NOT_FOUND: "Invalid API key",
  API_KEY_OWNER_UNAVAILABLE: "The API key creator is unavailable in this workspace. Create a new key using an active workspace administrator.",
  API_KEY_REVOKED: "This API key has been revoked",
  API_KEY_EXPIRED: "This API key has expired",
  FEATURE_DISABLED: "API Access is not enabled for this workspace",
  INVALID_SECRET: "Invalid API key credentials",
  STALE_TIMESTAMP: "Request timestamp is missing or outside the allowed window",
  INVALID_SIGNATURE: "Invalid request signature",
  IP_NOT_ALLOWED: "This request's IP address is not on the API key's allowlist",
  RATE_LIMITED: "Rate limit exceeded for this API key",
};

// Shared HTTP mapping for ApiKeyAuthenticationError, reused by every /api/v1/** route so
// each one gets the exact same status/message per failure reason instead of re-deriving it.
export function apiKeyAuthErrorResponse(reason: string) {
  const message = API_KEY_AUTH_ERROR_MESSAGES[reason] ?? "API key authentication failed";
  if (reason === "RATE_LIMITED") return tooManyRequests(message, 60);
  if (reason === "IP_NOT_ALLOWED" || reason === "API_KEY_REVOKED" || reason === "API_KEY_OWNER_UNAVAILABLE" || reason === "FEATURE_DISABLED") return forbidden(message);
  return unauthorized(message);
}

const MARKETPLACE_ERROR_MESSAGES: Record<string, string> = {
  APP_NAME_REQUIRED: "A name is required",
  DUPLICATE_APP_NAME: "An app with this name already exists",
  MARKETPLACE_APP_NOT_FOUND: "App not found",
  APP_INSTALL_NOT_PENDING: "This install request is no longer pending",
  APP_INSTALL_NOT_INSTALLED: "This app is not currently installed",
  APP_INSTALL_NOT_SUSPENDED: "This app is not currently suspended",
  APP_INSTALL_NOT_ACTIVE: "This app has no active install to remove",
  APP_SECRET_NOT_FOUND: "App credentials not found",
  INVALID_DAILY_LIMIT: "Daily delivery limit must be a positive number",
  INVALID_RATE_LIMIT: "Rate limit must be a positive number",
  NO_PENDING_PERMISSION_CHANGE: "There is no pending permission change for this app",
  APP_ALREADY_PUBLISHED_OR_PENDING: "This app is already published or awaiting review",
  MARKETPLACE_APP_NOT_PUBLISHED: "This app is not published",
  CANNOT_INSTALL_OWN_APP: "You already own this app",
  APP_VERSION_PENDING_REVIEW: "This app has a newer version awaiting platform review",
  APP_ALREADY_INSTALLED: "This app is already installed for your workspace",
  APP_VERSION_NOT_PENDING: "This version is no longer pending review",
  INVALID_TRUST_LEVEL: "Invalid trust level",
  APP_BLOCKED_FOR_TENANT: "This app is not available for your workspace",
  APP_TENANT_BLOCK_NOT_FOUND: "This tenant is not blocked from this app",
  INSTALL_NOT_FOUND: "App install not found",
  OWNER_USER_ID_REQUIRED_FOR_OWN_OR_TEAM_SCOPE: "An owning user must be selected for OWN or TEAM record scope",
  OWNER_USER_NOT_FOUND_IN_TENANT: "The selected owning user was not found in this workspace",
  APP_INSTALL_NOT_FOUND: "App install not found",
  SYNC_CONFIG_NOT_FOUND: "Sync settings not found",
  INVALID_SYNC_DIRECTION: "Invalid sync direction",
  INVALID_CONFLICT_RESOLUTION: "Invalid conflict resolution strategy",
  INVALID_ENABLED_MODULE: "Invalid module in enabledModules",
  INVALID_MODULE: "Invalid module",
  APP_FIELD_REQUIRED: "Each field mapping needs an app-side field name",
  APP_INCOMPATIBLE: "This app is not compatible with this workspace's current contract version, or has an unmet dependency -- check its compatibility details before approving",
  APP_INSTALL_NOT_REVIEWED: "This install must be reviewed before it can be approved",
  NO_PENDING_PLATFORM_PERMISSION_CHANGE: "There is no pending write-permission change awaiting platform-admin review for this app",
  MARKETPLACE_APP_VERSION_NOT_FOUND: "That version doesn't exist or isn't an approved version to roll back to",
};

// Shared HTTP mapping reused by every /api/marketplace/** route (12 of them) so each one maps
// the same error codes to the same status/message instead of re-deriving it per file.
export function marketplaceErrorResponse(error: unknown, fallbackMessage: string) {
  if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
  if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
  if (error instanceof Error && error.message.startsWith("MODULE_DISABLED")) return badRequest("Marketplace is not enabled for this workspace");
  // INVALID_CRM_FIELD:<field> carries the offending field name as a dynamic suffix -- matched
  // by prefix rather than exact lookup, unlike every other marketplace error code.
  if (error instanceof Error && error.message.startsWith("INVALID_CRM_FIELD:")) {
    return badRequest(`"${error.message.split(":")[1]}" is not a mappable field for this module`);
  }
  if (error instanceof Error && MARKETPLACE_ERROR_MESSAGES[error.message]) return badRequest(MARKETPLACE_ERROR_MESSAGES[error.message]);
  return serverError(fallbackMessage, error);
}

const MARKETPLACE_APP_AUTH_ERROR_MESSAGES: Record<string, string> = {
  MISSING_CREDENTIALS: "Missing app credentials",
  APP_NOT_FOUND: "Invalid app credentials",
  APP_SUSPENDED: "This app has been suspended",
  APP_NOT_INSTALLED: "This app is not installed for this workspace",
  INVALID_SECRET: "Invalid app credentials",
  RATE_LIMITED: "Rate limit exceeded for this app",
  MODULE_DISABLED: "Marketplace is not enabled for this workspace",
};

// Shared HTTP mapping for MarketplaceAppAuthenticationError, mirroring apiKeyAuthErrorResponse
// above for the separate /api/v1/apps/** credential system.
export function marketplaceAppAuthErrorResponse(reason: string) {
  const message = MARKETPLACE_APP_AUTH_ERROR_MESSAGES[reason] ?? "App authentication failed";
  if (reason === "RATE_LIMITED") return tooManyRequests(message, 60);
  if (reason === "APP_SUSPENDED" || reason === "APP_NOT_INSTALLED" || reason === "MODULE_DISABLED") return forbidden(message);
  return unauthorized(message);
}

function getErrorDetail(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
    };
  }

  if (typeof error === "string") {
    return { message: error };
  }

  if (error && typeof error === "object") {
    return error;
  }

  return { message: "Unknown error" };
}

// Display names for module-disabled responses (mirrors the PlatformModule catalog seed in
// migrations/0037_module_entitlements.sql).
const FEATURE_FLAG_MODULES: Record<string, string> = {
  opportunityEnabled: "OPPORTUNITIES", automationEnabled: "AUTOMATIONS", formBuilderEnabled: "FORMS",
  advancedReporting: "REPORTS", payoutsEnabled: "PAYOUTS", gamificationEnabled: "GAMIFICATION",
};
const MODULE_DISPLAY_NAMES: Record<string, string> = {
  OPPORTUNITIES: "Opportunities", FORMS: "Forms", AUTOMATIONS: "Automations", REPORTS: "Reports",
  MARKETING: "Marketing Communications", JOURNEY_ORCHESTRATION: "Journey Orchestration",
  PREDICTIVE_SCORING: "Predictive Scoring", NEXT_BEST_ACTION: "Next-Best Action", AI_COPILOT: "AI Copilot",
  DISTRIBUTION: "Distribution Engine", PARTNERS: "Partners", PAYOUTS: "Payouts", GAMIFICATION: "Gamification",
  PRODUCT_CATALOG: "Product Catalog", COUNSELING: "Learning and Counseling Operations", TELEPHONY: "Telephony",
  SERVICE_DESK: "Service Desk", QUALITY_MANAGEMENT: "Quality Management", DATA_PLATFORM: "Data Platform",
  MARKETPLACE: "Marketplace", DEVOPS_OPS: "DevOps & Ops",
};

export function serverError(message = "Internal server error", error?: unknown) {
  // The single choke point that makes the general per-user/per-tenant rate limit (rate-
  // limit.ts's assertGeneralRateLimit, thrown from requireCurrentUser) produce a real 429 +
  // Retry-After across every one of this app's route handlers -- nearly all of them already
  // call serverError(...) as their final catch-all, so this one check covers them without each
  // needing its own `error.message === "RATE_LIMITED"` branch added individually.
  if (error instanceof RateLimitExceededError) return tooManyRequests("Too many requests -- please slow down.", error.retryAfterSeconds);
  // Role module permissions (thrown from requireCurrentUser): a 403 naming the module.
  if (error instanceof ModuleAccessError) return forbidden(error.userMessage);
  // Campaigns: content is locked once a campaign has started.
  if (error instanceof Error && error.message === "CAMPAIGN_LOCKED") return NextResponse.json({ message: "This campaign has started, so what it sends can't change. Create a new campaign to send something different." }, { status: 409 });
  // Custom fields exist for leads, opportunities and activities only.
  if (error instanceof Error && error.message.startsWith("Unsupported object type:")) return NextResponse.json({ message: `${error.message}. Custom fields exist for leads, opportunities and activities.` }, { status: 400 });
  // Forms and automations: archive, restore and delete for good are the creator's or an admin's.
  if (error instanceof Error && error.message === "ITEM_OWNER_OR_ADMIN") return NextResponse.json({ message: "Only the person who created it, or an admin, can archive, restore or delete it." }, { status: 403 });
  // Suspending a workspace needs a reason (Section 8 #12).
  if (error instanceof Error && error.message === "SUSPEND_REASON_REQUIRED") return NextResponse.json({ message: "Give a reason for suspending this workspace." }, { status: 400 });
  // A password that doesn't meet the workspace policy (the message lists what's missing).
  if (error instanceof Error && error.message === "PASSWORD_POLICY") return NextResponse.json({ message: (error as any).userMessage ?? "The password doesn't meet the workspace's password rules." }, { status: 400 });
  // Report drafts (decision 29).
  if (error instanceof Error && error.message === "CUSTOM_REPORT_NOTHING_TO_PUBLISH") return NextResponse.json({ message: "There are no unpublished changes to publish." }, { status: 400 });
  if (error instanceof Error && error.message === "CUSTOM_REPORT_NO_COLUMNS") return NextResponse.json({ message: "Add at least one column before publishing." }, { status: 400 });
  if (error instanceof Error && error.message === "CUSTOM_REPORT_NOT_PUBLISHED") return NextResponse.json({ message: "This report hasn't been published yet. Publish it first." }, { status: 400 });
  // Archive model (archive-items.ts), shared by every archivable configuration item.
  if (error instanceof Error && error.message === "ARCHIVE_ITEM_NOT_FOUND") return NextResponse.json({ message: "Not found -- it may already be archived or restored." }, { status: 404 });
  if (error instanceof Error && error.message === "ARCHIVE_ITEM_NOT_ARCHIVED") return NextResponse.json({ message: "Only an archived item can be deleted for good. Archive it first." }, { status: 400 });
  if (error instanceof Error && error.message === "ARCHIVE_ITEM_IN_USE") {
    return NextResponse.json({ message: "Past payouts or points refer to this rule, so it stays archived instead of being deleted for good." }, { status: 409 });
  }
  // A send or enrolment whose Smart View audience can't be worked out exactly.
  if (error instanceof Error && error.message === "AUDIENCE_VIEW_NOT_FOUND") {
    return NextResponse.json({ message: "This audience's Smart View was deleted or archived. Choose another audience.", code: error.message }, { status: 400 });
  }
  if (error instanceof Error && error.message === "AUDIENCE_FILTER_UNSUPPORTED") {
    return NextResponse.json({ message: `This audience's Smart View uses a filter (${(error as any).field ?? "unknown"}) that can't be applied to a send. Edit the view or choose another audience.`, code: error.message }, { status: 400 });
  }
  // A strict filter (Smart Views) the server can't apply: say which, never widen the result.
  if (error instanceof UnsupportedFilterError) {
    return NextResponse.json({ message: `This filter can't be applied on the server: ${error.field} (${error.operator.replace(/_/g, " ")})`, code: "FILTER_UNSUPPORTED", field: error.field, operator: error.operator }, { status: 400 });
  }

  // Same centralized-choke-point pattern as RateLimitExceededError above: assertNotImpersonating
  // (sessions.ts) throws a plain Error with this prefix from several sensitive-action call
  // sites (API key rotation, payout transitions, privacy deletes), and this one check maps all
  // of them to a real 403 without each route needing its own branch.
  if (error instanceof Error && error.message.startsWith("IMPERSONATION_BLOCKED:")) {
    const action = error.message.split(":")[1]?.replace(/_/g, " ") ?? "this action";
    return forbidden(`This action (${action}) isn't available while impersonating another user.`);
  }
  if (error instanceof Error && error.message === "IMPERSONATION_TARGET_INACTIVE") return badRequest("That user isn't active, so they can't be impersonated.");
  if (error instanceof Error && error.message === "IMPERSONATION_TARGET_PRIVILEGED") return forbidden("Platform admins can't be impersonated.");

  if (error instanceof Error && error.message === "IDEMPOTENCY_KEY_CONFLICT") return conflict("This Idempotency-Key was already used with a different request body");
  if (error instanceof Error && error.message === "INVALID_OPPORTUNITY_REFERENCE") return badRequest("Choose an accessible Lead and a valid Opportunity type and stage from this workspace");
  // Same choke-point pattern for tenant module entitlements: assertModuleEnabled throws
  // "MODULE_DISABLED:<KEY>". Routes with their own branch for this keep their wording; every
  // other route (e.g. the whole Telephony family) gets an accurate 403 naming the module,
  // instead of a misleading 500.
  // Usage limits (Module 21): UsageLimitError carries a user-facing explanation.
  if (error instanceof Error && error.message.startsWith("USAGE_LIMIT_REACHED:")) {
    const explanation = (error as Error & { explanation?: string }).explanation ?? "This workspace has reached a usage limit.";
    return NextResponse.json({ code: "USAGE_LIMIT_REACHED", metric: error.message.slice("USAGE_LIMIT_REACHED:".length), message: explanation }, { status: 409 });
  }
  // assertFeatureEnabled throws "FEATURE_DISABLED:<flag>" for the six modules that still have a
  // legacy feature flag (the check already includes the module status): same 403 shape.
  if (error instanceof Error && error.message.startsWith("FEATURE_DISABLED:")) {
    const flag = error.message.slice("FEATURE_DISABLED:".length);
    const key = FEATURE_FLAG_MODULES[flag];
    return NextResponse.json({ code: "MODULE_DISABLED", module: key ?? flag, message: `${(key && MODULE_DISPLAY_NAMES[key]) ?? flag} is not enabled for this workspace` }, { status: 403 });
  }
  if (error instanceof Error && error.message.startsWith("MODULE_DISABLED:")) {
    const key = error.message.slice("MODULE_DISABLED:".length);
    return NextResponse.json({ code: "MODULE_DISABLED", module: key, message: `${MODULE_DISPLAY_NAMES[key] ?? key} is not enabled for this workspace` }, { status: 403 });
  }
  if (error instanceof Error && error.message.startsWith("DUPLICATE_RULE_BLOCK: ")) {
    return NextResponse.json({ code: "DUPLICATE_RULE_BLOCK", message: `Duplicate blocked by rule: ${error.message.slice("DUPLICATE_RULE_BLOCK: ".length)}` }, { status: 409 });
  }

  // Round-2 plan O5: a structured log line (with the request id the user can quote as the
  // reference) and, when configured, a Sentry report.
  // Routes without a request id in context get a short generated one, so every 500 has a
  // reference that matches a log line.
  const reference = getTenantContext()?.requestId ?? `ref-${randomBytes(4).toString("hex")}`;
  logEvent("error", message, { reference, error: errorDetail(error) });
  reportError(error ?? new Error(message), { route: message, reference });

  const body =
    process.env.NODE_ENV === "development" && error !== undefined
      ? { message, error: getErrorDetail(error), reference }
      : { message, reference };

  return NextResponse.json(body, { status: 500 });
}
