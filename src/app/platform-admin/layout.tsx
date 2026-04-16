"use client";

import { SuperAdminGuard } from "@/components/auth/super-admin-guard";
import { Button, Box, Drawer, List, ListItem, ListItemButton, ListItemIcon, ListItemText, AppBar, Toolbar, Typography, alpha, useTheme, Avatar, IconButton } from "@mui/material";
import { ShieldCheck, LogOut, LayoutDashboard, Users, Sidebar, FileText, Menu as MenuIcon, Bell, Search } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import React, { useState } from "react";

const DRAWER_WIDTH = 280;

export default function PlatformAdminLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const theme = useTheme();
    const [mobileOpen, setMobileOpen] = useState(false);

    const navItems = [
        { href: "/platform-admin", label: "Dashboard", icon: LayoutDashboard },
        { href: "/platform-admin/tenants", label: "Tenants", icon: Users },
        { href: "/platform-admin/audit-logs", label: "Audit Logs", icon: FileText },
    ];

    const drawerContent = (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', bgcolor: 'background.paper', borderRight: '1px solid', borderColor: 'divider' }}>
            {/* Header */}
            <Box sx={{ p: 3, display: 'flex', alignItems: 'center', gap: 2 }}>
                <Avatar sx={{ bgcolor: 'secondary.main', color: 'secondary.contrastText' }}>
                    <ShieldCheck size={24} />
                </Avatar>
                <Box>
                    <Typography variant="subtitle1" fontWeight={700} sx={{ lineHeight: 1.2 }}>Platform</Typography>
                    <Typography variant="caption" color="text.secondary">Administration</Typography>
                </Box>
            </Box>

            {/* Nav */}
            <List sx={{ px: 2, flex: 1 }}>
                {navItems.map((item) => {
                    const isActive = pathname === item.href;
                    const Icon = item.icon;
                    return (
                        <ListItem key={item.href} disablePadding sx={{ mb: 1 }}>
                            <ListItemButton
                                component={Link}
                                href={item.href}
                                selected={isActive}
                                sx={{
                                    borderRadius: '50px', // M3 Pill shape
                                    minHeight: 56,
                                    px: 3,
                                    '&.Mui-selected': {
                                        bgcolor: 'secondary.container',
                                        color: 'secondary.onContainer',
                                        '&:hover': { bgcolor: alpha(theme.palette.secondary.main, 0.2) }
                                    }
                                }}
                            >
                                <ListItemIcon sx={{ minWidth: 40, color: isActive ? 'inherit' : 'text.secondary' }}>
                                    <Icon size={24} />
                                </ListItemIcon>
                                <ListItemText
                                    primary={item.label}
                                    primaryTypographyProps={{ fontWeight: isActive ? 700 : 500 }}
                                />
                            </ListItemButton>
                        </ListItem>
                    );
                })}
            </List>

            {/* Footer */}
            <Box sx={{ p: 2, borderTop: '1px solid', borderColor: 'divider' }}>
                <Button
                    component={Link}
                    href="/dashboard"
                    fullWidth
                    variant="outlined"
                    startIcon={<LogOut size={18} />}
                    sx={{ borderRadius: 28, textTransform: 'none', justifyContent: 'flex-start', px: 3 }}
                >
                    Back to App
                </Button>
            </Box>
        </Box>
    );

    return (
        <SuperAdminGuard>
            <Box sx={{ display: 'flex', bgcolor: 'background.default', minHeight: '100vh' }}>
                {/* Mobile Drawer */}
                <Drawer
                    variant="temporary"
                    open={mobileOpen}
                    onClose={() => setMobileOpen(false)}
                    ModalProps={{ keepMounted: true }}
                    sx={{
                        display: { xs: 'block', lg: 'none' },
                        '& .MuiDrawer-paper': { boxSizing: 'border-box', width: DRAWER_WIDTH, border: 'none' },
                    }}
                >
                    {drawerContent}
                </Drawer>

                {/* Desktop Drawer */}
                <Drawer
                    variant="permanent"
                    sx={{
                        display: { xs: 'none', lg: 'block' },
                        '& .MuiDrawer-paper': { boxSizing: 'border-box', width: DRAWER_WIDTH, border: 'none' },
                    }}
                    open
                >
                    {drawerContent}
                </Drawer>

                {/* Main Content */}
                <Box component="main" sx={{ flexGrow: 1, p: 3, width: { lg: `calc(100% - ${DRAWER_WIDTH}px)` } }}>
                    <Box sx={{ display: { lg: 'none' }, mb: 2 }}>
                        <IconButton onClick={() => setMobileOpen(true)}>
                            <MenuIcon />
                        </IconButton>
                    </Box>

                    {children}
                </Box>
            </Box>
        </SuperAdminGuard>
    );
}
