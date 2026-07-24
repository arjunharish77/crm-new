"use client"

import * as React from "react"
import {
  type ColumnDef,
  type RowSelectionState,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table"
import { ChevronLeft, ChevronRight, Columns3, Rows3, Rows4 } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { EmptyState, type EmptyStateProps } from "@/components/common/empty-state"
import { TableSkeleton } from "@/components/common/skeletons"

export type Density = "compact" | "comfortable"

export interface DataTableProps<TData> {
  columns: ColumnDef<TData, any>[]
  data: TData[]
  getRowId?: (row: TData) => string
  loading?: boolean
  emptyState?: Omit<EmptyStateProps, "action"> & { action?: React.ReactNode }
  onRowClick?: (row: TData) => void

  // Selection — controlled, array-of-ids to match the app's existing convention.
  enableRowSelection?: boolean
  rowSelectionIds?: string[]
  onRowSelectionIdsChange?: (ids: string[]) => void

  // "select all matching filter, not just this page" banner — same UX the app
  // already had, ported as-is rather than redesigned.
  totalItems?: number
  isAllSelected?: boolean
  onSelectAllFiltered?: () => void
  onClearSelection?: () => void

  // Pagination — server-side by default (this app fetches one page at a time).
  manualPagination?: boolean
  pageIndex?: number
  pageSize?: number
  pageSizeOptions?: number[]
  onPaginationChange?: (page: { pageIndex: number; pageSize: number }) => void

  // Density toggle (baseline UX requirement) — persisted per-table when a
  // storageKey is given, otherwise just in-memory for the session.
  storageKey?: string
  defaultDensity?: Density

  toolbarActions?: React.ReactNode
  className?: string
}

const DENSITY_ROW_CLASS: Record<Density, string> = {
  compact: "h-9",
  comfortable: "h-[46px]",
};
const DENSITY_CELL_CLASS: Record<Density, string> = {
  compact: "py-1",
  comfortable: "py-2.5",
};

function useDensity(storageKey: string | undefined, defaultDensity: Density) {
  const [density, setDensity] = React.useState<Density>(defaultDensity);

  React.useEffect(() => {
    if (!storageKey) return;
    const stored = window.localStorage.getItem(`data-table-density:${storageKey}`);
    if (stored === "compact" || stored === "comfortable") setDensity(stored);
  }, [storageKey]);

  const update = React.useCallback((next: Density) => {
    setDensity(next);
    if (storageKey) window.localStorage.setItem(`data-table-density:${storageKey}`, next);
  }, [storageKey]);

  return [density, update] as const;
}

export function DataTable<TData>({
  columns,
  data,
  getRowId,
  loading,
  emptyState,
  onRowClick,
  enableRowSelection,
  rowSelectionIds,
  onRowSelectionIdsChange,
  totalItems,
  isAllSelected,
  onSelectAllFiltered,
  onClearSelection,
  manualPagination = true,
  pageIndex = 0,
  pageSize = 10,
  pageSizeOptions = [10, 25, 50, 100],
  onPaginationChange,
  storageKey,
  defaultDensity = "comfortable",
  toolbarActions,
  className,
}: DataTableProps<TData>) {
  const [density, setDensity] = useDensity(storageKey, defaultDensity);
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});

  const resolveRowId = React.useCallback(
    (row: TData, index: number) => (getRowId ? getRowId(row) : String(index)),
    [getRowId]
  );

  const rowSelection: RowSelectionState = React.useMemo(() => {
    const ids = new Set(rowSelectionIds ?? []);
    const state: RowSelectionState = {};
    data.forEach((row, index) => {
      const id = resolveRowId(row, index);
      if (ids.has(id)) state[id] = true;
    });
    return state;
  }, [rowSelectionIds, data, resolveRowId]);

  const columnsWithSelection = React.useMemo<ColumnDef<TData, any>[]>(() => {
    if (!enableRowSelection) return columns;
    const selectColumn: ColumnDef<TData, any> = {
      id: "__select__",
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && "indeterminate")}
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Select all rows on this page"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          onClick={(e) => e.stopPropagation()}
          aria-label="Select row"
        />
      ),
      size: 40,
    };
    return [selectColumn, ...columns];
  }, [columns, enableRowSelection]);

  const table = useReactTable({
    data,
    columns: columnsWithSelection,
    getRowId: resolveRowId,
    state: { rowSelection, columnVisibility },
    enableRowSelection,
    onRowSelectionChange: (updater) => {
      if (!onRowSelectionIdsChange) return;
      const next = typeof updater === "function" ? updater(rowSelection) : updater;
      onRowSelectionIdsChange(Object.keys(next).filter((id) => next[id]));
    },
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    manualPagination,
    pageCount: manualPagination && totalItems !== undefined ? Math.max(1, Math.ceil(totalItems / pageSize)) : undefined,
  });

  const currentCount = data.length;
  const selectedCount = rowSelectionIds?.length ?? 0;
  const showSelectAllBanner =
    !!enableRowSelection &&
    !isAllSelected &&
    selectedCount >= currentCount &&
    currentCount > 0 &&
    !!totalItems &&
    totalItems > currentCount;

  if (loading) {
    return <TableSkeleton rows={pageSize > 10 ? 10 : pageSize} columns={columns.length} />;
  }

  if (currentCount === 0) {
    return (
      <div data-slot="data-table" className="rounded-xl">
        <EmptyState
          title={emptyState?.title ?? "No results found"}
          description={emptyState?.description}
          icon={emptyState?.icon}
          action={emptyState?.action}
        />
      </div>
    );
  }

  return (
    <div data-slot="data-table" className={cn("overflow-hidden rounded-xl bg-card", className)}>
      <div className="flex items-center gap-1 border-b px-3 py-1.5">
        {toolbarActions}
        <div className="grow" />
        <div className="flex items-center rounded-md border p-0.5">
          <button
            type="button"
            aria-label="Compact density"
            aria-pressed={density === "compact"}
            onClick={() => setDensity("compact")}
            className={cn(
              "rounded-[4px] p-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              density === "compact" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-accent/50"
            )}
          >
            <Rows4 className="size-3.5" />
          </button>
          <button
            type="button"
            aria-label="Comfortable density"
            aria-pressed={density === "comfortable"}
            onClick={() => setDensity("comfortable")}
            className={cn(
              "rounded-[4px] p-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              density === "comfortable" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-accent/50"
            )}
          >
            <Rows3 className="size-3.5" />
          </button>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon-sm" aria-label="Toggle columns">
              <Columns3 className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {table.getAllLeafColumns().filter((c) => c.id !== "__select__").map((column) => (
              <DropdownMenuCheckboxItem
                key={column.id}
                checked={column.getIsVisible()}
                onCheckedChange={(value) => column.toggleVisibility(!!value)}
                onSelect={(e) => e.preventDefault()}
              >
                {typeof column.columnDef.header === "string" ? column.columnDef.header : column.id}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id} className="hover:bg-transparent">
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id} style={{ width: header.column.columnDef.size }}>
                  {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map((row) => (
            <TableRow
              key={row.id}
              data-state={row.getIsSelected() ? "selected" : undefined}
              onClick={() => onRowClick?.(row.original)}
              className={cn(DENSITY_ROW_CLASS[density], onRowClick && "cursor-pointer")}
            >
              {row.getVisibleCells().map((cell) => (
                <TableCell key={cell.id} className={DENSITY_CELL_CLASS[density]}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {showSelectAllBanner && (
        <div className="flex justify-center border-t bg-primary/8 px-3 py-2 text-sm font-medium">
          All {currentCount} items on this page are selected.
          <button onClick={onSelectAllFiltered} className="ml-1 rounded-sm font-bold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            Select all {totalItems} items
          </button>
        </div>
      )}
      {isAllSelected && (
        <div className="flex justify-center border-t bg-primary/12 px-3 py-2 text-sm font-bold text-primary">
          All {totalItems} items are selected.
          <button onClick={onClearSelection} className="ml-1 rounded-sm font-bold hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            Clear selection
          </button>
        </div>
      )}

      {onPaginationChange && (
        <div className="flex items-center justify-between gap-4 border-t px-3 py-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Rows per page</span>
            <Select
              value={String(pageSize)}
              onValueChange={(value) => onPaginationChange({ pageIndex: 0, pageSize: Number(value) })}
            >
              <SelectTrigger size="sm" className="w-[64px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {pageSizeOptions.map((size) => (
                  <SelectItem key={size} value={String(size)}>{size}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span>
              {totalItems ? `${pageIndex * pageSize + 1}–${Math.min((pageIndex + 1) * pageSize, totalItems)} of ${totalItems}` : ""}
            </span>
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="icon-sm"
                disabled={pageIndex === 0}
                onClick={() => onPaginationChange({ pageIndex: pageIndex - 1, pageSize })}
                aria-label="Previous page"
              >
                <ChevronLeft className="size-4" />
              </Button>
              <Button
                variant="outline"
                size="icon-sm"
                disabled={totalItems !== undefined && (pageIndex + 1) * pageSize >= totalItems}
                onClick={() => onPaginationChange({ pageIndex: pageIndex + 1, pageSize })}
                aria-label="Next page"
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
