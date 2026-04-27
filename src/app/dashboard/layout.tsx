import DashboardLayout from "@/components/layout/dashboard-layout";
import DashboardPageTransition from "@/components/layout/dashboard-page-transition";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardLayout>
      <DashboardPageTransition>
        {children}
      </DashboardPageTransition>
    </DashboardLayout>
  );
}