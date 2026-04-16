"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from "@/components/ui/table";
import { Chip } from "@mui/material";
import { formatDistanceToNow } from "date-fns";
import { ArrowLeft, UserCog, Activity, Users } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/providers/auth-provider";

export default function TenantDetailPage() {
    const params = useParams();
    const router = useRouter();
    const { token, login } = useAuth();
    const tenantId = params.id as string;

    const [config, setConfig] = useState<any>(null);
    const [users, setUsers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (tenantId) {
            setLoading(true);
            Promise.all([
                apiFetch(`/platform-admin/tenants/${tenantId}/config`),
                apiFetch(`/platform-admin/tenants/${tenantId}/users`)
            ]).then(([configData, usersData]) => {
                setConfig(configData);
                setUsers(usersData);
            }).catch(() => toast.error("Failed to load tenant details"))
                .finally(() => setLoading(false));
        }
    }, [tenantId]);

    const handleImpersonate = async (userId: string) => {
        if (!confirm("Impersonate this user? You will see the app as they see it.")) return;

        try {
            const data = await apiFetch('/platform-admin/impersonate', {
                method: 'POST',
                body: JSON.stringify({ userId, tenantId })
            });

            // Save admin token
            if (token) {
                sessionStorage.setItem('adminToken', token);
            }

            // Login as user
            login(data.token);
            toast.success(`Impersonating ${data.user.email}`);

            // Redirect to dashboard
            router.push('/dashboard');
        } catch (error: any) {
            toast.error(error.message || "Impersonation failed");
        }
    };

    if (loading) return <div className="p-8">Loading...</div>;
    if (!config) return <div className="p-8">Tenant not found</div>;

    const { tenant } = config;

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" onClick={() => router.back()}>
                    <ArrowLeft className="h-4 w-4" />
                </Button>
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">{tenant.name}</h2>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Chip
                            label={tenant.status}
                            color={tenant.status === 'ACTIVE' ? 'success' : 'error'}
                            size="small"
                            variant={tenant.status === 'ACTIVE' ? 'filled' : 'outlined'}
                        />
                        <span>•</span>
                        <span>ID: {tenant.id}</span>
                        <span>•</span>
                        <span>Plan: {tenant.plan || 'Basic'}</span>
                    </div>
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Provisioned Users</CardTitle>
                        <Users className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{users.length}</div>
                        <p className="text-xs text-muted-foreground">
                            Limit: {config.userLimit || 'Unlimited'}
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Storage Used</CardTitle>
                        <Activity className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">0 GB</div>
                        <p className="text-xs text-muted-foreground">
                            Quota: {config.storageQuota || 1} GB
                        </p>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>User Management</CardTitle>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Name</TableHead>
                                <TableHead>Email</TableHead>
                                <TableHead>Role</TableHead>
                                <TableHead>Joined</TableHead>
                                <TableHead></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {users.map((u) => (
                                <TableRow key={u.id}>
                                    <TableCell className="font-medium">{u.name}</TableCell>
                                    <TableCell>{u.email}</TableCell>
                                    <TableCell>{u.role?.name || 'User'}</TableCell>
                                    <TableCell>{formatDistanceToNow(new Date(u.createdAt), { addSuffix: true })}</TableCell>
                                    <TableCell className="text-right">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => handleImpersonate(u.id)}
                                            className="ml-auto"
                                        >
                                            <UserCog className="h-4 w-4 mr-2" />
                                            Impersonate
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
