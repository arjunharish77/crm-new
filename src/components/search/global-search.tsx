"use client";

import { useEffect, useState } from "react";
import { Command } from "cmdk";
import { Search, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { Dialog, DialogContent } from "@/components/ui/dialog";

interface SearchResult {
    id: string;
    type: 'lead' | 'opportunity' | 'activity';
    name?: string; // Lead
    title?: string; // Opportunity
    notes?: string; // Activity
    company?: string;
    amount?: number;
}

export function GlobalSearch({
    open,
    onOpenChange,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}) {
    const router = useRouter();
    const [query, setQuery] = useState("");
    const [loading, setLoading] = useState(false);
    const [results, setResults] = useState<{
        leads: SearchResult[];
        opportunities: SearchResult[];
        activities: SearchResult[];
    }>({ leads: [], opportunities: [], activities: [] });

    useEffect(() => {
        if (!query || query.length < 2) {
            setResults({ leads: [], opportunities: [], activities: [] });
            return;
        }

        const debounce = setTimeout(async () => {
            setLoading(true);
            try {
                const data = await apiFetch(`/search?q=${encodeURIComponent(query)}`);
                setResults(data);
            } catch (error) {
                console.error(error);
            } finally {
                setLoading(false);
            }
        }, 300);

        return () => clearTimeout(debounce);
    }, [query]);

    const handleSelect = (id: string, type: string) => {
        onOpenChange(false);
        if (type === 'lead') router.push(`/dashboard/leads/${id}`);
        if (type === 'opportunity') router.push(`/dashboard/opportunities/${id}`);
        if (type === 'activity') router.push(`/dashboard/activities`); // No detail page for activity yet
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="p-0 overflow-hidden max-w-2xl bg-popover text-popover-foreground">
                <Command className="[&_[cmdk-item]]:px-4 [&_[cmdk-item]]:py-3 [&_[cmdk-item]]:cursor-pointer [&_[cmdk-item][aria-selected='true']]:bg-accent [&_[cmdk-item][aria-selected='true']]:text-accent-foreground">
                    <div className="flex items-center border-b px-3">
                        <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                        <Command.Input
                            className="flex h-12 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
                            placeholder="Type a command or search..."
                            value={query}
                            onValueChange={setQuery}
                        />
                        {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground mr-2" />}
                    </div>
                    <Command.List className="max-h-[300px] overflow-y-auto overflow-x-hidden">
                        <Command.Empty>No results found.</Command.Empty>

                        {results.leads.length > 0 && (
                            <Command.Group heading="Leads" className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                                {results.leads.map((lead) => (
                                    <Command.Item
                                        key={lead.id}
                                        value={lead.name}
                                        onSelect={() => handleSelect(lead.id, 'lead')}
                                    >
                                        <div className="flex flex-col">
                                            <span className="font-medium">{lead.name}</span>
                                            <span className="text-xs text-muted-foreground">{lead.company}</span>
                                        </div>
                                    </Command.Item>
                                ))}
                            </Command.Group>
                        )}

                        {results.opportunities.length > 0 && (
                            <Command.Group heading="Opportunities" className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                                {results.opportunities.map((opp) => (
                                    <Command.Item
                                        key={opp.id}
                                        value={opp.title}
                                        onSelect={() => handleSelect(opp.id, 'opportunity')}
                                    >
                                        <div className="flex flex-col">
                                            <span className="font-medium">{opp.title}</span>
                                            <span className="text-xs text-muted-foreground">
                                                {opp.amount ? `$${opp.amount}` : ''}
                                            </span>
                                        </div>
                                    </Command.Item>
                                ))}
                            </Command.Group>
                        )}

                        {results.activities.length > 0 && (
                            <Command.Group heading="Activities" className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                                {results.activities.map((act) => (
                                    <Command.Item
                                        key={act.id}
                                        value={act.notes}
                                        onSelect={() => handleSelect(act.id, 'activity')}
                                    >
                                        <div className="flex flex-col">
                                            <span className="font-medium truncate max-w-[400px]">
                                                {act.notes?.substring(0, 50)}
                                            </span>
                                            <span className="text-xs text-muted-foreground">Activity</span>
                                        </div>
                                    </Command.Item>
                                ))}
                            </Command.Group>
                        )}
                    </Command.List>
                </Command>
            </DialogContent>
        </Dialog>
    );
}
