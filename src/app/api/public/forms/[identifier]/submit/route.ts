import { NextResponse } from "next/server";
import { submitPublicForm } from "@/lib/server/crm";
import { badRequest, serverError } from "@/lib/server/http";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ identifier: string }> }
) {
  try {
    const { identifier } = await params;
    const body = await request.json().catch(() => null);
    if (!body) return badRequest("Submission payload is required");
    const result = await submitPublicForm(identifier, body);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "FORM_NOT_FOUND") {
      return badRequest("Form not found");
    }
    if (error instanceof Error && error.message === "FORM_INACTIVE") {
      return badRequest("This form is currently inactive");
    }
    return serverError("Failed to submit form");
  }
}
