"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Upload, FileText, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";

interface ImportDialogProps {
    entityName: string; // e.g., "Leads"
    apiEndpoint: string; // e.g., "/leads"
    trigger?: React.ReactNode;
    onSuccess?: () => void;
    // Optional: schema validation logic could be passed here
}

export function ImportDialog({ entityName, apiEndpoint, trigger, onSuccess }: ImportDialogProps) {
    const [open, setOpen] = useState(false);
    const [step, setStep] = useState<"upload" | "map" | "preview" | "importing">("upload");
    const [file, setFile] = useState<File | null>(null);
    const [csvData, setCsvData] = useState<any[]>([]);
    const [headers, setHeaders] = useState<string[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0];
        if (selectedFile) {
            setFile(selectedFile);
            parseCsv(selectedFile);
        }
    };

    const parseCsv = (file: File) => {
        const reader = new FileReader();
        reader.onload = (event) => {
            const text = event.target?.result as string;
            // Simple validation: check if text exists
            if (!text) return;

            // Simple CSV parser (split by newline and comma)
            // robust parser (papaparse) recommended for prod
            const lines = text.split(/\r\n|\n/).filter(line => line.trim());
            if (lines.length < 2) {
                toast.error("CSV must have headers and at least one row");
                return;
            }

            const headers = lines[0].split(",").map(h => h.trim());
            const data = lines.slice(1).map(line => {
                const values = line.split(",");
                const row: any = {};
                headers.forEach((header, index) => {
                    row[header] = values[index]?.trim();
                });
                return row;
            });

            setHeaders(headers);
            setCsvData(data);
            setStep("preview"); // Skip mapping for now, assume auto-match by header
        };
        reader.readAsText(file);
    };

    const handleImport = async () => {
        setStep("importing");
        try {
            // Bulk create usually requires a dedicated endpoint or loop
            // For now, let's loop (not efficient but standard for MVP without bulk API)
            // Or use a hypothetical bulk endpoint if backend supported it.
            // Let's assume we loop for safety/validation per row.

            let successCount = 0;
            let errors = 0;

            for (const row of csvData) {
                try {
                    // Try to map fields naturally (name -> name, email -> email)
                    // If complex mapping needed, we'd do it in "map" step.
                    // Clean up row (remove empty keys)
                    const cleanRow = Object.fromEntries(Object.entries(row).filter(([_, v]) => v !== undefined && v !== ""));

                    await apiFetch(apiEndpoint, {
                        method: "POST",
                        body: JSON.stringify(cleanRow)
                    });
                    successCount++;
                } catch (e) {
                    console.error("Import error row", row, e);
                    errors++;
                }
            }

            toast.success(`Import complete: ${successCount} imported, ${errors} failed`);
            setOpen(false);
            if (onSuccess) onSuccess();

            // Reset state
            setStep("upload");
            setFile(null);
            setCsvData([]);

        } catch (error) {
            toast.error("Import failed critically");
            setStep("preview");
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                {trigger || (
                    <Button variant="outline" size="sm">
                        <Upload className="mr-2 h-4 w-4" /> Import {entityName}
                    </Button>
                )}
            </DialogTrigger>
            <DialogContent className="sm:max-w-[700px]">
                <DialogHeader>
                    <DialogTitle>Import {entityName}</DialogTitle>
                    <DialogDescription>
                        Upload a CSV file to bulk create {entityName.toLowerCase()}.
                    </DialogDescription>
                </DialogHeader>

                <div className="py-4">
                    {step === "upload" && (
                        <div
                            className="border-2 border-dashed rounded-lg p-10 flex flex-col items-center justify-center text-center hover:bg-muted/50 cursor-pointer transition-colors"
                            onClick={() => fileInputRef.current?.click()}
                        >
                            <input
                                type="file"
                                accept=".csv"
                                className="hidden"
                                ref={fileInputRef}
                                onChange={handleFileChange}
                            />
                            <div className="bg-primary/10 p-4 rounded-full mb-4">
                                <FileText className="h-8 w-8 text-primary" />
                            </div>
                            <h3 className="font-semibold text-lg mb-1">Click to upload CSV</h3>
                            <p className="text-sm text-muted-foreground">
                                or drag and drop file here
                            </p>
                        </div>
                    )}

                    {(step === "preview" || step === "importing") && (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <div className="text-sm font-medium">
                                    Previewing {csvData.length} records from <span className="text-muted-foreground">{file?.name}</span>
                                </div>
                                <Button variant="ghost" size="sm" onClick={() => setStep("upload")} disabled={step === "importing"}>
                                    Change File
                                </Button>
                            </div>

                            <div className="border rounded-md max-h-[300px] overflow-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            {headers.map(h => <TableHead key={h}>{h}</TableHead>)}
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {csvData.slice(0, 5).map((row, i) => (
                                            <TableRow key={i}>
                                                {headers.map(h => <TableCell key={h}>{row[h]}</TableCell>)}
                                            </TableRow>
                                        ))}
                                        {csvData.length > 5 && (
                                            <TableRow>
                                                <TableCell colSpan={headers.length} className="text-center text-muted-foreground">
                                                    ... and {csvData.length - 5} more
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </div>
                    )}
                </div>

                <DialogFooter>
                    {step === "preview" && (
                        <Button onClick={handleImport}>
                            Start Import
                        </Button>
                    )}
                    {step === "importing" && (
                        <Button disabled>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Importing...
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
