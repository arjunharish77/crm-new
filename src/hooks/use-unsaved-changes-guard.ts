"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useConfirm } from "@/components/common/dialogs-provider";

// Builders with unsaved work (UI/UX plan §5.12): the browser asks before the tab is closed or
// reloaded, and clicking a link inside the app asks before leaving. The browser's own Back
// button can't be stopped in the App Router; closing and reloading can.
export function useUnsavedChangesGuard(dirty: boolean, what = "your changes") {
    const router = useRouter();
    const confirm = useConfirm();
    const state = useRef({ dirty, what });
    useEffect(() => { state.current = { dirty, what }; }, [dirty, what]);

    useEffect(() => {
        if (!dirty) return;
        const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
        window.addEventListener("beforeunload", warn);
        return () => window.removeEventListener("beforeunload", warn);
    }, [dirty]);

    useEffect(() => {
        // Capture phase on the document runs before Next's Link handler on the React root.
        const onClick = (event: MouseEvent) => {
            if (!state.current.dirty || event.defaultPrevented || event.button !== 0) return;
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            const anchor = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
            if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
            const url = new URL(anchor.href, window.location.href);
            if (url.origin !== window.location.origin) return;
            if (url.pathname === window.location.pathname && url.search === window.location.search) return;
            event.preventDefault();
            event.stopPropagation();
            confirm({
                title: "Leave without saving?",
                description: `You'll lose ${state.current.what}.`,
                confirmLabel: "Leave without saving",
                cancelLabel: "Stay",
                destructive: true,
            }).then((leave) => {
                if (!leave) return;
                state.current.dirty = false;
                router.push(url.pathname + url.search + url.hash);
            });
        };
        document.addEventListener("click", onClick, true);
        return () => document.removeEventListener("click", onClick, true);
    }, [confirm, router]);
}
