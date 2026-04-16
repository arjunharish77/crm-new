import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/server/auth";
import { unauthorized, badRequest } from "@/lib/server/http";
import { getObjectMetadata } from "@/lib/server/metadata";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ objectName: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return unauthorized();
  }

  const { objectName } = await params;
  const metadata = getObjectMetadata(objectName);

  if (!metadata) {
    return badRequest(`Unsupported object: ${objectName}`);
  }

  return NextResponse.json(metadata);
}
