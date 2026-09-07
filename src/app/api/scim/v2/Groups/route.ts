import { authenticateScim, parseListParams, scimErrorResponse, scimJson } from "@/lib/server/scim-http";
import { listScimGroups, createScimGroup } from "@/lib/server/scim";

export async function GET(request: Request) {
  try {
    const ctx = await authenticateScim(request, "read");
    const url = new URL(request.url);
    const result = await listScimGroups(ctx, parseListParams(url));
    return scimJson(result);
  } catch (error) {
    return scimErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await authenticateScim(request, "write");
    const body = await request.json().catch(() => ({}));
    const result = await createScimGroup(ctx, body);
    return scimJson(result, 201);
  } catch (error) {
    return scimErrorResponse(error);
  }
}
