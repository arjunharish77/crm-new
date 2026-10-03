"use client";

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { titleForPath } from "@/lib/page-titles";

// Sets the browser tab title from the route (UI/UX plan G2). Record pages add the record's name
// with useRecordTitle; the name is tied to the path it was set on, so it never leaks into the
// next page's title.
const RecordTitleContext = createContext<(name: string | null) => void>(() => undefined);

export function PageTitleProvider({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const [record, setRecord] = useState<{ path: string; name: string } | null>(null);

    useEffect(() => {
        document.title = titleForPath(pathname, record?.path === pathname ? record.name : null);
    }, [pathname, record]);

    const setRecordTitle = useCallback((name: string | null) => {
        setRecord(name ? { path: window.location.pathname, name } : null);
    }, []);

    return <RecordTitleContext.Provider value={setRecordTitle}>{children}</RecordTitleContext.Provider>;
}

export function useRecordTitle(name: string | null | undefined) {
    const setRecordTitle = useContext(RecordTitleContext);
    useEffect(() => {
        const trimmed = typeof name === "string" ? name.trim() : "";
        setRecordTitle(trimmed || null);
        return () => setRecordTitle(null);
    }, [name, setRecordTitle]);
}
