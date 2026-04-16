import { NextResponse } from "next/server";
import { getPublicForm } from "@/lib/server/crm";
import { serverError } from "@/lib/server/http";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ identifier: string }> }
) {
  try {
    const { identifier } = await params;
    const form = await getPublicForm(identifier);
    return NextResponse.json(form);
  } catch {
    return serverError("Failed to load public form");
  }
}
