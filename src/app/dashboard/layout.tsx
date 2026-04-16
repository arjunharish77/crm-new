import DashboardLayout from "@/components/layout/dashboard-layout";
import { AnimatePresence } from "framer-motion";
import { PageTransition } from "@/components/ui-mui/m3-components";

export default function Layout({ children }: { children: React.ReactNode }) {
    return (
        <DashboardLayout>
            <AnimatePresence mode="wait">
                <PageTransition key="dashboard-content">
                    {children}
                </PageTransition>
            </AnimatePresence>
        </DashboardLayout>
    );
}
