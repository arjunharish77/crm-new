"use client";

import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";

export function RecordSummary({ children }: { children: ReactNode }) {
    const [open, setOpen] = useState(false);
    const id = useId();
    return <div className="min-w-0 self-start">
        <Button variant="outline" className="w-full justify-between lg:hidden" aria-controls={id} aria-expanded={open} onClick={() => setOpen(!open)}>
            Record properties & guidance <ChevronDown className="size-4" />
        </Button>
        <div id={id} className={`${open ? "flex" : "hidden"} mt-3 min-w-0 flex-col gap-3 lg:mt-0 lg:flex`}>
            {children}
        </div>
    </div>;
}
