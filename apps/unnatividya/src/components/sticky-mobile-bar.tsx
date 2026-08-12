import Link from "next/link";

type BarAction = { label: string; href: string; openLead?: boolean; external?: boolean };

function BarLink({ action, variant }: { action: BarAction; variant: "primary" | "secondary" }) {
  return (
    <Link
      href={action.href}
      data-open-lead={action.openLead ? true : undefined}
      target={action.external ? "_blank" : undefined}
      rel={action.external ? "noopener noreferrer" : undefined}
      className={`btn ${variant}`}
      style={{ display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}
    >
      {action.label}
    </Link>
  );
}

// Full-width sticky bottom bar shown only on mobile (see .uv-mobile-action-bar in globals.css),
// on the specific conversion pages that render one. Desktop keeps the generic floating pair in
// sticky-ctas.tsx -- this replaces it on mobile for those pages only.
export function StickyMobileBar({ primary, secondary }: { primary: BarAction; secondary?: BarAction }) {
  return (
    <div className="uv-mobile-action-bar" aria-label="Quick actions">
      {secondary ? <BarLink action={secondary} variant="secondary" /> : null}
      <BarLink action={primary} variant="primary" />
    </div>
  );
}
