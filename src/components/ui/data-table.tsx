"use client"
import { storageGet, storageSet } from "@/lib/storage";

import * as React from "react"
import {
  type ColumnDef,
  type RowSelectionState,
  type SortingState,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table"
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsUpDown, Columns3, Rows3, Rows4 } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"

import { cn } from "@/lib/utils"
import { getCachedPersonalization } from "@/lib/personalization-cache"
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
import { ErrorState } from "@/components/common/error-state"

export type Density = "compact" | "comfortable"

export interface DataTableProps<TData> {
  columns: ColumnDef<TData, any>[]
  data: TData[]
  getRowId?: (row: TData) => string
  loading?: boolean
  emptyState?: Omit<EmptyStateProps, "action"> & { action?: React.ReactNode }
  // A failed fetch must never look like "zero results" -- pass the error message (or `true`
  // for a generic one) and this renders ErrorState with a retry button instead of EmptyState.
  error?: string | boolean | null
  onRetry?: () => void
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

  // --- Phase 1 upgrade (UI/UX plan item 4). All opt-in, so screens move over one at a time. ---
  // Sorting. Server-side: pass `sort` and `onSortChange` and fetch in that order. Client-side
  // (only when every row is loaded): `clientSort`. A column is sortable when its def sets
  // `enableSorting: true`.
  sort?: { id: string; desc: boolean } | null
  onSortChange?: (sort: { id: string; desc: boolean } | null) => void
  clientSort?: boolean
  // Keeps the header visible while the rows scroll inside a box of this height (e.g. "70vh").
  stickyHeader?: boolean
  maxHeight?: string
  // Per-row actions in a last column; clicks there never open the row.
  rowActions?: (row: TData) => React.ReactNode
  // Below the md breakpoint, rows render as these cards instead of a table.
  mobileCard?: (row: TData) => React.ReactNode
  // Columns hidden until the user chooses otherwise in the column picker, e.g. { email: false }.
  defaultColumnVisibility?: VisibilityState
}

// Row actions stay visible at the right edge when the table scrolls sideways.
const STICKY_ACTIONS_HEAD = "sticky right-0 z-[1] bg-card shadow-[inset_1px_0_0_var(--border)]"
const STICKY_ACTIONS_CELL = "sticky right-0 z-[1] bg-card shadow-[inset_1px_0_0_var(--border)] group-hover:bg-muted group-data-[state=selected]:bg-selected"

// Rows are 40px, or 32px compact (UI/UX plan decision 20): about 16 rows at 1440x900.
const DENSITY_ROW_CLASS: Record<Density, string> = {
  compact: "h-8",
  comfortable: "h-10",
};
const DENSITY_CELL_CLASS: Record<Density, string> = {
  compact: "py-1",
  comfortable: "py-2",
};

// Gap checklist Module 10's "user workspace personalization" item, "compact/comfortable
// density" sub-item -- a real per-user backend default (User.preferences.density, set from the
// "My Workspace" settings tab), read from the localStorage cache GeneralSettingsProvider already
// populates (no extra network round-trip per table). A table's own explicit per-table choice
// (data-table-density:<storageKey>) always wins once it exists -- this default only applies
// before the user has ever touched this specific table's own toggle.
function useDensity(storageKey: string | undefined, defaultDensity: Density) {
  const [density, setDensity] = React.useState<Density>(defaultDensity);

  React.useEffect(() => {
    if (!storageKey) return;
    const stored = storageGet(`data-table-density:${storageKey}`);
    if (stored === "compact" || stored === "comfortable") {
      setDensity(stored);
      return;
    }
    const globalDefault = getCachedPersonalization()?.density;
    if (globalDefault === "compact" || globalDefault === "comfortable") setDensity(globalDefault);
  }, [storageKey]);

  const update = React.useCallback((next: Density) => {
    setDensity(next);
    if (storageKey) storageSet(`data-table-density:${storageKey}`, next);
  }, [storageKey]);

  return [density, update] as const;
}

