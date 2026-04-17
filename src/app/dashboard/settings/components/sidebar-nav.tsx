"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import {
    List,
    ListItem,
    ListItemButton,
    ListItemText,
    ListItemIcon,
    Typography,
    useTheme,
    alpha,
} from "@mui/material";
import {
    Settings as GeneralIcon,
    Groups as TeamsIcon,
    Security as PermissionsIcon,
    Tune as IntegrationsIcon,
    BackupTable as FieldsIcon,
    FormatListBulleted as PipelinesIcon,
    Rule as RulesIcon,
    GroupWork as GroupsSettingsIcon,
} from "@mui/icons-material";

const sidebarNavItems = [
    {
        title: "General",
        href: "/dashboard/settings",
        icon: GeneralIcon,
    },
    {
        title: "Teams",
        href: "/dashboard/settings/teams",
        icon: TeamsIcon,
    },
    {
        title: "Permission Templates",
        href: "/dashboard/settings/permission-templates",
        icon: PermissionsIcon,
    },
    {
        title: "Pipelines",
        href: "/dashboard/admin/pipelines",
        icon: PipelinesIcon,
    },
    {
        title: "Custom Fields",
        href: "/dashboard/admin/custom-fields",
        icon: FieldsIcon,
    },
    {
        title: "Sales Groups",
        href: "/dashboard/admin/sales-groups",
        icon: GroupsSettingsIcon,
    },
    {
        title: "Assignment Rules",
        href: "/dashboard/admin/assignment-rules",
        icon: RulesIcon,
    },
    {
        title: "Integrations",
        href: "/dashboard/settings/integrations",
        icon: IntegrationsIcon,
    },
];

export function SettingsSidebar() {
    const pathname = usePathname();
    const theme = useTheme();

    return (
        <List component="nav" sx={{ p: 0 }}>
            {sidebarNavItems.map((item) => {
                const Icon = item.icon;
                const active = pathname === item.href;

                return (
                    <ListItem key={item.href} disablePadding sx={{ mb: 1 }}>
                        <ListItemButton
                            component={Link}
                            href={item.href}
                            selected={active}
                            sx={{
                                borderRadius: '16px',
                                p: '10px 16px',
                                color: active ? 'primary.main' : 'text.secondary',
                                bgcolor: active ? alpha(theme.palette.primary.main, 0.08) : 'transparent',
                                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                                '&:hover': {
                                    bgcolor: active ? alpha(theme.palette.primary.main, 0.12) : alpha(theme.palette.action.hover, 0.04),
                                    transform: 'translateX(4px)',
                                },
                                '&.Mui-selected': {
                                    bgcolor: alpha(theme.palette.primary.main, 0.1),
                                    '&:hover': {
                                        bgcolor: alpha(theme.palette.primary.main, 0.14),
                                    },
                                },
                            }}
                        >
                            <ListItemIcon sx={{
                                minWidth: 36,
                                color: 'inherit',
                                opacity: active ? 1 : 0.7
                            }}>
                                <Icon sx={{ fontSize: 20 }} />
                            </ListItemIcon>
                            <ListItemText
                                primary={item.title}
                                primaryTypographyProps={{
                                    variant: 'body2',
                                    fontWeight: active ? 700 : 500,
                                    letterSpacing: active ? 0.2 : 0,
                                }}
                            />
                        </ListItemButton>
                    </ListItem>
                );
            })}
        </List>
    );
}
