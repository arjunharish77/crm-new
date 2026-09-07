'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { StandardDialog } from '@/components/common/standard-dialog';
import { UserPlus, Play, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { apiFetch } from '@/lib/api';

interface EnrollDialogProps {
    open: boolean;
    onClose: () => void;
    automationId: string;
    automationName: string;
    defaultEntityType?: 'LEAD' | 'OPPORTUNITY';
}

// Runs this Automation's own workflow steps directly for a hand-picked batch of existing
// records, bypassing normal trigger matching -- enrollment IS the trigger. Synchronous, same
// as the Test dialog, so the result comes back in the same request/response cycle.
export function EnrollRecordsDialog({ open, onClose, automationId, automationName, defaultEntityType }: EnrollDialogProps) {
    const [entityType, setEntityType] = useState<'LEAD' | 'OPPORTUNITY'>(defaultEntityType ?? 'LEAD');
    const [leads, setLeads] = useState<any[]>([]);
    const [opportunities, setOpportunities] = useState<any[]>([]);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [loadingRecords, setLoadingRecords] = useState(false);
    const [enrolling, setEnrolling] = useState(false);
    const [result, setResult] = useState<any>(null);
    const [jobs, setJobs] = useState<any[]>([]);

    useEffect(() => {
        if (!open) return;
        setLoadingRecords(true);
        Promise.all([
            apiFetch<any>('/leads?limit=200')
                .then((response) => setLeads(Array.isArray(response) ? response : Array.isArray(response?.data) ? response.data : []))
                .catch(() => setLeads([])),
            apiFetch<any>('/opportunities?limit=200')
                .then((response) => setOpportunities(Array.isArray(response) ? response : Array.isArray(response?.data) ? response.data : []))
                .catch(() => setOpportunities([])),
            apiFetch<any[]>(`/automation-v2/${automationId}/enrollment-jobs`).then((data) => setJobs(Array.isArray(data) ? data : [])).catch(() => setJobs([])),
        ]).finally(() => setLoadingRecords(false));
    }, [open, automationId]);

    useEffect(() => {
        if (defaultEntityType) setEntityType(defaultEntityType);
    }, [defaultEntityType]);

    const recordOptions = useMemo(() => {
        return entityType === 'LEAD'
            ? leads.map((lead) => ({ id: lead.id, label: lead.name || lead.email || lead.company || 'Unnamed lead' }))
            : opportunities.map((opportunity) => ({ id: opportunity.id, label: opportunity.title || opportunity.name || 'Untitled opportunity' }));
    }, [entityType, leads, opportunities]);

    const toggle = (id: string, checked: boolean) =>
        setSelectedIds((current) => checked ? [...new Set([...current, id])] : current.filter((existing) => existing !== id));

    const enroll = async () => {
        if (!selectedIds.length) return;
        setEnrolling(true);
        setResult(null);
        try {
            const data = await apiFetch(`/automation-v2/${automationId}/enroll`, {
                method: 'POST',
                body: JSON.stringify({ entityType, recordIds: selectedIds }),
            });
            setResult(data);
            setSelectedIds([]);
            apiFetch<any[]>(`/automation-v2/${automationId}/enrollment-jobs`).then((jobsData) => setJobs(Array.isArray(jobsData) ? jobsData : [])).catch(() => undefined);
        } catch (error: any) {
            setResult({ status: 'FAILED', error: error.message || 'Failed to enroll records' });
        } finally {
            setEnrolling(false);
        }
    };

    const handleClose = () => {
        onClose();
        setResult(null);
        setSelectedIds([]);
    };

    return (
        <StandardDialog
            open={open}
            onClose={handleClose}
            title="Enroll Records"
            subtitle={automationName}
            icon={<UserPlus className="size-5" />}
            maxWidth="md"
        >
            <p className="mb-3 text-sm text-muted-foreground">
                Runs this automation&apos;s workflow directly for the records you pick, whether or not they&apos;d normally match its trigger.
            </p>

            <div className="mb-3 space-y-3 rounded-lg border bg-muted/30 p-4">
                <div className="space-y-2">
                    <Label>Entity Type</Label>
                    <Select value={entityType} onValueChange={(value) => { setEntityType(value as any); setSelectedIds([]); setResult(null); }}>
                        <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="LEAD">Lead</SelectItem>
                            <SelectItem value="OPPORTUNITY">Opportunity</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-2">
                    <Label>{entityType === 'LEAD' ? 'Leads' : 'Opportunities'} ({selectedIds.length} selected)</Label>
                    <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border bg-background p-2">
                        {loadingRecords ? (
                            <p className="p-2 text-xs text-muted-foreground">Loading records...</p>
                        ) : recordOptions.length === 0 ? (
                            <p className="p-2 text-xs text-muted-foreground">No records found.</p>
                        ) : recordOptions.map((record) => (
                            <label key={record.id} className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted/50">
                                <Checkbox checked={selectedIds.includes(record.id)} onCheckedChange={(checked) => toggle(record.id, Boolean(checked))} />
                                {record.label}
                            </label>
                        ))}
                    </div>
                </div>
                <Button onClick={enroll} disabled={enrolling || selectedIds.length === 0} className="w-full">
                    {enrolling ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
                    {enrolling ? 'Enrolling...' : `Enroll ${selectedIds.length || ''} Record${selectedIds.length === 1 ? '' : 's'}`}
                </Button>
            </div>

            {result && (
                <Alert variant={result.status === 'COMPLETED' ? 'default' : result.status === 'COMPLETED_WITH_ERRORS' ? 'destructive' : 'destructive'} className="mb-3">
                    {result.status === 'COMPLETED' ? <CheckCircle2 className="size-4" /> : <XCircle className="size-4" />}
                    <AlertTitle>{result.error ? 'Enrollment Failed' : `Enrolled ${result.succeeded}/${result.totalRecords}`}</AlertTitle>
                    <AlertDescription>
                        {result.error || (result.failed > 0 ? `${result.failed} record(s) failed -- see enrollment history below.` : 'All records processed successfully.')}
                    </AlertDescription>
                </Alert>
            )}

            {jobs.length > 0 && (
                <div>
                    <div className="mb-2 flex items-center gap-3">
                        <div className="h-px flex-1 bg-border" />
                        <span className="text-xs font-semibold text-muted-foreground">Enrollment History</span>
                        <div className="h-px flex-1 bg-border" />
                    </div>
                    <div className="max-h-40 space-y-1 overflow-y-auto">
                        {jobs.map((job) => (
                            <div key={job.id} className="flex items-center justify-between rounded-md border px-3 py-1.5 text-xs">
                                <span>{job.entityType} &middot; {job.totalRecords} records</span>
                                <div className="flex items-center gap-2">
                                    <span className="text-muted-foreground">{job.succeeded} ok, {job.failed} failed</span>
                                    <Badge variant={job.status === 'COMPLETED' ? 'outline' : 'destructive'} className="rounded-md">{job.status}</Badge>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </StandardDialog>
    );
}
