'use client';

import * as React from 'react';
import {
    IconButton,
    Badge,
    Menu,
    MenuItem,
    Typography,
    Box,
    Button,
    Divider,
    List,
    ListItem,
    ListItemText,
} from '@mui/material';
import { Notifications as NotificationsIcon } from '@mui/icons-material';
import { useNotifications } from '@/providers/notification-provider';
import { formatDistanceToNow } from 'date-fns';

export function NotificationBell() {
    const { notifications, unreadCount, clearNotifications } = useNotifications();
    const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);

    const handleClick = (event: React.MouseEvent<HTMLElement>) => {
        setAnchorEl(event.currentTarget);
    };

    const handleClose = () => {
        setAnchorEl(null);
    };

    return (
        <>
            <Tooltip title="Notifications">
                <IconButton color="inherit" onClick={handleClick}>
                    <Badge badgeContent={unreadCount} color="error">
                        <NotificationsIcon />
                    </Badge>
                </IconButton>
            </Tooltip>

            <Menu
                anchorEl={anchorEl}
                open={Boolean(anchorEl)}
                onClose={handleClose}
                transformOrigin={{ horizontal: 'right', vertical: 'top' }}
                anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
                PaperProps={{
                    sx: {
                        width: 320,
                        maxHeight: 480,
                        borderRadius: 3,
                        mt: 1.5,
                        boxShadow: '0px 4px 20px rgba(0,0,0,0.1)'
                    }
                }}
            >
                <Box sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Typography variant="h6" sx={{ fontSize: '1rem', fontWeight: 700 }}>
                        Notifications
                    </Typography>
                    {notifications.length > 0 && (
                        <Button size="small" onClick={clearNotifications} sx={{ textTransform: 'none' }}>
                            Clear all
                        </Button>
                    )}
                </Box>
                <Divider />
                <List sx={{ p: 0 }}>
                    {notifications.length === 0 ? (
                        <Box sx={{ p: 4, textAlign: 'center' }}>
                            <Typography variant="body2" color="text.secondary">
                                No notifications
                            </Typography>
                        </Box>
                    ) : (
                        notifications.map((notif, i) => (
                            <React.Fragment key={i}>
                                <ListItem alignItems="flex-start" sx={{ py: 1.5, '&:hover': { bgcolor: 'action.hover' } }}>
                                    <ListItemText
                                        primary={
                                            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                                <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                                                    {notif.title}
                                                </Typography>
                                                <Typography variant="caption" color="text.secondary">
                                                    {formatDistanceToNow(new Date(notif.timestamp), { addSuffix: true })}
                                                </Typography>
                                            </Box>
                                        }
                                        secondary={
                                            <Typography
                                                variant="body2"
                                                color="text.secondary"
                                                sx={{ mt: 0.5, lineHeight: 1.4 }}
                                            >
                                                {notif.message}
                                            </Typography>
                                        }
                                    />
                                </ListItem>
                                {i < notifications.length - 1 && <Divider />}
                            </React.Fragment>
                        ))
                    )}
                </List>
            </Menu>
        </>
    );
}

// Internal helper for Tooltip (optional but better UX)
import { Tooltip } from '@mui/material';
