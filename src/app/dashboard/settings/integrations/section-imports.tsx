"use client";

import { Upload, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { IMPORT_STATUS_CLASSNAMES } from "./integrations-shared";
import type { IntegrationsSettings } from "./use-integrations-settings";

// The "imports" section of Settings › Integrations, moved here from page.tsx unchanged.
export function ImportsSection({ s }: { s: IntegrationsSettings }) {
    const { imports, setIsImportOpen, handleCancelImportJob, handleApproveImportJob, handleRejectImportJob } = s;
    return (
        <div className="min-w-0 space-y-4">
                    <div className="flex min-w-0 flex-wrap items-center justify-between">
                        <h2 className="text-lg font-semibold">Recent Imports</h2>
                        <Button variant="outline" onClick={() => setIsImportOpen(true)}>
                            <Upload className="size-4" />
                            Import CSV
                        </Button>
                    </div>

                    {imports.length === 0 ? (
                        <Alert variant="info">
                            <Info />
                            <AlertDescription>No recent imports found.</AlertDescription>
                        </Alert>
                    ) : (
                        <Card className="overflow-hidden py-0">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Module</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead>Created</TableHead>
                                        <TableHead>Updated</TableHead>
                                        <TableHead>Skipped</TableHead>
                                        <TableHead>Failed</TableHead>
                                        <TableHead>Errors</TableHead>
                                        <TableHead></TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {imports.map((job) => (
                                        <TableRow key={job.id}>
                                            <TableCell>{job.module}</TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className={IMPORT_STATUS_CLASSNAMES[job.status]}>{job.status.replace(/_/g, ' ')}</Badge>
                                            </TableCell>
                                            <TableCell>{job.stats?.created ?? 0}</TableCell>
                                            <TableCell>{job.stats?.updated ?? 0}</TableCell>
                                            <TableCell>{job.stats?.skipped ?? 0}</TableCell>
                                            <TableCell>{job.stats?.failed ?? 0}</TableCell>
                                            <TableCell className="whitespace-normal">
                                                {job.errors?.slice(0, 2).map((error) => `Row ${error.row}: ${error.message}`).join(' | ') || '-'}
                                            </TableCell>
                                            <TableCell className="whitespace-nowrap">
                                                {job.status === 'PENDING_APPROVAL' && (
                                                    <div className="flex min-w-0 flex-wrap gap-1">
                                                        <Button size="sm" variant="outline" onClick={() => handleApproveImportJob(job.id)}>Approve</Button>
                                                        <Button size="sm" variant="ghost" onClick={() => handleRejectImportJob(job.id)}>Reject</Button>
                                                    </div>
                                                )}
                                                {(job.status === 'QUEUED' || job.status === 'PROCESSING') && (
                                                    <Button size="sm" variant="ghost" onClick={() => handleCancelImportJob(job.id)}>Cancel</Button>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </Card>
                    )}
                </div>
    );
}
