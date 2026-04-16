'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
    AppBar,
    Toolbar,
    Typography,
    IconButton,
    Avatar,
    Menu,
    MenuItem,
    Box,
    Button,
    Divider,
    ListItemIcon,
    Tooltip,
} from '@mui/material';
import {
    Menu as MenuIcon,
    Notifications as NotificationsIcon,
    Add as AddIcon,
    Search as SearchIcon,
    Logout as LogoutIcon,
    Settings as SettingsIcon,
} from '@mui/icons-material';
import { useAuth } from '@/providers/auth-provider';
import { NotificationBell } from './notification-bell';
import { CreateLeadDialog } from '@/app/dashboard/leads/create-lead-dialog';
import { CreateOpportunityDialog } from '@/app/dashboard/opportunities/create-opportunity-dialog';
import { CreateActivityDialog } from '@/app/dashboard/activities/create-activity-dialog';

export function Header() {
    const { user, logout } = useAuth();
    const router = useRouter();
    const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
    const [createAnchorEl, setCreateAnchorEl] = React.useState<null | HTMLElement>(null);

    // Dialog Control States
    const [createLeadOpen, setCreateLeadOpen] = React.useState(false);
    const [createOpportunityOpen, setCreateOpportunityOpen] = React.useState(false);
    const [createActivityOpen, setCreateActivityOpen] = React.useState(false);

    const handleProfileMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
        setAnchorEl(event.currentTarget);
    };

    const handleCreateMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
        setCreateAnchorEl(event.currentTarget);
    };

    const handleMenuClose = () => {
        setAnchorEl(null);
        setCreateAnchorEl(null);
    };

    const initials = user?.email?.substring(0, 2).toUpperCase() || 'U';

    return (
        <AppBar
            position="sticky"
            elevation={0}
            sx={{
                bgcolor: 'background.paper',
                color: 'text.primary',
                borderBottom: '1px solid',
                borderColor: 'divider',
                zIndex: (theme) => theme.zIndex.drawer + 1,
            }}
        >
            <Toolbar sx={{ justifyContent: 'space-between', px: { xs: 2, md: 4 } }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexGrow: 1 }}>
                    <Typography variant="h6" sx={{ display: { md: 'none' }, fontWeight: 700, color: 'primary.main' }}>
                        CRM
                    </Typography>

                    {/* Global Search */}
                    <Box sx={{
                        flexGrow: 1,
                        display: 'flex',
                        justifyContent: 'center',
                        mx: { xs: 0, md: 4 }
                    }}>
                        <Box sx={{
                            display: 'flex',
                            alignItems: 'center',
                            bgcolor: 'action.hover',
                            borderRadius: 10,
                            px: 2,
                            py: 0.5,
                            width: '100%',
                            maxWidth: 600,
                            border: '1px solid transparent',
                            '&:hover': {
                                bgcolor: 'action.selected',
                            },
                            '&:focus-within': {
                                bgcolor: 'background.paper',
                                border: '1px solid',
                                borderColor: 'primary.main',
                                boxShadow: 1
                            }
                        }}>
                            <SearchIcon sx={{ color: 'text.secondary', mr: 1 }} />
                            <Box
                                component="input"
                                placeholder="Search leads, opportunities, activities..."
                                sx={{
                                    border: 'none',
                                    outline: 'none',
                                    bgcolor: 'transparent',
                                    width: '100%',
                                    fontSize: '0.9375rem',
                                    color: 'text.primary',
                                    '&::placeholder': { color: 'text.secondary' }
                                }}
                            />
                        </Box>
                    </Box>
                </Box>

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    {/* Quick Create */}
                    <Button
                        variant="contained"
                        color="primary"
                        size="medium"
                        startIcon={<AddIcon />}
                        onClick={handleCreateMenuOpen}
                        sx={{
                            display: { xs: 'none', sm: 'flex' },
                            borderRadius: 3,
                            bgcolor: 'primary.main',
                            color: 'white',
                            '&:hover': {
                                bgcolor: 'primary.dark',
                            }
                        }}
                    >
                        Create
                    </Button>

                    <Menu
                        anchorEl={createAnchorEl}
                        open={Boolean(createAnchorEl)}
                        onClose={handleMenuClose}
                        transformOrigin={{ horizontal: 'right', vertical: 'top' }}
                        anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
                    >
                        <MenuItem onClick={() => { handleMenuClose(); setCreateLeadOpen(true); }}>
                            New Lead
                        </MenuItem>
                        <MenuItem onClick={() => { handleMenuClose(); setCreateOpportunityOpen(true); }}>
                            New Opportunity
                        </MenuItem>
                        <MenuItem onClick={() => { handleMenuClose(); setCreateActivityOpen(true); }}>
                            Log Activity
                        </MenuItem>
                    </Menu>

                    <NotificationBell />

                    <Divider orientation="vertical" flexItem sx={{ mx: 1 }} />

                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, ml: 1 }}>
                        <Box sx={{ display: { xs: 'none', md: 'block' }, textAlign: 'right' }}>
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                {user?.email?.split('@')[0]}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                                {user?.tenantId?.substring(0, 8)}...
                            </Typography>
                        </Box>

                        <Tooltip title="Profile">
                            <IconButton onClick={handleProfileMenuOpen} sx={{ p: 0.5 }}>
                                <Avatar
                                    sx={{
                                        width: 36,
                                        height: 36,
                                        bgcolor: 'primary.main',
                                        fontWeight: 600,
                                        fontSize: '0.875rem'
                                    }}
                                >
                                    {initials}
                                </Avatar>
                            </IconButton>
                        </Tooltip>
                    </Box>

                    <Menu
                        anchorEl={anchorEl}
                        open={Boolean(anchorEl)}
                        onClose={handleMenuClose}
                        transformOrigin={{ horizontal: 'right', vertical: 'top' }}
                        anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
                        PaperProps={{
                            elevation: 4,
                            sx: { minWidth: 200, mt: 1.5, borderRadius: 2 }
                        }}
                    >
                        <Box p={2}>
                            <Typography variant="subtitle2" noWrap>{user?.email}</Typography>
                            <Typography variant="body2" color="text.secondary" noWrap>Tenant: {user?.tenantId}</Typography>
                        </Box>
                        <Divider />
                        <MenuItem onClick={() => { handleMenuClose(); router.push('/dashboard/settings'); }}>
                            <ListItemIcon><SettingsIcon fontSize="small" /></ListItemIcon>
                            Settings
                        </MenuItem>
                        <MenuItem onClick={() => { handleMenuClose(); logout(); }}>
                            <ListItemIcon><LogoutIcon fontSize="small" /></ListItemIcon>
                            Log out
                        </MenuItem>
                    </Menu>
                </Box>

                {/* Global Dialogs */}
                <CreateLeadDialog
                    open={createLeadOpen}
                    onOpenChange={setCreateLeadOpen}
                    onSuccess={() => window.location.reload()}
                    trigger={<span hidden />}
                />
                <CreateOpportunityDialog
                    open={createOpportunityOpen}
                    onOpenChange={setCreateOpportunityOpen}
                    onSuccess={() => window.location.reload()}
                    trigger={<span hidden />}
                />
                <CreateActivityDialog
                    open={createActivityOpen}
                    onOpenChange={setCreateActivityOpen}
                    onSuccess={() => window.location.reload()}
                    trigger={<span hidden />}
                />
            </Toolbar>
        </AppBar>
    );
}
