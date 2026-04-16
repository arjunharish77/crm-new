'use client';

import * as React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
    Box,
    Drawer,
    List,
    ListItem,
    ListItemButton,
    ListItemIcon,
    ListItemText,
    IconButton,
    Divider,
    Typography,
    Tooltip,
    Collapse,
    useTheme,
    CSSObject,
    Theme,
    styled,
    alpha,
    useMediaQuery,
} from '@mui/material';
import {
    ChevronLeft as ChevronLeftIcon,
    ChevronRight as ChevronRightIcon,
    Dashboard as DashboardIcon,
    People as PeopleIcon,
    AssignmentTurnedIn as TaskIcon,
    Settings as SettingsIcon,
    Security as SecurityIcon,
    Analytics as AnalyticsIcon,
    Work as WorkIcon,
    Description as FormIcon,
    AutoFixHigh as AutomationIcon,
    Groups as GroupsIcon,
    Rule as RuleIcon,
    FormatListBulleted as PipelineIcon,
    AdminPanelSettings as PlatformIcon,
    ExpandLess,
    ExpandMore,
    Tune as TuneIcon,
    Extension as ExtensionIcon,
} from '@mui/icons-material';
import { useAuth } from '@/providers/auth-provider';
import { apiFetch } from '@/lib/api';

const drawerWidth = 280;
const railWidth = 80;

const openedMixin = (theme: Theme): CSSObject => ({
    width: drawerWidth,
    transition: theme.transitions.create('width', {
        easing: theme.transitions.easing.sharp,
        duration: theme.transitions.duration.enteringScreen,
    }),
    overflowX: 'hidden',
    borderRight: 'none',
    backgroundColor: theme.palette.background.paper,
});

const closedMixin = (theme: Theme): CSSObject => ({
    transition: theme.transitions.create('width', {
        easing: theme.transitions.easing.sharp,
        duration: theme.transitions.duration.leavingScreen,
    }),
    overflowX: 'hidden',
    width: railWidth,
    borderRight: 'none',
    backgroundColor: theme.palette.background.paper,
});

const DrawerHeader = styled('div')(({ theme }) => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: theme.spacing(0, 2),
    minHeight: 64,
}));

const StyledDrawer = styled(Drawer, { shouldForwardProp: (prop) => prop !== 'open' })(
    ({ theme, open }) => ({
        width: drawerWidth,
        flexShrink: 0,
        whiteSpace: 'nowrap',
        boxSizing: 'border-box',
        ...(open && {
            ...openedMixin(theme),
            '& .MuiDrawer-paper': openedMixin(theme),
        }),
        ...(!open && {
            ...closedMixin(theme),
            '& .MuiDrawer-paper': closedMixin(theme),
        }),
    }),
);

interface NavItem {
    name: string;
    href: string;
    icon: React.ReactNode;
    enabled?: boolean;
    adminOnly?: boolean;
}

