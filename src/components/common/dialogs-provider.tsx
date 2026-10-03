"use client";

import React, { createContext, useContext } from "react";
import { useConfirmDialog, type ConfirmRequest } from "@/components/common/confirm-dialog";
import { useReasonDialog, type ReasonRequest } from "@/components/common/reason-dialog";

// App-wide confirm and text-input dialogs, so any component can `await` one without rendering
// its own dialog element -- the replacement for window.confirm / window.prompt (UI/UX plan
// §11.7, Phase 1). Mounted once in the root layout.
type Dialogs = {
    confirm: (request: ConfirmRequest) => Promise<boolean>;
    askText: (request: ReasonRequest) => Promise<string | null>;
};

const DialogsContext = createContext<Dialogs | null>(null);

export function DialogsProvider({ children }: { children: React.ReactNode }) {
    const [confirmDialog, confirm] = useConfirmDialog();
    const [textDialog, askText] = useReasonDialog();
    const value = React.useMemo(() => ({ confirm, askText }), [confirm, askText]);
    return (
        <DialogsContext.Provider value={value}>
            {children}
            {confirmDialog}
            {textDialog}
        </DialogsContext.Provider>
    );
}

function useDialogs() {
    const dialogs = useContext(DialogsContext);
    if (!dialogs) throw new Error("useConfirm/useAskText must be used inside DialogsProvider");
    return dialogs;
}

export function useConfirm() {
    return useDialogs().confirm;
}

export function useAskText() {
    return useDialogs().askText;
}
