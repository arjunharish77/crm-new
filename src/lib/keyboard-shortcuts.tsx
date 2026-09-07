'use client';

import * as React from 'react';
import { Keyboard } from 'lucide-react';
import { StandardDialog } from '@/components/common/standard-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

// Gap checklist Module 10's "keyboard shortcut system" -- a real, extensible registry rather
// than a fixed switch statement, so any page/dialog can contribute its own contextual shortcut
// (e.g. Cmd/Ctrl+S to save while a create form is open) without this file needing to know about
// every page in the app. Global shortcuts (search/command palette, this same help overlay) are
// registered once by the provider itself, below.

export type ShortcutCombo = {
    // A single KeyboardEvent.key value, e.g. "k", "?", "a" -- never a full combo string, so
    // matching stays a straightforward equality check (see matchesCombo).
    key: string;
    // Cmd on macOS, Ctrl elsewhere -- checked as `event.metaKey || event.ctrlKey`. Deliberately
    // one shared flag rather than separate meta/ctrl fields: a real cross-platform shortcut
    // needs exactly one of the two depending on OS, never a fixed literal key combo per platform.
    meta?: boolean;
    shift?: boolean;
};

export type ShortcutDefinition = {
    id: string;
    combo: ShortcutCombo;
    description: string;
    // Groups shortcuts in the help overlay -- "Global" for always-on ones, otherwise whatever
    // page/dialog registered it (e.g. "Leads", "Create Lead").
    group: string;
    handler: (event: KeyboardEvent) => void;
};

type RegisteredShortcut = ShortcutDefinition & { registeredAt: number };

interface KeyboardShortcutsContextValue {
    enabled: boolean;
    setEnabled: (enabled: boolean) => void;
    register: (shortcut: ShortcutDefinition) => () => void;
    setHelpOpen: (open: boolean) => void;
}

const KeyboardShortcutsContext = React.createContext<KeyboardShortcutsContextValue | null>(null);

const STORAGE_KEY = 'keyboard-shortcuts-enabled';

