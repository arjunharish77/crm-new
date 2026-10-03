import type { AdminSession } from "@/lib/admin-auth";

export type CatalogRole = AdminSession["role"];
export type PublicationState = { status: string; isPublished: boolean };

export function canEditCatalog(role: CatalogRole, current?: PublicationState) {
  return role === "ADMIN" || (role === "EDITOR" && (!current ||
    (!current.isPublished && ["DRAFT", "NEEDS_REVIEW"].includes(current.status))));
}

export function catalogWriteError(role: CatalogRole, value: PublicationState) {
  if (role !== "ADMIN" && role !== "EDITOR") return "Your role has read-only catalog access.";
  if (role !== "ADMIN" && (value.isPublished || !["DRAFT", "NEEDS_REVIEW"].includes(value.status))) {
    return "Only administrators can publish, archive or change published content.";
  }
  return null;
}
