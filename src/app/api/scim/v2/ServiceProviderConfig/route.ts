import { scimJson } from "@/lib/server/scim-http";

// Static capability discovery document (RFC 7643 §5) -- a real IdP's SCIM connector setup
// wizard (Okta, Azure AD) queries this before doing anything else, and several fail their
// connection test outright if it's missing. No tenant data here, so unlike every other SCIM
// route this one is intentionally NOT behind bearer auth -- matches how a SCIM server's own
// discovery documents are conventionally reachable pre-authentication.
export async function GET() {
  return scimJson({
    schemas: ["urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig"],
    patch: { supported: true },
    bulk: { supported: false, maxOperations: 0, maxPayloadSize: 0 },
    filter: { supported: true, maxResults: 200 },
    changePassword: { supported: false },
    sort: { supported: false },
    etag: { supported: false },
    authenticationSchemes: [
      {
        type: "oauthbearertoken",
        name: "Bearer Token",
        description: "Authentication via an API key (keyId.secret) issued from Settings > API Keys, sent as a Bearer token",
        primary: true,
      },
    ],
  });
}
