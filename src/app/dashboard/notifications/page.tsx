"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";
import { PageTabs, usePageTab } from "@/components/common/page-tabs";
import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { NotificationRow, resolveNotificationLink } from "@/components/layout/notification-bell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api";

type Item = { id: string; title: string; message: string; data: any; isRead: boolean; createdAt: string };

const TABS = [
    { value: "unread", label: "Unread" },
    { value: "all", label: "All" },
] as const;
const PAGE = 50;

// "View all" for notifications (UI/UX plan §11.6 M): every notification, read and unread, with
// paging back in time. The bell shows only the latest unread ones.
export default function NotificationsPage() {
    const router = useRouter();
    const [tab, setTab] = usePageTab(TABS, "unread");
    const [items, setItems] = useState<Item[]>([]);
    const [loading, setLoading] = useState(true);
    const [failed, setFailed] = useState(false);
    const [hasMore, setHasMore] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);

    const fetchPage = useCallback(async (before?: string) => {
        const params = new URLSearchParams({ status: "all", limit: String(PAGE) });
        if (before) params.set("before", before);
        const rows = await apiFetch<Item[]>(`/notifications?${params.toString()}`);
        return Array.isArray(rows) ? rows : [];
    }, []);

    const load = useCallback(() => {
        setLoading(true);
        setFailed(false);
        fetchPage()
            .then((rows) => { setItems(rows); setHasMore(rows.length === PAGE); })
            .catch(() => setFailed(true))
            .finally(() => setLoading(false));
    }, [fetchPage]);

    useEffect(() => { load(); }, [load]);

    const loadMore = async () => {
        const last = items[items.length - 1];
        if (!last) return;
        setLoadingMore(true);
        try {
            const rows = await fetchPage(last.createdAt);
            setItems((current) => [...current, ...rows.filter((row) => !current.some((item) => item.id === row.id))]);
            setHasMore(rows.length === PAGE);
        } catch {
            toast.error("Couldn't load older notifications");
        } finally {
            setLoadingMore(false);
        }
    };

    const setRead = async (ids: string[], read: boolean) => {
        setItems((current) => current.map((item) => (ids.includes(item.id) ? { ...item, isRead: read } : item)));
        await apiFetch("/notifications", { method: "PATCH", body: JSON.stringify({ ids, read }) });
    };

    const open = (item: Item) => {
        if (!item.isRead) setRead([item.id], true).catch(() => undefined);
        const link = resolveNotificationLink(item.data);
        if (link) router.push(link);
    };

    const unread = items.filter((item) => !item.isRead);
    const markAll = async () => {
        const ids = unread.map((item) => item.id);
        if (!ids.length) return;
        try {
            await setRead(ids, true);
            toast.success(`${ids.length} notification${ids.length === 1 ? "" : "s"} marked as read`, {
                duration: 6000,
                action: { label: "Undo", onClick: () => { setRead(ids, false).catch(() => toast.error("Couldn't undo")); } },
            });
        } catch {
            setItems((current) => current.map((item) => (ids.includes(item.id) ? { ...item, isRead: false } : item)));
            toast.error("Couldn't mark notifications as read");
        }
    };

    const shown = tab === "unread" ? unread : items;

    return (
        <div className="mx-auto max-w-3xl">
            <PageHeader
                title="Notifications"
                description="Updates about your records, tasks and approvals."
                secondaryActions={unread.length ? <Button variant="outline" onClick={markAll}>Mark all as read</Button> : null}
            />
            <Card className="gap-0 overflow-hidden py-0">
                <PageTabs
                    label="Notification filter"
                    tabs={TABS.map((item) => ({ ...item, count: item.value === "unread" ? unread.length : undefined }))}
                    value={tab}
                    onChange={setTab}
                    className="px-2"
                />
                {loading ? (
                    <div className="space-y-3 p-4" aria-busy="true">
                        {Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-12" />)}
                    </div>
                ) : failed ? (
                    <ErrorState description="Notifications couldn't be loaded." onRetry={load} />
                ) : shown.length === 0 ? (
                    <EmptyState title={tab === "unread" ? "You're all caught up" : "No notifications yet"} description={tab === "unread" ? "New updates will appear here." : undefined} />
                ) : (
                    <ul>
                        {shown.map((item) => (
                            <li key={item.id} className="border-b last:border-b-0">
                                <NotificationRow notification={{ ...item, timestamp: item.createdAt, read: item.isRead }} onSelect={() => open(item)} />
                            </li>
                        ))}
                    </ul>
                )}
                {!loading && !failed && hasMore ? (
                    <div className="border-t p-3 text-center">
                        <Button variant="ghost" isLoading={loadingMore} onClick={loadMore}>Load older notifications</Button>
                    </div>
                ) : null}
            </Card>
        </div>
    );
}
