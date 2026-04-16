"use client";

import { useEffect, useState } from "react";
import { Command } from "cmdk";
import {
    LayoutDashboard,
    Users,
    Target,
    Activity,
    Plus,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent } from "@/components/ui/dialog";

export function QuickCreateMenu({
    open,
    onOpenChange,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}) {
    const router = useRouter();

    const runCommand = (command: () => void) => {
        onOpenChange(false);
        command();
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="p-0 overflow-hidden max-w-lg bg-popover text-popover-foreground">
                <Command className="[&_[cmdk-grooup-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item]]:h-12 [&_[cmdk-item]]:cursor-pointer [&_[cmdk-item][aria-selected='true']]:bg-accent [&_[cmdk-item][aria-selected='true']]:text-accent-foreground">
                    <Command.Input placeholder="Type a command or search..." className="flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 border-b px-3" />
                    <Command.List className="max-h-[300px] overflow-y-auto overflow-x-hidden p-2">
                        <Command.Empty>No results found.</Command.Empty>
                        <Command.Group heading="Create">
                            <Command.Item
                                onSelect={() => runCommand(() => router.push("/dashboard/leads?create=true"))}
                            >
                                <Users className="mr-2 h-4 w-4" />
                                <span>Create Lead</span>
                                <span className="ml-auto text-xs tracking-widest text-muted-foreground">C L</span>
                            </Command.Item>
                            <Command.Item
                                onSelect={() => runCommand(() => router.push("/dashboard/opportunities?create=true"))}
                            >
                                <Target className="mr-2 h-4 w-4" />
                                <span>Create Opportunity</span>
                                <span className="ml-auto text-xs tracking-widest text-muted-foreground">C O</span>
                            </Command.Item>
                            <Command.Item
                                onSelect={() => runCommand(() => router.push("/dashboard/activities?create=true"))}
                            >
                                <Activity className="mr-2 h-4 w-4" />
                                <span>Log Activity</span>
                                <span className="ml-auto text-xs tracking-widest text-muted-foreground">C A</span>
                            </Command.Item>
                        </Command.Group>
                        <Command.Separator />
                        <Command.Group heading="Navigation">
                            <Command.Item
                                onSelect={() => runCommand(() => router.push("/dashboard"))}
                            >
                                <LayoutDashboard className="mr-2 h-4 w-4" />
                                <span>Dashboard</span>
                                <span className="ml-auto text-xs tracking-widest text-muted-foreground">G D</span>
                            </Command.Item>
                            <Command.Item
                                onSelect={() => runCommand(() => router.push("/dashboard/leads"))}
                            >
                                <Users className="mr-2 h-4 w-4" />
                                <span>Go to Leads</span>
                                <span className="ml-auto text-xs tracking-widest text-muted-foreground">G L</span>
                            </Command.Item>
                            <Command.Item
                                onSelect={() => runCommand(() => router.push("/dashboard/opportunities"))}
                            >
                                <Target className="mr-2 h-4 w-4" />
                                <span>Go to Opportunities</span>
                                <span className="ml-auto text-xs tracking-widest text-muted-foreground">G O</span>
                            </Command.Item>
                        </Command.Group>
                    </Command.List>
                </Command>
            </DialogContent>
        </Dialog>
    );
}
