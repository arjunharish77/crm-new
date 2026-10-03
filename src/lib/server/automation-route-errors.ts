import { NextResponse } from "next/server";
import { badRequest, forbidden, notFound, serverError, unauthorized } from "@/lib/server/http";

// Shared error mapping for the automation draft, publish and version routes (decision 29).
export function automationRouteError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : "";
  if (message === "UNAUTHORIZED") return unauthorized();
  if (message === "FORBIDDEN") return forbidden();
  if (message.startsWith("FEATURE_DISABLED")) return badRequest("Automations is not enabled for this workspace");
  if (message === "AUTOMATION_NOT_FOUND") return notFound("Automation not found");
  if (message === "AUTOMATION_VERSION_NOT_FOUND") return notFound("That version doesn't exist");
  if (message === "AUTOMATION_ARCHIVED") return NextResponse.json({ message: "This automation is archived. Restore it to make changes." }, { status: 409 });
  if (message === "AUTOMATION_NOTHING_TO_PUBLISH") return NextResponse.json({ message: "There are no unpublished changes." }, { status: 409 });
  if (message === "AUTOMATION_NAME_REQUIRED") return badRequest("Give the automation a name before publishing");
  if (message === "AUTOMATION_TRIGGER_REQUIRED") return badRequest("Choose what starts the automation before publishing");
  if (message === "AUTOMATION_WORKFLOW_INVALID") return badRequest("The workflow can't be read; reload the builder and try again");
  return serverError(fallback, error);
}
