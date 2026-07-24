'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { StandardDialog } from '@/components/common/standard-dialog';
import { FlaskConical, Play, CheckCircle2, XCircle, AlertTriangle, Loader2 } from 'lucide-react';
import { apiFetch } from '@/lib/api';

interface TestDialogProps {
    open: boolean;
    onClose: () => void;
    automationId: string;
    automationName: string;
}

export function TestWorkflowDialog({ open, onClose, automationId, automationName }: TestDialogProps) {
    const [entityType, setEntityType] = useState<'LEAD' | 'OPPORTUNITY'>('LEAD');
    const [entityId, setEntityId] = useState('');
    const [leads, setLeads] = useState<any[]>([]);
    const [opportunities, setOpportunities] = useState<any[]>([]);
    const [loadingRecords, setLoadingRecords] = useState(false);
    const [testing, setTesting] = useState(false);
    const [testResults, setTestResults] = useState<any>(null);

    useEffect(() => {
        if (!open) return;
        setLoadingRecords(true);
        Promise.all([
            apiFetch<any>('/leads?limit=100')
                .then((response) => setLeads(Array.isArray(response) ? response : Array.isArray(response?.data) ? response.data : []))
                .catch(() => setLeads([])),
            apiFetch<any>('/opportunities?limit=100')
                .then((response) => setOpportunities(Array.isArray(response) ? response : Array.isArray(response?.data) ? response.data : []))
                .catch(() => setOpportunities([])),
        ]).finally(() => setLoadingRecords(false));
    }, [open]);

    const recordOptions = useMemo(() => {
        return entityType === 'LEAD'
            ? leads.map((lead) => ({
                id: lead.id,
                label: lead.name || lead.email || lead.company || 'Unnamed lead',
                description: [lead.email, lead.company].filter(Boolean).join(' | '),
            }))
            : opportunities.map((opportunity) => ({
                id: opportunity.id,
                label: opportunity.title || opportunity.name || 'Untitled opportunity',
                description: opportunity.lead?.name || opportunity.leadName || opportunity.stage?.name || '',
            }));
    }, [entityType, leads, opportunities]);

    const runTest = async () => {
        if (!entityId) return;

        setTesting(true);
        setTestResults(null);

        try {
            const data = await apiFetch(`/automation-v2/${automationId}/test`, {
                method: 'POST',
                body: JSON.stringify({
                    entityType,
                    entityId,
                }),
            });
            setTestResults(data);
        } catch (error: any) {
            setTestResults({
                success: false,
                error: error.message || 'Failed to run test',
                log: [],
            });
        } finally {
            setTesting(false);
        }
    };

    const handleClose = () => {
        onClose();
        setTestResults(null);
        setEntityId('');
    };

    return (
        <StandardDialog
            open={open}
            onClose={handleClose}
            title="Test Workflow"
            subtitle={automationName}
            icon={<FlaskConical className="size-5" />}
            maxWidth="md"
        >
            <p className="mb-3 text-sm text-muted-foreground">
                Run a test execution without making any actual changes (dry run).
            </p>

            <div className="mb-3 space-y-3 rounded-lg border bg-muted/30 p-4">
                <div className="space-y-2">
                    <Label>Entity Type</Label>
                    <Select
                        value={entityType}
                        onValueChange={(value) => {
                            setEntityType(value as any);
                            setEntityId('');
                            setTestResults(null);
                        }}
                    >
                        <SelectTrigger className="w-full">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="LEAD">Lead</SelectItem>
                            <SelectItem value="OPPORTUNITY">Opportunity</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-2">
                    <Label>{entityType === 'LEAD' ? 'Lead' : 'Opportunity'}</Label>
                    <Select value={entityId || '__none__'} onValueChange={(value) => setEntityId(value === '__none__' ? '' : value)}>
                        <SelectTrigger className="w-full">
                            <SelectValue placeholder={loadingRecords ? 'Loading records...' : 'Select a record'} />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="__none__">Select a record</SelectItem>
                            {recordOptions.map((record) => (
                                <SelectItem key={record.id} value={record.id}>
                                    {record.label}{record.description ? ` - ${record.description}` : ''}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <Button onClick={runTest} disabled={testing || !entityId} className="w-full">
                    {testing ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
                    {testing ? 'Running Test...' : 'Run Test'}
                </Button>
            </div>

            {testResults && (
                <div>
                    <div className="mb-3 flex items-center gap-3">
                        <div className="h-px flex-1 bg-border" />
                        <span className="text-xs font-semibold text-muted-foreground">Test Results</span>
                        <div className="h-px flex-1 bg-border" />
                    </div>

                    <Alert variant={testResults.success ? 'default' : 'destructive'} className="mb-3">
                        {testResults.success ? <CheckCircle2 className="size-4" /> : <XCircle className="size-4" />}
                        <AlertTitle>{testResults.success ? 'Test Passed' : 'Test Failed'}</AlertTitle>
                        <AlertDescription>
                            {testResults.error || 'Workflow execution simulation completed successfully.'}
                        </AlertDescription>
                    </Alert>

                    {testResults.log && testResults.log.length > 0 && (
                        <div className="mb-3 overflow-hidden rounded-lg border">
                            <div className="border-b bg-muted/50 px-3 py-2">
                                <span className="text-sm font-semibold">Execution Log</span>
                            </div>
                            <div className="max-h-[300px] overflow-y-auto">
                                {testResults.log.map((entry: any, idx: number) => (
                                    <div
                                        key={idx}
                                        className={`flex gap-3 p-3 ${idx < testResults.log.length - 1 ? 'border-b' : ''}`}
                                    >
                                        <div className="mt-0.5">
                                            {entry.status === 'TEST_SUCCESS' ? (
                                                <CheckCircle2 className="size-4 text-primary" />
                                            ) : entry.status === 'UNKNOWN' ? (
                                                <AlertTriangle className="size-4 text-amber-500" />
                                            ) : (
                                                <XCircle className="size-4 text-destructive" />
                                            )}
                                        </div>
                                        <div>
                                            <div className="text-xs font-semibold text-muted-foreground">{entry.type}</div>
                                            <div className="text-sm font-medium">{entry.action || entry.node}</div>
                                            {entry.result !== undefined && (
                                                <div className="mt-0.5 font-mono text-xs text-muted-foreground">
                                                    Result: {String(entry.result)}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <Alert>
                        <AlertDescription>This was a test run. No actual changes were made to your data.</AlertDescription>
                    </Alert>
                </div>
            )}
        </StandardDialog>
    );
}
