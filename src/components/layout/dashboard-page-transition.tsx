"use client";

import { AnimatePresence } from "framer-motion";
import { PageTransition } from "@/components/ui/page-transition";

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
