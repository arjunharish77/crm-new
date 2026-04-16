"use client";

import * as React from "react";
import {
    Calculator,
    Calendar,
    CreditCard,
    Settings,
    Smile,
    User,
    LayoutDashboard,
    Users,
    Target,
    Activity,
    Plus,
    Search
} from "lucide-react";

import {
    CommandDialog,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
    CommandSeparator,
} from "@/components/ui/command";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

// We need a wrapper because cmdk needs styling. 
// I'll create a styled wrapper components here or just put classes directly.
// Let's use shadcn/ui command wrapper if available or build custom one.
// Since I don't see shadcn command in codebase, I will implement a styled version here.

export function CommandMenu() {
    const [open, setOpen] = React.useState(false);
    const router = useRouter();

    React.useEffect(() => {
        const down = (e: KeyboardEvent) => {
            if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                setOpen((open) => !open);
            }
        };

        document.addEventListener("keydown", down);
        return () => document.removeEventListener("keydown", down);
    }, []);

    const runCommand = React.useCallback((command: () => unknown) => {
        setOpen(false);
        command();
    }, []);

    return (
        // cmdk Dialog handles the modal overlay
        <CommandDialog
            open={open}
            onOpenChange={setOpen}
        // Since cmdk 1.0, styling is done via classes on the primitive components
        // But the Dialog component from cmdk renders into a portal usually.
        // We might need to style the overlay and content manually if not using shadcn's wrapper.
        // Let's assume basic rendering works and add tailwind classes.
        >
            <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh] bg-black/50 backdrop-blur-sm">
                <div className="w-full max-w-2xl bg-white dark:bg-zinc-900 rounded-lg shadow-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800">
                    <div className="flex items-center border-b px-3">
                        <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                        <CommandInput
                            placeholder="Type a command or search..."
                            className="flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
                        />
                    </div>

                    <CommandList className="max-h-[300px] overflow-y-auto overflow-x-hidden p-2">
                        <CommandEmpty className="py-6 text-center text-sm">No results found.</CommandEmpty>

                        <CommandGroup heading="Suggestions" className="text-xs font-medium text-muted-foreground px-2 py-1.5">
                            <CommandItem
                                onSelect={() => runCommand(() => router.push('/dashboard/leads'))}
                                className="active:bg-zinc-100 dark:active:bg-zinc-800 flex items-center px-2 py-2 rounded-sm cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800"
                            >
                                <Users className="mr-2 h-4 w-4" />
                                <span>Leads</span>
                            </CommandItem>
                            <CommandItem
                                onSelect={() => runCommand(() => router.push('/dashboard/opportunities'))}
                                className="flex items-center px-2 py-2 rounded-sm cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800"
                            >
                                <Target className="mr-2 h-4 w-4" />
                                <span>Opportunities</span>
                            </CommandItem>
                            <CommandItem
                                onSelect={() => runCommand(() => router.push('/dashboard/activities'))}
                                className="flex items-center px-2 py-2 rounded-sm cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800"
                            >
                                <Activity className="mr-2 h-4 w-4" />
                                <span>Activities</span>
                            </CommandItem>
                        </CommandGroup>

                        <CommandSeparator className="h-px bg-zinc-200 dark:bg-zinc-800 my-1" />

                        <CommandGroup heading="Quick Actions" className="text-xs font-medium text-muted-foreground px-2 py-1.5">
                            <CommandItem
                                onSelect={() => runCommand(() => console.log('Create Lead'))}
                                className="flex items-center px-2 py-2 rounded-sm cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800"
                            >
                                <Plus className="mr-2 h-4 w-4" />
                                <span>Create New Lead</span>
                                <span className="ml-auto text-xs tracking-widest text-muted-foreground">⌘L</span>
                            </CommandItem>
                        </CommandGroup>

                        <CommandSeparator className="h-px bg-zinc-200 dark:bg-zinc-800 my-1" />

                        <CommandGroup heading="Settings" className="text-xs font-medium text-muted-foreground px-2 py-1.5">
                            <CommandItem
                                onSelect={() => runCommand(() => router.push('/dashboard/settings'))}
                                className="flex items-center px-2 py-2 rounded-sm cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800"
                            >
                                <Settings className="mr-2 h-4 w-4" />
                                <span>Settings</span>
                                <span className="ml-auto text-xs tracking-widest text-muted-foreground">⌘S</span>
                            </CommandItem>
                        </CommandGroup>
                    </CommandList>
                </div>
            </div>
        </CommandDialog>
    );
}