// "Conflict handling" / accessibility-safe focus behavior (WCAG 2.1.4, character key
// shortcuts): a bare or shift-only combo must never fire while the user is typing in a field --
// a screen-reader or keyboard user typing "a description" would otherwise get random letters
// hijacked into app-level actions. A Cmd/Ctrl-modified combo always fires regardless, matching
// every OS/browser's own convention (Cmd+S works inside a text field everywhere else too).
export function isTypingContext(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    const tag = target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

// Gap checklist Module 10's tests bullet -- "keyboard shortcut behavior." Extracted out of the
// onKeyDown closure below so the "most-recently-registered wins" conflict rule and the
// WCAG typing-context skip can be unit tested without a DOM/React tree.
export function resolveShortcutMatch<T extends ShortcutDefinition>(
    shortcuts: ReadonlyArray<T>,
    event: KeyboardEvent,
    typing: boolean,
): T | null {
    for (let i = shortcuts.length - 1; i >= 0; i -= 1) {
        const shortcut = shortcuts[i];
        if (!matchesCombo(event, shortcut.combo)) continue;
        if (typing && !shortcut.combo.meta) continue;
        return shortcut;
    }
    return null;
}

function isMac() {
    return typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
}

export function comboLabel(combo: ShortcutCombo): string {
    const mac = isMac();
    const parts: string[] = [];
    if (combo.meta) parts.push(mac ? '⌘' : 'Ctrl');
    if (combo.shift) parts.push(mac ? '⇧' : 'Shift');
    parts.push(combo.key.length === 1 ? combo.key.toUpperCase() : combo.key);
    return parts.join(mac ? '' : '+');
}

export function matchesCombo(event: KeyboardEvent, combo: ShortcutCombo): boolean {
    const hasModifier = event.metaKey || event.ctrlKey;
    if (!!combo.meta !== hasModifier) return false;
    if (!!combo.shift !== event.shiftKey) return false;
    return event.key.toLowerCase() === combo.key.toLowerCase();
}

export function KeyboardShortcutsProvider({ children }: { children: React.ReactNode }) {
    const [enabled, setEnabledState] = React.useState(true);
    const [helpOpen, setHelpOpen] = React.useState(false);
    const [shortcuts, setShortcuts] = React.useState<RegisteredShortcut[]>([]);

    // "Tenant/user enablement" -- a real per-user, persisted on/off switch (localStorage, same
    // per-browser-profile tier as this same module's DataTable density preference), surfaced as
    // a checkbox right inside the help overlay rather than a new settings page just for this one
    // toggle. Fully off means NOTHING here fires, including the help overlay's own "?" -- the
    // simplest, unambiguous reading of WCAG 2.1.4's "able to turn off character key shortcuts."
    React.useEffect(() => {
        try {
            const saved = window.localStorage.getItem(STORAGE_KEY);
            if (saved !== null) setEnabledState(saved !== 'false');
        } catch {
            // Private browsing / storage disabled -- shortcuts just stay enabled by default.
        }
    }, []);

    const setEnabled = React.useCallback((next: boolean) => {
        setEnabledState(next);
        try {
            window.localStorage.setItem(STORAGE_KEY, String(next));
        } catch {
            // Ignore -- the in-memory state still takes effect for this session.
        }
    }, []);

    const register = React.useCallback((shortcut: ShortcutDefinition) => {
        const entry: RegisteredShortcut = { ...shortcut, registeredAt: Date.now() };
        setShortcuts((current) => [...current, entry]);
        return () => {
            setShortcuts((current) => current.filter((item) => item !== entry));
        };
    }, []);

    // Built-in, always-on shortcut: "?" opens this same discoverability overlay -- "discoverable
    // shortcut help" (the checklist's own named sub-item), registered once here since it's
    // global by nature rather than owned by any one page.
    React.useEffect(() => {
        return register({
            id: 'shortcut-help',
            combo: { key: '?', shift: true },
            description: 'Show keyboard shortcuts',
            group: 'Global',
            handler: () => setHelpOpen(true),
        });
    }, [register]);

    React.useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (!enabled) return;
            const typing = isTypingContext(event.target);
            // Most-recently-registered shortcut wins on an exact combo collision -- "conflict
            // handling" -- so a page/dialog-scoped shortcut (registered after the global ones,
            // since it mounts later) can override a same-combo global default while it's on
            // screen, instead of silently double-firing or picking an arbitrary first match.
            const match = resolveShortcutMatch(shortcuts, event, typing);
            if (!match) return;
            event.preventDefault();
            match.handler(event);
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [enabled, shortcuts]);

    const value = React.useMemo<KeyboardShortcutsContextValue>(() => ({
        enabled,
        setEnabled,
        register,
        setHelpOpen,
    }), [enabled, setEnabled, register]);

    const groupedShortcuts = React.useMemo(() => {
        const groups = new Map<string, RegisteredShortcut[]>();
        for (const shortcut of shortcuts) {
            if (!groups.has(shortcut.group)) groups.set(shortcut.group, []);
            groups.get(shortcut.group)!.push(shortcut);
        }
        // "Global" always first, everything else alphabetical -- otherwise registration order
        // (mount order of whatever pages/dialogs happen to be open) would reorder the list.
        return [...groups.entries()].sort(([a], [b]) => (a === 'Global' ? -1 : b === 'Global' ? 1 : a.localeCompare(b)));
    }, [shortcuts]);

    return (
        <KeyboardShortcutsContext.Provider value={value}>
            {children}
            <StandardDialog
                open={helpOpen}
                onClose={() => setHelpOpen(false)}
                title="Keyboard Shortcuts"
                subtitle="Only shortcuts relevant to what's currently open on screen are listed below."
                icon={<Keyboard className="size-5" />}
                maxWidth="sm"
            >
                <div className="space-y-4 py-2">
                    <label className="flex items-center gap-2 text-sm">
                        <Checkbox checked={enabled} onCheckedChange={(checked) => setEnabled(!!checked)} />
                        <Label className="cursor-pointer font-normal">Enable keyboard shortcuts</Label>
                    </label>
                    {enabled && groupedShortcuts.map(([group, items]) => (
                        <div key={group} className="space-y-1.5">
                            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{group}</p>
                            <div className="space-y-1">
                                {items.map((shortcut) => (
                                    <div key={shortcut.id} className="flex items-center justify-between gap-3 text-sm">
                                        <span className="text-muted-foreground">{shortcut.description}</span>
                                        <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-xs">{comboLabel(shortcut.combo)}</kbd>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                    <div className="space-y-1 border-t pt-3">
                        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Always available</p>
                        <div className="flex items-center justify-between gap-3 text-sm">
                            <span className="text-muted-foreground">Close a dialog</span>
                            <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-xs">Esc</kbd>
                        </div>
                    </div>
                </div>
            </StandardDialog>
        </KeyboardShortcutsContext.Provider>
    );
}

// Registers a shortcut for as long as the calling component stays mounted (a create dialog while
// open, a list page for its lifetime) -- pass `null` to conditionally not register at all (e.g.
// only while a dialog's own `open` is true). The handler always reads the LATEST render's
// closure (via a ref), so registration itself only needs to re-run when the combo/id actually
// changes, not on every keystroke a form's own state causes.
export function useRegisterShortcut(definition: ShortcutDefinition | null) {
    const ctx = React.useContext(KeyboardShortcutsContext);
    const handlerRef = React.useRef(definition?.handler);
    handlerRef.current = definition?.handler;

    const comboKey = definition ? `${definition.id}|${definition.combo.key}|${!!definition.combo.meta}|${!!definition.combo.shift}` : null;

    React.useEffect(() => {
        if (!ctx || !definition) return undefined;
        return ctx.register({
            ...definition,
            handler: (event) => handlerRef.current?.(event),
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ctx, comboKey]);
}

export function useKeyboardShortcutsHelp() {
    const ctx = React.useContext(KeyboardShortcutsContext);
    return { openHelp: () => ctx?.setHelpOpen(true) };
}
