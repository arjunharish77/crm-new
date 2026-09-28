import { NextResponse } from "next/server";
import { buildApiKeyWriteActor, ApiKeyAuthenticationError, authenticateApiKeyRequest, hasApiKeyPermission } from "@/lib/server/api-keys";
import { combinedCreate, createApiRecords, validIdempotencyKey } from "@/lib/server/create-records";
import { apiKeyAuthErrorResponse, badRequest, forbidden, serverError } from "@/lib/server/http";
export async function POST(request:Request) {
 try {
  const rawBody=await request.text();
  const {apiKey,tenantId}=await authenticateApiKeyRequest(request,{method:"POST",path:new URL(request.url).pathname,rawBody});
  if(!hasApiKeyPermission(apiKey.permissions,"leads","create") || !hasApiKeyPermission(apiKey.permissions,"opportunities","create"))return forbidden("This API key needs create permission for both Leads and Opportunities");
  const input=combinedCreate.safeParse(JSON.parse(rawBody));
  if(!input.success)return badRequest(input.error.issues[0].message);
  const key=request.headers.get("idempotency-key");
  if(!key || !validIdempotencyKey(key))return badRequest("An Idempotency-Key of 1–200 printable characters is required");
  return NextResponse.json(await createApiRecords(await buildApiKeyWriteActor(apiKey,tenantId),"combined",input.data,key),{status:201});
 }catch(error){
  if(error instanceof ApiKeyAuthenticationError)return apiKeyAuthErrorResponse(error.reason);
  if(error instanceof SyntaxError)return badRequest("Request body must be valid JSON");
  if(error instanceof Error && error.message.startsWith("FEATURE_DISABLED"))return badRequest("Opportunities are not enabled for this workspace");
  return serverError("Unable to create Lead and Opportunity",error);
 }
}
