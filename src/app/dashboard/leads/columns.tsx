"use client";

import { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import { Lead } from "@/types/leads";
import { Chip } from "@mui/material";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useState } from "react";
import { EditLeadDialog } from "./edit-lead-dialog";

const ActionsCell = ({ lead, onQuickView }: { lead: Lead, onQuickView?: (lead: Lead) => void }) => {
    const [editOpen, setEditOpen] = useState(false);

    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="h-8 w-8 p-0">
                        <span className="sr-only">Open menu</span>
                        <MoreHorizontal className="h-4 w-4" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Actions</DropdownMenuLabel>
                    <DropdownMenuItem onClick={() => onQuickView?.(lead)}>
                        Preview
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        onClick={() => navigator.clipboard.writeText(lead.id)}
                    >
                        Copy Lead ID
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                        <Link href={`/dashboard/leads/${lead.id}`} className="cursor-pointer">
                            View details
                        </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        onSelect={(e) => {
                            e.preventDefault();
                            setEditOpen(true);
                        }}
                    >
                        Edit lead
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>

            {editOpen && (
                <EditLeadDialog
                    open={editOpen}
                    onOpenChange={setEditOpen}
                    lead={lead}
                    onSuccess={() => {
                        window.location.reload();
                    }}
                />
            )}
        </>
    );
};

const statusVariants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    NEW: "default",
    CONTACTED: "secondary",
    QUALIFIED: "outline",
    CONVERTED: "default",
    LOST: "destructive",
};

export const columns: ColumnDef<Lead>[] = [
    {
        id: "select",
        header: ({ table }) => (
            <input
                type="checkbox"
                checked={table.getIsAllPageRowsSelected()}
                onChange={(e) => table.toggleAllPageRowsSelected(!!e.target.checked)}
                className="translate-y-[2px]"
            />
        ),
        cell: ({ row }) => (
            <input
                type="checkbox"
                checked={row.getIsSelected()}
                onChange={(e) => row.toggleSelected(!!e.target.checked)}
                className="translate-y-[2px]"
            />
        ),
        enableSorting: false,
        enableHiding: false,
    },
    {
        accessorKey: "name",
        header: "Name",
        cell: ({ row, table }) => {
            const meta = table.options.meta as any;
            return (
                <div
                    className="font-medium hover:underline cursor-pointer text-primary"
                    onClick={() => meta?.onQuickView?.(row.original)}
                >
                    {row.getValue("name")}
                </div>
            )
        },
    },
    {
        accessorKey: "email",
        header: "Email",
    },
    {
        accessorKey: "phone",
        header: "Phone",
    },
    {
        accessorKey: "source",
        header: "Source",
    },
    {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => {
            const status = row.getValue("status") as string;
            // Map status variants to Chip colors
            const colorMap: Record<string, "default" | "primary" | "secondary" | "error" | "info" | "success" | "warning"> = {
                NEW: "primary",
                CONTACTED: "default",
                QUALIFIED: "success",
                CONVERTED: "success",
                LOST: "error",
            };

            return (
                <Chip
                    label={status}
                    color={colorMap[status] || "default"}
                    size="small"
                    variant={status === 'NEW' ? 'filled' : 'outlined'}
                    sx={{ fontWeight: 500 }}
                />
            );
        },
    },
    {
        accessorKey: "tags",
        header: "Tags",
        cell: ({ row }) => {
            const tags = row.getValue("tags") as string[];
            if (!tags || tags.length === 0) return <span className="text-gray-400">-</span>;
            return (
                <div className="flex gap-1 flex-wrap">
                    {tags.slice(0, 2).map((tag) => (
                        <Chip
                            key={tag}
                            label={tag}
                            variant="outlined"
                            size="small"
                            sx={{ height: 24, fontSize: '0.75rem' }}
                        />
                    ))}
                    {tags.length > 2 && (
                        <Chip
                            label={`+${tags.length - 2}`}
                            variant="outlined"
                            size="small"
                            sx={{ height: 24, fontSize: '0.75rem' }}
                        />
                    )}
                </div>
            );
        },
    },
    {
        id: "actions",
        cell: ({ row, table }) => {
            const meta = table.options.meta as any;
            return <ActionsCell lead={row.original} onQuickView={meta?.onQuickView} />
        },
    },
];
