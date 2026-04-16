"use client";

import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

interface Pipeline {
    id: string;
    name: string;
    isDefault: boolean;
}

interface PipelineSelectorProps {
    pipelines: Pipeline[];
    selectedPipelineId: string;
    onSelect: (id: string) => void;
}

export function PipelineSelector({ pipelines, selectedPipelineId, onSelect }: PipelineSelectorProps) {
    if (!pipelines || pipelines.length === 0) return null;

    return (
        <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground">Pipeline:</span>
            <Select value={selectedPipelineId} onValueChange={onSelect}>
                <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Select pipeline" />
                </SelectTrigger>
                <SelectContent>
                    {pipelines.map((pipeline) => (
                        <SelectItem key={pipeline.id} value={pipeline.id}>
                            {pipeline.name}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    );
}
