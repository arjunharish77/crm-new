import { loadCatalogSnapshot } from "@/lib/catalog-snapshot-server";
import { CatalogProvider } from "@/components/catalog-provider";
import { LeadWizardModal } from "@/components/lead-wizard-modal";

// Page-level ownership prevents Next's shared layouts from retaining an older client snapshot
// during navigation. The page, metadata and this boundary share the request-memoized reader.
export async function PublishedCatalogBoundary({children}:{children:React.ReactNode}) {
  const loaded=await loadCatalogSnapshot();
  if(!loaded.snapshot) throw new Error("Published catalog needs administrator review.");
  return <CatalogProvider snapshot={loaded.snapshot}>{children}<LeadWizardModal/></CatalogProvider>;
}
