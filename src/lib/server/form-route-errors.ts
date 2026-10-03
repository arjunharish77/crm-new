import { NextResponse } from "next/server";
import { badRequest, notFound, serverError, unauthorized } from "@/lib/server/http";

// Shared error mapping for the form draft, publish and version routes (decision 29).
export function formRouteError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : "";
  if (message === "UNAUTHORIZED") return unauthorized();
  if (message.startsWith("FEATURE_DISABLED")) return badRequest("Forms is not enabled for this workspace");
  if (message === "FORM_NOT_FOUND") return notFound("Form not found");
  if (message === "FORM_VERSION_NOT_FOUND") return notFound("That version doesn't exist");
  if (message === "FORM_ARCHIVED") return NextResponse.json({ message: "This form is archived. Restore it to make changes." }, { status: 409 });
  if (message === "FORM_NOTHING_TO_PUBLISH") return NextResponse.json({ message: "There are no unpublished changes." }, { status: 409 });
  if (message === "FORM_HAS_NO_FIELDS") return badRequest("Add at least one field before publishing");
  return serverError(fallback, error);
}
