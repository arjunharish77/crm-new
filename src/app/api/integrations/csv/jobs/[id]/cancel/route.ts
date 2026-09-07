import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { badRequest, serverError, unauthorized } from "@/lib/server/http";
import { cancelImportJob } from "@/lib/server/crm";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser(request);
    const { id } = await params;
    const job = await cancelImportJob(user, id);
    return NextResponse.json(job);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "IMPORT_JOB_NOT_CANCELLABLE") {
      return badRequest("This import can no longer be cancelled");
    }
    return serverError("Failed to cancel import", error);
  }
}
