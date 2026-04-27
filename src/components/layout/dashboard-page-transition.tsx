"use client";

import { AnimatePresence } from "framer-motion";
import { PageTransition } from "@/components/ui-mui/m3-components";

export default function DashboardPageTransition({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AnimatePresence mode="wait">
      <PageTransition key="dashboard-content">
        {children}
      </PageTransition>
    </AnimatePresence>
  );
}