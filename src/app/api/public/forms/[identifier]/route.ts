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
    if (!form) return NextResponse.json({ message: "Form not found" }, { status: 404 });
    return NextResponse.json(form);
  } catch (error) {
    return serverError("Failed to load public form", error);
  }
}