// "Table column preferences" sub-item -- real per-table persistence (previously in-memory only,
// resetting on reload). Local-only (per browser profile), the same tier as density's own
// per-table override -- cross-device sync is a further, separate piece not attempted here.
function useColumnVisibility(storageKey: string | undefined, defaults: VisibilityState = {}) {
  const [columnVisibility, setColumnVisibilityState] = React.useState<VisibilityState>(defaults);

  // A user's saved choice wins; the screen's defaults apply only until they choose.
  React.useEffect(() => {
    if (!storageKey) return;
    try {
      const stored = storageGet(`data-table-columns:${storageKey}`);
      if (stored) setColumnVisibilityState(JSON.parse(stored));
    } catch {
      // Malformed cache -- fall back to the defaults.
    }
  }, [storageKey]);

  const setColumnVisibility = React.useCallback((updater: React.SetStateAction<VisibilityState>) => {
    setColumnVisibilityState((current) => {
      const next = typeof updater === "function" ? (updater as (value: VisibilityState) => VisibilityState)(current) : updater;
      if (storageKey) {
        try {
          storageSet(`data-table-columns:${storageKey}`, JSON.stringify(next));
        } catch {
          // Private browsing / storage disabled -- the in-memory value still applies this session.
        }
      }
      return next;
    });
  }, [storageKey]);

  return [columnVisibility, setColumnVisibility] as const;
}

