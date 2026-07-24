"use client";

import {
    Zap,
    GitBranch,
    Database,
    Play,
    Mail,
    Webhook,
    Clock,
    CheckCircle2,
    XCircle,
    Info,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatWorkspaceTime } from "@/lib/date-format";
import { cn } from "@/lib/utils";

const ICONS: Record<string, any> = {
    trigger: Zap,
    condition: GitBranch,
    update_field: Database,
    create_activity: Play,
    send_email: Mail,
    webhook: Webhook,
    delay: Clock,
};

interface ExecutionStep {
    node: string;
    type: string;
    status: string;
    action?: string;
    result?: boolean;
    error?: string;
    timestamp?: string;
}

interface ExecutionLogViewerProps {
    steps: ExecutionStep[];
}

export function ExecutionLogViewer({ steps }: ExecutionLogViewerProps) {
    if (!steps || steps.length === 0) {
        return (
            <div className="p-8 text-center">
                <p className="text-sm text-muted-foreground">No execution steps found.</p>
            </div>
        );
    }

    return (
        <div className="space-y-4 py-2">
            {steps.map((step, index) => {
                const Icon = ICONS[step.type] || Info;
                const isSuccess = step.status.includes('SUCCESS') || step.status === 'COMPLETED';
                const isWaiting = step.status === 'WAITING';
                const isFailed = step.status === 'FAILED';

                return (
                    <div key={index} className="relative">
                        {index < steps.length - 1 && (
                            <div className="absolute -bottom-4 left-5 top-10 z-0 w-0.5 bg-border" />
                        )}
                        <div
                            className={cn(
                                "relative z-10 rounded-2xl border bg-card p-4",
                                isWaiting && "bg-primary/[0.02]"
                            )}
                        >
                            <div className="flex items-start gap-3">
                                <div
                                    className={cn(
                                        "flex shrink-0 items-center justify-center rounded-xl p-2",
                                        isSuccess ? "bg-primary/10 text-primary" :
                                            isFailed ? "bg-destructive/10 text-destructive" :
                                                isWaiting ? "bg-primary/10 text-primary" :
                                                    "bg-primary/10 text-primary"
                                    )}
                                >
                                    <Icon className="size-5" />
                                </div>
                                <div className="flex-1">
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm font-bold capitalize">
                                            {step.type.replace('_', ' ')}
                                        </span>
                                        <span className="text-xs text-muted-foreground">
                                            {step.timestamp ? formatWorkspaceTime(step.timestamp, { seconds: true }) : ''}
                                        </span>
                                    </div>

                                    <p className="mt-0.5 text-sm text-muted-foreground">
                                        {step.action || `Executed ${step.type} step`}
                                    </p>

                                    {step.type === 'condition' && step.result !== undefined && (
                                        <Badge variant={step.result ? 'default' : 'outline'} className="mt-2">
                                            {step.result ? 'Matched' : 'No Match'}
                                        </Badge>
                                    )}

                                    {step.error && (
                                        <p className="mt-2 block text-xs font-medium text-destructive">
                                            Error: {step.error}
                                        </p>
                                    )}
                                </div>
                                <div>
                                    {isSuccess ? (
                                        <CheckCircle2 className="size-[18px] text-emerald-500" />
                                    ) : isFailed ? (
                                        <XCircle className="size-[18px] text-red-500" />
                                    ) : isWaiting ? (
                                        <Clock className="size-[18px] animate-pulse text-blue-500" />
                                    ) : null}
                                </div>
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
