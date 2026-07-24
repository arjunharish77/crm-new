'use client';

import React, { useEffect, useState } from 'react';
import { ExternalLink, Pencil } from 'lucide-react';
import Link from 'next/link';
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { apiFetch } from '@/lib/api';
import { toast } from 'sonner';
import { Activity } from '@/types/activities';
import { LeadContactCard } from '@/components/leads/lead-contact-card';
import { Timeline } from '@/components/timeline/timeline';

interface RecordPreviewProps {
    isOpen: boolean;
    onClose: () => void;
    entityType: 'lead' | 'opportunity' | 'activity';
    entityId: string | null;
}

const RESOURCE_PATHS: Record<RecordPreviewProps["entityType"], string> = {
    lead: "/dashboard/leads",
    opportunity: "/dashboard/opportunities",
    activity: "/dashboard/activities",
};

export function RecordPreview({ isOpen, onClose, entityType, entityId }: RecordPreviewProps) {
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [activities, setActivities] = useState<Activity[]>([]);

    useEffect(() => {
        if (isOpen && entityId) {
            loadData();
        } else {
            setData(null);
            setActivities([]);
        }
    }, [isOpen, entityId]);

    const loadData = async () => {
        if (!entityId) return;
        setLoading(true);
        try {
            if (entityType === 'lead') {
                const leadData = await apiFetch(`/leads/${entityId}`);
                setData(leadData);
                const filter = { logic: 'AND', conditions: [{ field: 'leadId', operator: 'equals', value: entityId }] };
                const acts: any = await apiFetch(`/activities?filters=${JSON.stringify(filter)}&limit=100`);
                setActivities(acts.data || []);
            }
        } catch (error) {
            toast.error("Failed to load details");
        } finally {
            setLoading(false);
        }
    };

    return (
        <Sheet open={isOpen} onOpenChange={(next) => !next && onClose()}>
            <SheetContent className="w-full gap-0 overflow-y-auto p-0 sm:max-w-[500px] md:max-w-[600px]">
                <SheetHeader className="flex-row items-center justify-between gap-3 border-b p-4">
                    <SheetTitle className="text-base">
                        {loading ? 'Loading...' : data?.name || 'Record Preview'}
                    </SheetTitle>
                    {data && (
                        <Button variant="ghost" size="icon-sm" asChild>
                            <Link href={`${RESOURCE_PATHS[entityType]}/${data.id}`} title="Open Full View">
                                <ExternalLink className="size-4" />
                            </Link>
                        </Button>
                    )}
                </SheetHeader>

                <div className="flex-1 overflow-y-auto">
                    {loading ? (
                        <div className="p-8 text-center">
                            <p className="text-sm text-muted-foreground">Loading record details...</p>
                        </div>
                    ) : data ? (
                        <Tabs defaultValue="details">
                            <div className="px-4 pt-2">
                                <TabsList className="grid w-full grid-cols-2">
                                    <TabsTrigger value="details">Details</TabsTrigger>
                                    <TabsTrigger value="timeline">Timeline</TabsTrigger>
                                </TabsList>
                            </div>

                            <TabsContent value="details" className="flex flex-col gap-6 p-4">
                                <div>
                                    <p className="mb-2 text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground">
                                        Primary Contact
                                    </p>
                                    <LeadContactCard lead={data} />
                                </div>

                                {data.company && (
                                    <div className="rounded-2xl border p-4">
                                        <p className="text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground">Company</p>
                                        <p className="mt-1 text-base font-semibold">{data.company}</p>
                                    </div>
                                )}

                                <div className="flex justify-end gap-2 border-t pt-4">
                                    <Button variant="outline">
                                        <Pencil className="size-4" />
                                        Edit
                                    </Button>
                                    <Button asChild>
                                        <Link href={`${RESOURCE_PATHS[entityType]}/${data.id}`}>
                                            <ExternalLink className="size-4" />
                                            Full Details
                                        </Link>
                                    </Button>
                                </div>
                            </TabsContent>
                            <TabsContent value="timeline" className="p-4">
                                <Timeline activities={activities} />
                            </TabsContent>
                        </Tabs>
                    ) : (
                        <div className="p-8 text-center">
                            <p className="text-sm text-muted-foreground">No data found</p>
                        </div>
                    )}
                </div>
            </SheetContent>
        </Sheet>
    );
}