export function DataTable<TData>({
  columns,
  data,
  getRowId,
  loading,
  emptyState,
  error,
  onRetry,
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
  sort,
  onSortChange,
  clientSort,
  stickyHeader,
  maxHeight,
  rowActions,
  mobileCard,
  defaultColumnVisibility,
}: DataTableProps<TData>) {
  const [clientSorting, setClientSorting] = React.useState<SortingState>([])
  const [density, setDensity] = useDensity(storageKey, defaultDensity);
  const [columnVisibility, setColumnVisibility] = useColumnVisibility(storageKey, defaultColumnVisibility);

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

  const allColumns = React.useMemo<ColumnDef<TData, any>[]>(() => {
    if (!rowActions) return columnsWithSelection;
    return [
      ...columnsWithSelection,
      {
        id: "__actions__",
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-0.5" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
            {rowActions(row.original)}
          </div>
        ),
        size: 56,
        enableSorting: false,
      },
    ];
  }, [columnsWithSelection, rowActions]);

  const sortingState: SortingState = clientSort ? clientSorting : sort ? [sort] : [];

  const table = useReactTable({
    data,
    columns: allColumns,
    getRowId: resolveRowId,
    state: { rowSelection, columnVisibility, sorting: sortingState },
    manualSorting: !clientSort,
    enableSorting: !!clientSort || !!onSortChange,
    enableSortingRemoval: true,
    onSortingChange: (updater) => {
      const next = typeof updater === "function" ? updater(sortingState) : updater;
      if (clientSort) setClientSorting(next);
      else onSortChange?.(next[0] ? { id: next[0].id, desc: next[0].desc } : null);
    },
    getSortedRowModel: clientSort ? getSortedRowModel() : undefined,
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

  const pageCount = totalItems ? Math.max(1, Math.ceil(totalItems / pageSize)) : undefined
  const visibleColumnCount = table.getVisibleLeafColumns().length
  const rows = table.getRowModel().rows
  const showRows = !loading && !error && currentCount > 0

  // Toolbar and column headers stay in place while loading and on empty or error states (UI/UX
  // plan item 4), so search, filters and "clear" are always reachable and the layout doesn't jump.
  const toolbar = (
    <div className="flex flex-wrap items-center gap-1 border-b px-3 py-1.5">
      {toolbarActions}
      {/* Density and columns only change the table, so they hide where rows show as cards.
          ml-auto (not a grow spacer) so the toolbar content gets all the free width. */}
      <div className={cn("ml-auto flex items-center rounded-md border p-0.5", mobileCard && "hidden md:flex")}>
        <button
          type="button"
          aria-label="Compact density"
          aria-pressed={density === "compact"}
          onClick={() => setDensity("compact")}
          className={cn(
            "rounded-sm p-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            density === "compact" ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted"
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
            "rounded-sm p-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            density === "comfortable" ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted"
          )}
        >
          <Rows3 className="size-3.5" />
        </button>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon-sm" aria-label="Choose columns" className={cn(mobileCard && "hidden md:inline-flex")}>
            <Columns3 className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {table.getAllLeafColumns().filter((c) => c.id !== "__select__" && c.id !== "__actions__").map((column) => (
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
  )

  const header = (
    <TableHeader className={cn(stickyHeader && "sticky top-0 z-10 bg-card shadow-[inset_0_-1px_0_var(--border)]")}>
      {table.getHeaderGroups().map((headerGroup) => (
        <TableRow key={headerGroup.id} className="hover:bg-transparent">
          {headerGroup.headers.map((header) => {
            const sortable = header.column.columnDef.enableSorting === true && (clientSort || !!onSortChange)
            const direction = header.column.getIsSorted()
            return (
              <TableHead
                key={header.id}
                style={{ width: header.column.columnDef.size }}
                className={cn(header.column.id === "__actions__" && STICKY_ACTIONS_HEAD)}
                aria-sort={sortable ? (direction === "asc" ? "ascending" : direction === "desc" ? "descending" : "none") : undefined}
              >
                {header.isPlaceholder ? null : sortable ? (
                  <button
                    type="button"
                    onClick={header.column.getToggleSortingHandler()}
                    className="-mx-1 inline-flex items-center gap-1 rounded-sm px-1 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                    {direction === "asc" ? <ArrowUp className="size-3.5" aria-hidden /> : direction === "desc" ? <ArrowDown className="size-3.5" aria-hidden /> : <ChevronsUpDown className="size-3.5 opacity-50" aria-hidden />}
                  </button>
                ) : flexRender(header.column.columnDef.header, header.getContext())}
              </TableHead>
            )
          })}
        </TableRow>
      ))}
    </TableHeader>
  )

  const body = loading ? (
    <TableBody aria-busy="true">
      {Array.from({ length: Math.min(pageSize, 10) }).map((_, rowIndex) => (
        <TableRow key={`loading-${rowIndex}`} className={cn(DENSITY_ROW_CLASS[density], "hover:bg-transparent")}>
          {Array.from({ length: visibleColumnCount }).map((__, cellIndex) => (
            <TableCell key={cellIndex} className={DENSITY_CELL_CLASS[density]}>
              <Skeleton className="h-4" style={{ width: `${40 + ((rowIndex * 7 + cellIndex * 13) % 45)}%` }} />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </TableBody>
  ) : showRows ? (
    <TableBody>
      {rows.map((row) => (
        <TableRow
          key={row.id}
          data-state={row.getIsSelected() ? "selected" : undefined}
          onClick={() => onRowClick?.(row.original)}
          // Keyboard row open: focus a row with Tab and press Enter (UI/UX plan item 4, rule A2).
          tabIndex={onRowClick ? 0 : undefined}
          onKeyDown={onRowClick ? (event) => {
            if (event.key === "Enter" && event.target === event.currentTarget) {
              event.preventDefault()
              onRowClick(row.original)
            }
          } : undefined}
          className={cn("group", DENSITY_ROW_CLASS[density], onRowClick && "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring")}
        >
          {row.getVisibleCells().map((cell) => (
            <TableCell key={cell.id} className={cn(DENSITY_CELL_CLASS[density], cell.column.id === "__actions__" && STICKY_ACTIONS_CELL)}>
              {flexRender(cell.column.columnDef.cell, cell.getContext())}
            </TableCell>
          ))}
        </TableRow>
      ))}
    </TableBody>
  ) : null

  const placeholder = loading ? <span className="sr-only" role="status">Loading</span> : error ? (
    <ErrorState description={typeof error === "string" ? error : undefined} onRetry={onRetry} />
  ) : currentCount === 0 ? (
    <EmptyState
      title={emptyState?.title ?? "No results found"}
      description={emptyState?.description}
      icon={emptyState?.icon}
      action={emptyState?.action}
      kind={emptyState?.kind}
    />
  ) : null

  return (
    <div data-slot="data-table" className={cn("overflow-hidden rounded-xl bg-card", className)}>
      {toolbar}

      {mobileCard && showRows ? (
        <ul className="divide-y md:hidden">
          {rows.map((row) => (
            <li key={row.id}>
              {onRowClick ? (
                <button type="button" onClick={() => onRowClick(row.original)} className="block w-full px-3 py-3 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
                  {mobileCard(row.original)}
                </button>
              ) : <div className="px-3 py-3">{mobileCard(row.original)}</div>}
            </li>
          ))}
        </ul>
      ) : null}

      <div
        className={cn(mobileCard && showRows && "hidden md:block", (stickyHeader || maxHeight) && "overflow-auto")}
        style={maxHeight ? { maxHeight } : undefined}
      >
        <Table>
          {header}
          {body}
        </Table>
      </div>
      {placeholder}

      {showRows && showSelectAllBanner && (
        <div className="flex flex-wrap justify-center gap-1 border-t bg-selected px-3 py-2 text-sm">
          All {currentCount.toLocaleString()} items on this page are selected.
          <button onClick={onSelectAllFiltered} className="ml-1 rounded-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            Select all {totalItems?.toLocaleString()} matching items
          </button>
        </div>
      )}
      {showRows && isAllSelected && (
        <div className="flex flex-wrap justify-center gap-1 border-t bg-selected px-3 py-2 text-sm font-medium">
          All {totalItems?.toLocaleString()} matching items are selected.
          <button onClick={onClearSelection} className="ml-1 rounded-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            Clear selection
          </button>
        </div>
      )}

      {onPaginationChange && !error && (loading || currentCount > 0) && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t px-3 py-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Rows per page</span>
            <Select
              value={String(pageSize)}
              onValueChange={(value) => onPaginationChange({ pageIndex: 0, pageSize: Number(value) })}
            >
              <SelectTrigger size="sm" aria-label="Rows per page" className="h-auto min-h-8 w-20 shrink-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {pageSizeOptions.map((size) => (
                  <SelectItem key={size} value={String(size)}>{size}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <nav aria-label="Pages" className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <span className="tabular-nums">
              {totalItems ? `${(pageIndex * pageSize + 1).toLocaleString()}–${Math.min((pageIndex + 1) * pageSize, totalItems).toLocaleString()} of ${totalItems.toLocaleString()}` : ""}
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon-sm"
                disabled={pageIndex === 0 || loading}
                onClick={() => onPaginationChange({ pageIndex: pageIndex - 1, pageSize })}
                aria-label="Previous page"
              >
                <ChevronLeft className="size-4" />
              </Button>
              {pageCount ? pageWindow(pageIndex, pageCount).map((page, index) => page === null ? (
                <span key={`gap-${index}`} aria-hidden className="px-1">…</span>
              ) : (
                <Button
                  key={page}
                  variant={page === pageIndex ? "secondary" : "ghost"}
                  size="icon-sm"
                  disabled={loading}
                  aria-label={`Page ${page + 1}`}
                  aria-current={page === pageIndex ? "page" : undefined}
                  onClick={() => page !== pageIndex && onPaginationChange({ pageIndex: page, pageSize })}
                  className="tabular-nums"
                >
                  {page + 1}
                </Button>
              )) : null}
              <Button
                variant="outline"
                size="icon-sm"
                disabled={loading || (totalItems !== undefined && (pageIndex + 1) * pageSize >= totalItems)}
                onClick={() => onPaginationChange({ pageIndex: pageIndex + 1, pageSize })}
                aria-label="Next page"
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </nav>
        </div>
      )}
    </div>
  );
}

// First, last and the pages around the current one, with gaps: 1 … 4 5 6 … 121.
function pageWindow(current: number, count: number): Array<number | null> {
  if (count <= 7) return Array.from({ length: count }, (_, index) => index)
  const pages = new Set([0, count - 1, current - 1, current, current + 1].filter((page) => page >= 0 && page < count))
  const sorted = [...pages].sort((a, b) => a - b)
  const out: Array<number | null> = []
  sorted.forEach((page, index) => {
    if (index > 0 && page - sorted[index - 1] > 1) out.push(null)
    out.push(page)
  })
  return out
}
