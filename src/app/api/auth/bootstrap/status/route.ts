import { NextResponse } from "next/server";
import { getBootstrapStatus } from "@/lib/server/admin";
import { serverError } from "@/lib/server/http";

export async function GET() {
  try {
    const status = await getBootstrapStatus();
    return NextResponse.json(status);
  } catch {
    return serverError("Failed to check bootstrap status");
  }
}
