import { scimJson } from "@/lib/server/scim-http";

// Deliberately minimal, honest schema listing -- named/documented attribute set that this
// implementation actually reads and writes (see scim.ts), not the full RFC 7643 core schema
// with every optional attribute this app doesn't model.
export async function GET() {
  return scimJson({
    schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
    totalResults: 2,
    Resources: [
      {
        id: "urn:ietf:params:scim:schemas:core:2.0:User",
        name: "User",
        attributes: [
          { name: "userName", type: "string", required: true, uniqueness: "server" },
          { name: "name", type: "complex" },
          { name: "displayName", type: "string" },
          { name: "emails", type: "complex", multiValued: true },
          { name: "active", type: "boolean" },
          { name: "externalId", type: "string" },
          { name: "roles", type: "complex", multiValued: true },
        ],
      },
      {
        id: "urn:ietf:params:scim:schemas:core:2.0:Group",
        name: "Group",
        attributes: [
          { name: "displayName", type: "string", required: true },
          { name: "members", type: "complex", multiValued: true },
          { name: "externalId", type: "string" },
        ],
      },
    ],
  });
}
