"use client";

import { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet";
import { Chip } from "@mui/material";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Mail, Phone, Calendar, MapPin, Tag, Building, ArrowUpRight } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { Lead } from "@/types/leads";
import { ScrollArea } from "@/components/ui/scroll-area";
import Link from "next/link";
import { Skeleton, Stack, Box } from "@mui/material";
import { RecordHistory } from "@/components/governance/record-history";

interface LeadQuickViewProps {
    leadId: string | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function LeadQuickView({ leadId, open, onOpenChange }: LeadQuickViewProps) {
    const [lead, setLead] = useState<Lead | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (open && leadId) {
            setLoading(true);
            apiFetch(`/leads/${leadId}`)
                .then((data) => setLead(data))
                .catch((err) => console.error(err))
                .finally(() => setLoading(false));
        } else {
            setLead(null);
        }
    }, [open, leadId]);

    if (!open) return null;

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent className="w-[400px] sm:w-[540px] overflow-y-auto">
                {loading || !lead ? (
                    <Stack spacing={2} sx={{ mt: 8 }}>
                        <Skeleton variant="rectangular" height={120} sx={{ borderRadius: 2 }} />
                        <Skeleton variant="rectangular" height={120} sx={{ borderRadius: 2 }} />
                    </Stack>
                ) : (
                    <div className="h-full flex flex-col">
                        <SheetHeader className="pb-4">
                            <div className="flex justify-between items-start">
                                <div>
                                    <SheetTitle className="text-xl">{lead.name}</SheetTitle>
                                    <SheetDescription className="mt-1">
                                        {/* lead.title removed from schema */}
                                        {lead.email}
                                    </SheetDescription>
                                </div>
                                <Chip
                                    label={lead.status}
                                    color={lead.status === "NEW" ? "primary" : "default"}
                                    size="small"
                                    sx={{ fontWeight: 600 }}
                                />
                            </div>
                            <div className="flex gap-2 mt-4">
                                <Link href={`/dashboard/leads/${lead.id}`} className="w-full">
                                    <Button className="w-full">
                                        View Full Profile <ArrowUpRight className="ml-2 h-4 w-4" />
                                    </Button>
                                </Link>
                            </div>
                        </SheetHeader>

                        <Tabs defaultValue="details" className="flex-1 mt-4">
                            <TabsList className="grid w-full grid-cols-2">
                                <TabsTrigger value="details">Details</TabsTrigger>
                                <TabsTrigger value="activity">Recent Activity</TabsTrigger>
                            </TabsList>
                            <TabsContent value="details" className="mt-4 space-y-6">
                                {/* Contact Info */}
                                <div className="space-y-3">
                                    <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Contact</h4>
                                    <div className="grid gap-2">
                                        {lead.email && (
                                            <div className="flex items-center gap-2 text-sm">
                                                <Mail className="h-4 w-4 text-muted-foreground" />
                                                <a href={`mailto:${lead.email}`} className="hover:underline">{lead.email}</a>
                                            </div>
                                        )}
                                        {lead.phone && (
                                            <div className="flex items-center gap-2 text-sm">
                                                <Phone className="h-4 w-4 text-muted-foreground" />
                                                <a href={`tel:${lead.phone}`} className="hover:underline">{lead.phone}</a>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <Separator />

                                {/* Info */}
                                <div className="space-y-3">
                                    <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Information</h4>
                                    <div className="grid grid-cols-2 gap-4 text-sm">
                                        <div>
                                            <span className="text-muted-foreground block mb-1">Source</span>
                                            <span className="font-medium">{lead.source}</span>
                                        </div>
                                        <div>
                                            <span className="text-muted-foreground block mb-1">Created</span>
                                            <span className="font-medium">{formatDistanceToNow(new Date(lead.createdAt), { addSuffix: true })}</span>
                                        </div>
                                    </div>
                                </div>

                                <Separator />

                                {/* Tags */}
                                {lead.tags && lead.tags.length > 0 && (
                                    <div className="space-y-3">
                                        <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Tags</h4>
                                        <div className="flex flex-wrap gap-2">
                                            {lead.tags.map(tag => (
                                                <Chip
                                                    key={tag}
                                                    label={tag}
                                                    icon={<Tag size={12} />}
                                                    variant="outlined"
                                                    size="small"
                                                    sx={{ height: 24, fontSize: '0.75rem' }}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </TabsContent>

                            <TabsContent value="activity" className="min-h-[400px]">
                                <ScrollArea className="h-full pr-4">
                                    <Box sx={{ py: 2 }}>
                                        <RecordHistory entityType="LEAD" entityId={lead.id} />
                                    </Box>
                                </ScrollArea>
                            </TabsContent>
                        </Tabs>
                    </div>
                )
                }
            </SheetContent >
        </Sheet >
    );
}
