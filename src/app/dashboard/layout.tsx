import DashboardLayout from "@/components/layout/dashboard-layout";

// No page transition (UI/UX plan §3.4): the old full-page fade and slide on every route slowed
// navigation for heavy users and remounted the page content on each pathname change.
export default function Layout({ children }: { children: React.ReactNode }) {
  return <DashboardLayout>{children}</DashboardLayout>;
}