export function NavigationDrawer({ open, toggleDrawer }: { open: boolean; toggleDrawer: () => void }) {
    const theme = useTheme();
    const pathname = usePathname();
    const router = useRouter();
    const { user } = useAuth();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));

    const [adminOpen, setAdminOpen] = React.useState(true);
    const [platformOpen, setPlatformOpen] = React.useState(true);
    const [customOpen, setCustomOpen] = React.useState(true);
    const [customObjects, setCustomObjects] = React.useState<any[]>([]);

    React.useEffect(() => {
        apiFetch('/metadata/objects')
            .then((data: any[]) => {
                if (Array.isArray(data)) {
                    setCustomObjects(data.filter((obj: any) => obj.isCustom));
                }
            })
            .catch(console.error);
    }, []);

    const navigation: NavItem[] = [
        { name: 'Dashboard', href: '/dashboard', icon: <DashboardIcon /> },
        { name: 'Leads', href: '/dashboard/leads', icon: <PeopleIcon />, enabled: true },
        { name: 'Opportunities', href: '/dashboard/opportunities', icon: <WorkIcon />, enabled: user?.features?.opportunityEnabled !== false },
        { name: 'Activities', href: '/dashboard/activities', icon: <TaskIcon /> },
        { name: 'Forms', href: '/dashboard/forms', icon: <FormIcon />, enabled: user?.features?.formBuilderEnabled !== false },
        { name: 'Automations', href: '/dashboard/automations-v2', icon: <AutomationIcon />, enabled: user?.features?.automationEnabled !== false },
        { name: 'Reports', href: '/dashboard/reports', icon: <AnalyticsIcon />, enabled: user?.features?.advancedReporting !== false },
    ];

    const adminNavigation: NavItem[] = [
        // { name: 'Pipelines', href: '/dashboard/admin/pipelines', icon: <PipelineIcon /> }, // Removed per user request
        { name: 'Users', href: '/dashboard/admin/users', icon: <PeopleIcon /> },
        { name: 'Roles', href: '/dashboard/admin/roles', icon: <SettingsIcon /> },
        { name: 'Activity Types', href: '/dashboard/admin/activity-types', icon: <TaskIcon /> },
        { name: 'Opportunity Types', href: '/dashboard/admin/opportunity-types', icon: <WorkIcon /> },
        { name: 'Custom Fields', href: '/dashboard/admin/custom-fields', icon: <ExtensionIcon /> },
        { name: 'Sales Groups', href: '/dashboard/admin/sales-groups', icon: <GroupsIcon />, enabled: user?.features?.salesGroupsEnabled !== false },
        { name: 'Assignment Rules', href: '/dashboard/admin/assignment-rules', icon: <RuleIcon /> },
        { name: 'Settings', href: '/dashboard/settings', icon: <TuneIcon /> },
    ];

    const platformNavigation: NavItem[] = [
        { name: 'Tenants', href: '/platform-admin', icon: <PlatformIcon />, adminOnly: true },
        { name: 'Audit Logs', href: '/platform-admin/audit-logs', icon: <SecurityIcon />, adminOnly: true },
    ];

    const renderNavItem = (item: NavItem) => {
        // Precise route matching: active if current path is exactly item.href 
        // OR if it's a sub-path of item.href (except for root dashboard)
        const isRoot = item.href === '/dashboard';
        const active = isRoot ? pathname === '/dashboard' : (pathname === item.href || pathname.startsWith(item.href + '/'));

        return (
            <ListItem key={item.name} disablePadding sx={{ display: 'block', mb: 0.5 }}>
                <Tooltip
                    title={!open && !isMobile ? item.name : ''}
                    placement="right"
                    arrow
                    enterDelay={400}
                >
                    <ListItemButton
                        onClick={() => {
                            router.push(item.href);
                            if (isMobile) toggleDrawer();
                        }}
                        sx={{
                            minHeight: 48,
                            justifyContent: open ? 'initial' : 'center',
                            px: 2,
                            borderRadius: active ? '16px 28px 28px 16px' : 28, // M3 indicative shape
                            mx: open ? 0 : 1, // Add margin in rail mode for better centering
                            backgroundColor: active ? theme.palette.secondaryContainer : 'transparent',
                            color: active ? theme.palette.onSecondaryContainer : theme.palette.onSurfaceVariant,
                            '&:hover': {
                                backgroundColor: active
                                    ? alpha(theme.palette.secondaryContainer, 0.8)
                                    : alpha(theme.palette.onSurface, 0.08),
                            },
                            transition: theme.transitions.create(['background-color', 'color', 'transform', 'border-radius'], {
                                duration: theme.transitions.duration.shorter,
                            }),
                        }}
                    >
                        <ListItemIcon
                            sx={{
                                minWidth: 0,
                                mr: open ? 2 : 'auto',
                                justifyContent: 'center',
                                color: active ? theme.palette.onSecondaryContainer : theme.palette.onSurfaceVariant,
                                transition: 'margin 0.2s',
                            }}
                        >
                            {/* Visual indicator for active item in rail mode */}
                            {!open && active ? (
                                <Box sx={{
                                    bgcolor: theme.palette.secondaryContainer,
                                    p: 1,
                                    borderRadius: 3,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: theme.palette.onSecondaryContainer
                                }}>
                                    {item.icon}
                                </Box>
                            ) : item.icon}
                        </ListItemIcon>
                        <ListItemText
                            primary={item.name}
                            sx={{
                                opacity: open ? 1 : 0,
                                display: open ? 'block' : 'none', // Remove from DOM in rail mode to prevent text wrapping issues
                            }}
                            primaryTypographyProps={{
                                variant: 'labelLarge',
                                fontWeight: active ? 700 : 500,
                            }}
                        />
                    </ListItemButton>
                </Tooltip>
            </ListItem>
        );
    };

    const renderSection = (
        title: string,
        items: NavItem[],
        isOpen: boolean,
        onToggle: () => void,
    ) => {
        const filtered = items.filter(item => item.enabled !== false && (!item.adminOnly || user?.isPlatformAdmin));
        if (filtered.length === 0) return null;

        // Check if any child is active
        const hasActiveChild = filtered.some(item => pathname === item.href || pathname.startsWith(item.href + '/'));

        return (
            <Box sx={{ mb: 1 }}>
                {(open || isMobile) ? (
                    <ListItemButton
                        onClick={onToggle}
                        sx={{
                            mx: 2,
                            borderRadius: 2,
                            py: 1,
                            minHeight: 40,
                            color: hasActiveChild ? 'primary.main' : 'text.secondary',
                        }}
                    >
                        <ListItemText
                            primary={title}
                            primaryTypographyProps={{
                                variant: 'labelMedium',
                                sx: { fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase' },
                            }}
                        />
                        {isOpen ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
                    </ListItemButton>
                ) : (
                    <Divider sx={{ mx: 2, my: 1 }} />
                )}
                <Collapse in={(open || isMobile) && isOpen} timeout="auto" unmountOnExit>
                    <List sx={{ px: (open || isMobile) ? 1.5 : 1, pt: 0 }}>
                        {filtered.map(renderNavItem)}
                    </List>
                </Collapse>
                {!open && !isMobile && hasActiveChild && (
                    <Box sx={{ width: 4, height: 24, bgcolor: 'primary.main', position: 'absolute', left: 0, borderRadius: '0 4px 4px 0' }} />
                )}
            </Box>
        );
    };

    const drawerContent = (
        <>
            <DrawerHeader>
                {(open || isMobile) ? (
                    <>
                        <Box display="flex" alignItems="center" gap={1.5} sx={{ px: 0 }}>
                            <Box
                                sx={{
                                    width: 36,
                                    height: 36,
                                    bgcolor: theme.palette.primary.main,
                                    color: theme.palette.primary.contrastText,
                                    borderRadius: 2,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontWeight: 'bold',
                                    fontSize: '1.1rem',
                                }}
                            >
                                E
                            </Box>
                            <Typography variant="titleMedium" sx={{ fontWeight: 700 }}>
                                Enterprise CRM
                            </Typography>
                        </Box>
                        {/* Always-visible expand/collapse toggle */}
                        <IconButton onClick={toggleDrawer} size="small">
                            {isMobile ? <ChevronLeftIcon /> : <ChevronLeftIcon />}
                        </IconButton>
                    </>
                ) : (
                    <Box sx={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
                        <IconButton onClick={toggleDrawer} size="small">
                            <ChevronRightIcon />
                        </IconButton>
                    </Box>
                )}
            </DrawerHeader>

            <Box sx={{ flexGrow: 1, overflowY: 'auto', mt: 1 }}>
                {/* Main navigation */}
                <List sx={{ px: 1.5 }}>
                    {navigation.filter(item => item.enabled !== false).map(renderNavItem)}
                </List>

                <Divider sx={{ my: 1.5, mx: 2 }} />

                {/* Administration section */}
                {renderSection('Administration', adminNavigation, adminOpen, () => setAdminOpen(!adminOpen))}

                <Divider sx={{ my: 1.5, mx: 2 }} />

                {/* Custom Objects section */}
                {customObjects.length > 0 && renderSection('Custom Objects', customObjects.map(obj => ({
                    name: obj.label || obj.name,
                    href: `/dashboard/objects/${obj.name}`,
                    icon: <ExtensionIcon />
                })), customOpen, () => setCustomOpen(!customOpen))}

                {/* Platform section (only for platform admins) */}
                {user?.isPlatformAdmin && (
                    <>
                        <Divider sx={{ my: 1.5, mx: 2 }} />
                        {renderSection('Platform', platformNavigation, platformOpen, () => setPlatformOpen(!platformOpen))}
                    </>
                )}
            </Box>
        </>
    );

    if (isMobile) {
        return (
            <Drawer
                variant="temporary"
                open={open}
                onClose={toggleDrawer}
                ModalProps={{ keepMounted: true }}
                sx={{
                    display: { xs: 'block', md: 'none' },
                    '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth },
                }}
            >
                {drawerContent}
            </Drawer>
        );
    }

    return (
        <StyledDrawer variant="permanent" open={open}>
            {drawerContent}
        </StyledDrawer>
    );
}
