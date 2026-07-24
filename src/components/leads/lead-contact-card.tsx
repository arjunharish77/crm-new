'use client';

import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
    Phone,
    Mail,
    Copy,
    Plus,
    History,
    Building2,
} from 'lucide-react';
import { toast } from 'sonner';
import { fadeInUp } from '@/lib/motion';
import { apiFetch } from '@/lib/api';
import { cn } from '@/lib/utils';

interface LeadContactCardProps {
    lead: {
        id: string;
        name: string;
        email?: string | null;
        phone?: string | null;
        company?: string | null;
        status: string;
    };
    onCreateActivity?: () => void;
    onCreateOpportunity?: () => void;
}

// Same status -> tone mapping convention used in leads/columns.tsx (M3 tokens,
// no dedicated "success" role in this theme, so the qualified/contacted state
// reuses "tertiary" the way the columns table does for CONVERTED).
function getStatusClassName(status: string): string {
    const s = status.toLowerCase();
    if (s === 'new') return 'bg-primary/8 text-primary border-primary/20';
    if (s === 'qualified' || s === 'contacted') return 'bg-tertiary/12 text-tertiary border-tertiary/25';
    return 'bg-muted text-muted-foreground border-border';
}

export function LeadContactCard({ lead, onCreateActivity, onCreateOpportunity }: LeadContactCardProps) {
    const copyToClipboard = async (text: string, label: string) => {
        try {
            await navigator.clipboard.writeText(text);
            toast.success(`${label} copied to clipboard!`);
        } catch (error) {
            toast.error('Failed to copy to clipboard');
        }
    };

    const statusClassName = getStatusClassName(lead.status);

    return (
        <motion.div initial="initial" animate="animate" variants={fadeInUp}>
            <Card className="gap-0 rounded-2xl border bg-surface-container-lowest py-0 transition-all duration-300 hover:border-primary/30 hover:shadow-[0_8px_32px_rgba(0,0,0,0.06)]">
                {/* Header */}
                <div className="border-b border-border/50 p-3">
                    <div className="flex items-start justify-between">
                        <div>
                            <h3 className="mb-0.5 text-lg font-extrabold tracking-tight">
                                {lead.name}
                            </h3>
                            {lead.company && (
                                <div className="flex items-center gap-1.5 text-muted-foreground">
                                    <Building2 className="size-3.5" />
                                    <span className="text-sm font-medium">{lead.company}</span>
                                </div>
                            )}
                        </div>
                        <Badge
                            variant="outline"
                            className={cn("h-5 text-[0.625rem] font-extrabold uppercase tracking-wide", statusClassName)}
                        >
                            {lead.status}
                        </Badge>
                    </div>
                </div>

                {/* Contact Info */}
                <CardContent className="p-3">
                    <div className="flex flex-col gap-[9px]">
                        {lead.email && (
                            <div className="group flex items-center justify-between">
                                <div className="flex min-w-0 flex-1 items-center gap-3">
                                    <div className="flex rounded-[7px] bg-surface-container-high p-[5px] text-muted-foreground">
                                        <Mail className="size-[15px]" />
                                    </div>
                                    <a
                                        href={`mailto:${lead.email}`}
                                        className="truncate text-sm font-bold text-foreground no-underline hover:text-primary"
                                    >
                                        {lead.email}
                                    </a>
                                </div>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button
                                            size="icon-sm"
                                            variant="ghost"
                                            onClick={() => copyToClipboard(lead.email!, 'Email')}
                                            className="ml-1 opacity-0 transition-opacity group-hover:opacity-100"
                                        >
                                            <Copy className="size-4" />
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Copy Email</TooltipContent>
                                </Tooltip>
                            </div>
                        )}

                        {lead.phone && (
                            <div className="group flex items-center justify-between">
                                <div className="flex min-w-0 flex-1 items-center gap-3">
                                    <div className="flex rounded-[7px] bg-surface-container-high p-[5px] text-muted-foreground">
                                        <Phone className="size-[15px]" />
                                    </div>
                                    <button
                                        type="button"
                                        onClick={async () => {
                                            try {
                                                await apiFetch("/integrations/telephony/click-to-call", {
                                                    method: "POST",
                                                    body: JSON.stringify({ phoneNumber: lead.phone, leadId: lead.id, execute: true }),
                                                });
                                                toast.success("Call request sent");
                                            } catch (error: any) {
                                                toast.error(error.message || "Failed to start click-to-call");
                                            }
                                        }}
                                        className="truncate rounded-sm border-0 bg-transparent p-0 text-sm font-bold text-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                    >
                                        {lead.phone}
                                    </button>
                                </div>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button
                                            size="icon-sm"
                                            variant="ghost"
                                            onClick={() => copyToClipboard(lead.phone!, 'Phone')}
                                            className="ml-1 opacity-0 transition-opacity group-hover:opacity-100"
                                        >
                                            <Copy className="size-4" />
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Copy Phone</TooltipContent>
                                </Tooltip>
                            </div>
                        )}
                    </div>
                </CardContent>

                <Separator className="mx-3 w-auto opacity-50" />

                {/* Actions */}
                <div className="p-[10px]">
                    <div className="flex flex-col gap-[5px]">
                        <Button onClick={onCreateActivity} className="w-full rounded-[10px] font-bold normal-case shadow-none hover:shadow-none">
                            <History className="size-4" />
                            Log Activity
                        </Button>
                        <Button onClick={onCreateOpportunity} variant="outline" className="w-full rounded-[10px] font-bold normal-case">
                            <Plus className="size-4" />
                            Create Opportunity
                        </Button>
                    </div>
                </div>
            </Card>
        </motion.div>
    );
}
