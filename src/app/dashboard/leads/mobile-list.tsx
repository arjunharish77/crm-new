import { Lead } from "@/types/leads";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { Phone, Mail } from "lucide-react";
import { formatWorkspaceDate } from "@/lib/date-format";

interface LeadsMobileListProps {
    data: Lead[];
}

export function LeadsMobileList({ data }: LeadsMobileListProps) {
    if (data.length === 0) {
        return (
            <div className="text-center p-4 text-muted-foreground">
                No leads found.
            </div>
        );
    }

    return (
        <div className="grid gap-4 md:hidden">
            {data.map((lead) => (
                <Card key={lead.id} className="overflow-hidden">
                    <CardHeader className="p-4 pb-2">
                        <div className="flex min-w-0 flex-wrap justify-between items-start gap-2">
                            <div className="min-w-0 max-w-full break-words">
                                <Link
                                    href={`/dashboard/leads/${lead.id}`}
                                    className="font-semibold text-lg hover:underline"
                                >
                                    {lead.name}
                                </Link>
                                <div className="text-sm text-muted-foreground mt-1">
                                    {lead.source || "No Source"} {lead.tags && lead.tags.length > 0 && `• ${lead.tags[0]}`}
                                </div>
                            </div>
                            <Badge variant={lead.status === 'NEW' ? 'default' : 'outline'}>
                                {lead.status}
                            </Badge>
                        </div>
                    </CardHeader>
                    <CardContent className="p-4 pt-2 space-y-3">
                        <div className="flex flex-col gap-2 text-sm text-muted-foreground">
                            {lead.email && (
                                <div className="flex min-w-0 items-start gap-2 break-all">
                                    <Mail className="mt-0.5 h-4 w-4 shrink-0" />
                                    <span className="min-w-0 break-all">{lead.email}</span>
                                </div>
                            )}
                            {lead.phone && (
                                <div className="flex min-w-0 items-start gap-2 break-all">
                                    <Phone className="mt-0.5 h-4 w-4 shrink-0" />
                                    <span className="min-w-0 break-all">{lead.phone}</span>
                                </div>
                            )}
                        </div>

                        {lead.tags && lead.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                                {lead.tags.map(tag => (
                                    <Badge key={tag} variant="outline" className="h-auto min-h-6 max-w-full whitespace-normal break-all">
                                        {tag}
                                    </Badge>
                                ))}
                            </div>
                        )}

                        <div className="text-xs text-muted-foreground pt-2 border-t mt-2">
                            Added {formatWorkspaceDate(lead.createdAt)}
                        </div>
                    </CardContent>
                </Card>
            ))}
        </div>
    );
}
