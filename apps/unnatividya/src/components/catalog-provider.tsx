"use client";
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { catalogReader, type CatalogReader } from "@/lib/catalog-reader";
import type { CatalogSnapshot } from "@/lib/catalog-snapshot";
const CatalogContext=createContext<CatalogReader|null>(null);
export function CatalogProvider({snapshot,children}:{snapshot:CatalogSnapshot;children:ReactNode}) {
  const reader=useMemo(()=>catalogReader(snapshot),[snapshot]);
  return <CatalogContext.Provider value={reader}>{children}</CatalogContext.Provider>;
}
export function useCatalog() {
  const value=useContext(CatalogContext);
  if(!value) throw new Error("Published catalog provider is missing.");
  return value;
}
