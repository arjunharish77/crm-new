import { NextResponse } from "next/server";
import { ApiKeyAuthenticationError, authenticateApiKeyRequest, hasApiKeyPermission } from "@/lib/server/api-keys";
import { listOpportunityTypesForTenant } from "@/lib/server/crm";
import { apiKeyAuthErrorResponse, forbidden, serverError } from "@/lib/server/http";
export async function GET(request:Request){
 try{
  const {apiKey,tenantId}=await authenticateApiKeyRequest(request,{method:"GET",path:new URL(request.url).pathname,rawBody:""});
  if(!hasApiKeyPermission(apiKey.permissions,"opportunities","read")&&!hasApiKeyPermission(apiKey.permissions,"opportunities","create"))return forbidden("Opportunity read or create permission is required");
  return NextResponse.json(await listOpportunityTypesForTenant({id:apiKey.id,tenantId}));
 }catch(error){if(error instanceof ApiKeyAuthenticationError)return apiKeyAuthErrorResponse(error.reason);return serverError("Unable to list Opportunity types",error);}
}
