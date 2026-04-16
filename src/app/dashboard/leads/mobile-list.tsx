import { Lead } from "@/types/leads";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Chip } from "@mui/material";
import Link from "next/link";
import { Phone, Mail } from "lucide-react";

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
                        <div className="flex justify-between items-start">
                            <div>
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
                            <Chip
                                label={lead.status}
                                color={lead.status === 'NEW' ? 'primary' : 'default'}
                                size="small"
                                variant={lead.status === 'NEW' ? 'filled' : 'outlined'}
                            />
                        </div>
                    </CardHeader>
                    <CardContent className="p-4 pt-2 space-y-3">
                        <div className="flex flex-col gap-2 text-sm text-muted-foreground">
                            {lead.email && (
                                <div className="flex items-center gap-2">
                                    <Mail className="h-4 w-4" />
                                    {lead.email}
                                </div>
                            )}
                            {lead.phone && (
                                <div className="flex items-center gap-2">
                                    <Phone className="h-4 w-4" />
                                    {lead.phone}
                                </div>
                            )}
                        </div>

                        {lead.tags && lead.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                                {lead.tags.map(tag => (
                                    <Chip
                                        key={tag}
                                        label={tag}
                                        variant="outlined"
                                        size="small"
                                        sx={{ height: 24, fontSize: '0.75rem' }}
                                    />
                                ))}
                            </div>
                        )}

                        <div className="text-xs text-muted-foreground pt-2 border-t mt-2">
                            Added {new Date(lead.createdAt).toLocaleDateString()}
                        </div>
                    </CardContent>
                </Card>
            ))}
        </div>
    );
}
