import { NextResponse } from "next/server";
import { badRequest, conflict, forbidden, notFound, serverError, unauthorized } from "@/lib/server/http";

const MESSAGES: Record<string, [number, string]> = {
  LEAD_STATUS_LABEL_INVALID: [400, "Enter a name of up to 60 characters"],
  LEAD_STATUS_TONE_INVALID: [400, "Choose a colour from the list"],
  LEAD_STATUS_CATEGORY_INVALID: [400, "Choose Open, Converted or Lost"],
  LEAD_STATUS_DUPLICATE: [409, "A status with that name already exists"],
  LEAD_STATUS_NOT_FOUND: [404, "Status not found"],
  LEAD_STATUS_IN_USE: [409, "Leads still have this status. Move them to another status, or turn this one off instead."],
  LEAD_STATUS_LAST_OPEN: [409, "Keep at least one active Open status, so new leads have one"],
  LEAD_STATUS_ORDER_INVALID: [400, "The order must list every status once"],
};

// Shared error mapping for the lead status routes.
export function leadStatusError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : "";
  if (message === "UNAUTHORIZED") return unauthorized();
  if (message === "FORBIDDEN") return forbidden();
  if (message === "TENANT_CONTEXT_REQUIRED") return forbidden("Tenant context required");
  const known = MESSAGES[message];
  if (known) {
    const [status, text] = known;
    if (status === 400) return badRequest(text);
    if (status === 404) return notFound(text);
    if (status === 409) return conflict(text);
    return NextResponse.json({ message: text }, { status });
  }
  return serverError(fallback, error);
}
