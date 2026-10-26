import Link from "next/link";
import { Calculator, ClipboardCheck, Compass, Wallet, type LucideIcon } from "lucide-react";

// Tool shortcut tiles for the guides and articles hubs (Guides.dc.html L53-57), pointed at the
// tools the site really has (constraint 10).
const TOOLS: Record<"recommender" | "emi" | "total-cost" | "eligibility", { href: string; title: string; copy: string; Icon: LucideIcon }> = {
  recommender: { href: "/recommender", title: "Find my course", copy: "Programs that match your answers", Icon: Compass },
  emi: { href: "/tools/emi-calculator", title: "EMI calculator", copy: "Estimate your monthly payment", Icon: Calculator },
  "total-cost": { href: "/tools/total-cost", title: "Total cost planner", copy: "Tuition by applicant category", Icon: Wallet },
  eligibility: { href: "/tools/eligibility-checker", title: "Eligibility checker", copy: "Check published entry criteria", Icon: ClipboardCheck },
};

export function ToolTiles({ tools }: { tools: Array<keyof typeof TOOLS> }) {
  return <section className="uv-g-tools uv-reveal" aria-labelledby="hub-tools-title">
    <h2 id="hub-tools-title" className="sr-only">Learner tools</h2>
    <ul>
      {tools.map(key => {
        const { href, title, copy, Icon } = TOOLS[key];
        return <li key={key}>
          <Link href={href} className="uv-g-tool">
            <Icon size={32} aria-hidden="true" />
            <span><strong>{title}</strong><small>{copy}</small></span>
          </Link>
        </li>;
      })}
    </ul>
  </section>;
}
