import { NextResponse } from "next/server";
import { RateLimitExceededError } from "@/lib/server/rate-limit";

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
export function conflict(message = "Conflict") {
  return NextResponse.json({ message }, { status: 409 });
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
};

// Shared HTTP mapping for MarketplaceAppAuthenticationError, mirroring apiKeyAuthErrorResponse
// above for the separate /api/v1/apps/** credential system.
export function marketplaceAppAuthErrorResponse(reason: string) {
  const message = MARKETPLACE_APP_AUTH_ERROR_MESSAGES[reason] ?? "App authentication failed";
  if (reason === "RATE_LIMITED") return tooManyRequests(message, 60);
  if (reason === "APP_SUSPENDED" || reason === "APP_NOT_INSTALLED") return forbidden(message);
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

export function serverError(message = "Internal server error", error?: unknown) {
  // The single choke point that makes the general per-user/per-tenant rate limit (rate-
  // limit.ts's assertGeneralRateLimit, thrown from requireCurrentUser) produce a real 429 +
  // Retry-After across every one of this app's route handlers -- nearly all of them already
  // call serverError(...) as their final catch-all, so this one check covers them without each
  // needing its own `error.message === "RATE_LIMITED"` branch added individually.
  if (error instanceof RateLimitExceededError) return tooManyRequests("Too many requests -- please slow down.", error.retryAfterSeconds);

  // Same centralized-choke-point pattern as RateLimitExceededError above: assertNotImpersonating
  // (sessions.ts) throws a plain Error with this prefix from several sensitive-action call
  // sites (API key rotation, payout transitions, privacy deletes), and this one check maps all
  // of them to a real 403 without each route needing its own branch.
  if (error instanceof Error && error.message.startsWith("IMPERSONATION_BLOCKED:")) {
    const action = error.message.split(":")[1]?.replace(/_/g, " ") ?? "this action";
    return forbidden(`This action (${action}) isn't available while impersonating another user.`);
  }

  if (error instanceof Error && error.message === "IDEMPOTENCY_KEY_CONFLICT") return conflict("This Idempotency-Key was already used with a different request body");
  if (error instanceof Error && error.message === "INVALID_OPPORTUNITY_REFERENCE") return badRequest("Choose an accessible Lead and a valid Opportunity type and stage from this workspace");
  if (error instanceof Error && error.message.startsWith("DUPLICATE_RULE_BLOCK: ")) {
    return NextResponse.json({ code: "DUPLICATE_RULE_BLOCK", message: `Duplicate blocked by rule: ${error.message.slice("DUPLICATE_RULE_BLOCK: ".length)}` }, { status: 409 });
  }

  // Without this, every 500 in production is silently swallowed -- nothing in server
  // logs to correlate with a user-reported failure.
  console.error(message, error);

  const body =
    process.env.NODE_ENV === "development" && error !== undefined
      ? { message, error: getErrorDetail(error) }
      : { message };

  return NextResponse.json(body, { status: 500 });
}
