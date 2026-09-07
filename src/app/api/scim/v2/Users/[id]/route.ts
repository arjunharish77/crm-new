import { authenticateScim, scimErrorResponse, scimJson } from "@/lib/server/scim-http";
import { getScimUserById, replaceScimUser, patchScimUser, deleteScimUser } from "@/lib/server/scim";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  try {
    const ctx = await authenticateScim(request, "read");
    const { id } = await params;
    const result = await getScimUserById(ctx, id);
    return scimJson(result);
  } catch (error) {
    return scimErrorResponse(error);
  }
}

export async function PUT(request: Request, { params }: Params) {
  try {
    const ctx = await authenticateScim(request, "write");
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const result = await replaceScimUser(ctx, id, body);
    return scimJson(result);
  } catch (error) {
    return scimErrorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const ctx = await authenticateScim(request, "write");
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const operations = Array.isArray(body?.Operations) ? body.Operations : [];
    const result = await patchScimUser(ctx, id, operations);
    return scimJson(result);
  } catch (error) {
    return scimErrorResponse(error);
  }
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    const ctx = await authenticateScim(request, "write");
    const { id } = await params;
    await deleteScimUser(ctx, id);
    return new Response(null, { status: 204 });
  } catch (error) {
    return scimErrorResponse(error);
  }
}
