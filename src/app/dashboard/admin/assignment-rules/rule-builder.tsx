"use client";

import { useState, useEffect } from "react";
import {
    Button,
    Drawer,
    Box,
    Typography,
    TextField,
    Select,
    MenuItem,
    FormControl,
    InputLabel,
    Checkbox,
    FormControlLabel,
    Stack,
    Divider,
    IconButton,
    Paper,
    Grid,
    FormHelperText,
    useTheme,
    alpha
} from "@mui/material";
import {
    Close as CloseIcon,
    People as UsersIcon,
    Group as GroupIcon,
    Delete as TrashIcon,
    Add as AddIcon
} from "@mui/icons-material";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";

interface RuleBuilderProps {
    open: boolean;
    setOpen: (open: boolean) => void;
    rule?: any;
    onSave: (rule: any) => Promise<void>;
}

export function RuleBuilder({ open, setOpen, rule, onSave }: RuleBuilderProps) {
    const theme = useTheme();
    const [form, setForm] = useState<any>({
        name: "",
        description: "",
        entityType: "LEAD",
        type: "ROUND_ROBIN",
        priority: 100,
        isActive: true,
    });
    const [config, setConfig] = useState<any>({
        userPool: [],
        salesGroupId: undefined,
        fallbackUserId: undefined,
        matchingKeys: {},
    });
    const [targetType, setTargetType] = useState<"USER_POOL" | "SALES_GROUP">("USER_POOL");

    const [users, setUsers] = useState<any[]>([]);
    const [salesGroups, setSalesGroups] = useState<any[]>([]);

    useEffect(() => {
        if (open) {
            apiFetch("/users").then(setUsers).catch(() => toast.error("Failed to load users"));
            apiFetch("/sales-groups").then(setSalesGroups).catch(() => toast.error("Failed to load sales groups"));
        }
    }, [open]);

    // Initialize from existing rule
    useEffect(() => {
        if (rule) {
            setForm({
                name: rule.name,
                description: rule.description || "",
                entityType: rule.entityType,
                type: rule.type,
                priority: rule.priority ?? 100,
                isActive: rule.isActive,
            });

            const ruleConfig = rule.config || {};
            if (ruleConfig.salesGroupId) {
                setTargetType("SALES_GROUP");
                setConfig({ ...ruleConfig, userPool: [] }); // Clear pool if group used
            } else {
                setTargetType("USER_POOL");
                setConfig({ ...ruleConfig, salesGroupId: undefined });
            }
        } else {
            // Reset for new rule
            setForm({
                name: "",
                description: "",
                entityType: "LEAD",
                type: "ROUND_ROBIN",
                priority: 100,
                isActive: true,
            });
            setConfig({
                userPool: [],
                salesGroupId: undefined,
                fallbackUserId: undefined,
                matchingKeys: {},
            });
            setTargetType("USER_POOL");
        }
    }, [rule, open]);

    const handleSave = async () => {
        const payload = { ...form, config: { ...config } };

        // Clean up config based on type
        if (targetType === "SALES_GROUP") {
            delete payload.config.userPool;
        } else {
            delete payload.config.salesGroupId;
        }

        try {
            await onSave(payload);
            setOpen(false);
        } catch (error) {
            // Handled by parent
        }
    };

    // State for new matching key inputs
    const [newEntityField, setNewEntityField] = useState("");
    const [newSkillKey, setNewSkillKey] = useState("");

    const addMatchingKey = () => {
        if (newEntityField && newSkillKey) {
            const current = { ...config.matchingKeys };
            current[newEntityField] = newSkillKey;
            setConfig({ ...config, matchingKeys: current });
            setNewEntityField("");
            setNewSkillKey("");
        }
    };

    const removeMatchingKey = (key: string) => {
        const current = { ...config.matchingKeys };
        delete current[key];
        setConfig({ ...config, matchingKeys: current });
    };

    const handleClose = () => setOpen(false);

    return (
        <Drawer
            anchor="right"
            open={open}
            onClose={handleClose}
            PaperProps={{ sx: { width: { xs: '100%', sm: 600, md: 800 } } }}
        >
            <Box sx={{ p: 3, height: '100%', display: 'flex', flexDirection: 'column' }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
                    <Box>
                        <Typography variant="h6" sx={{ fontWeight: 600 }}>
                            {rule ? "Edit Assignment Rule" : "Create Assignment Rule"}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            Define how leads should be routed to your team.
                        </Typography>
                    </Box>
                    <IconButton onClick={handleClose}>
                        <CloseIcon />
                    </IconButton>
                </Stack>
                <Divider sx={{ mb: 3 }} />

                <Box sx={{ flexGrow: 1, overflowY: 'auto', pr: 1 }}>
                    <Stack spacing={2}>
                        <TextField
                            label="Rule Name"
                            placeholder="e.g. Inbound Leads - North America"
                            fullWidth
                            value={form.name}
                            onChange={(e) => setForm({ ...form, name: e.target.value })}
                        />
                        <TextField
                            label="Description"
                            placeholder="When this rule should run and who should receive the record"
                            fullWidth
                            multiline
                            minRows={2}
                            value={form.description}
                            onChange={(e) => setForm({ ...form, description: e.target.value })}
                        />

                        <Grid container spacing={2}>
                            <Grid size={{ xs: 12, md: 4 }}>
                                <FormControl fullWidth>
                                    <InputLabel>Entity Type</InputLabel>
                                    <Select
                                        value={form.entityType}
                                        label="Entity Type"
                                        onChange={(e) => setForm({ ...form, entityType: e.target.value })}
                                    >
                                        <MenuItem value="LEAD">Lead</MenuItem>
                                        <MenuItem value="OPPORTUNITY">Opportunity</MenuItem>
                                    </Select>
                                </FormControl>
                            </Grid>
                            <Grid size={{ xs: 12, md: 4 }}>
                                <FormControl fullWidth>
                                    <InputLabel>Assignment Strategy</InputLabel>
                                    <Select
                                        value={form.type}
                                        label="Assignment Strategy"
                                        onChange={(e) => setForm({ ...form, type: e.target.value })}
                                    >
                                        <MenuItem value="ROUND_ROBIN">Round Robin</MenuItem>
                                        <MenuItem value="LOAD_BASED">Load Based</MenuItem>
                                        <MenuItem value="SKILL_BASED">Skill Based</MenuItem>
                                        <MenuItem value="WEIGHTED">Weighted Round Robin</MenuItem>
                                    </Select>
                                </FormControl>
                            </Grid>
                            <Grid size={{ xs: 12, md: 4 }}>
                                <TextField
                                    label="Priority"
                                    type="number"
                                    fullWidth
                                    value={form.priority}
                                    onChange={(e) => setForm({ ...form, priority: Number(e.target.value) || 0 })}
                                    helperText="Higher priority runs first"
                                />
                            </Grid>
                        </Grid>

                        <Paper variant="outlined" sx={{ p: 3, borderRadius: 2 }}>
                            <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600 }}>Routing Target</Typography>

                            <Stack direction="row" spacing={2} sx={{ mb: 3 }}>
                                <Button
                                    variant={targetType === "USER_POOL" ? "contained" : "outlined"}
                                    onClick={() => setTargetType("USER_POOL")}
                                    startIcon={<UsersIcon />}
                                    sx={{ borderRadius: 20 }}
                                >
                                    Specific Users
                                </Button>
                                <Button
                                    variant={targetType === "SALES_GROUP" ? "contained" : "outlined"}
                                    onClick={() => setTargetType("SALES_GROUP")}
                                    startIcon={<GroupIcon />}
                                    sx={{ borderRadius: 20 }}
                                >
                                    Sales Group
                                </Button>
                            </Stack>

                            {targetType === "USER_POOL" ? (
                                <Box>
                                    <Typography variant="body2" sx={{ mb: 1 }}>Select Users</Typography>
                                    <Paper variant="outlined" sx={{ maxHeight: 200, overflowY: 'auto', p: 1 }}>
                                        <Grid container>
                                            {users.map((u) => (
                                                <Grid size={{ xs: 6 }} key={u.id}>
                                                    <FormControlLabel
                                                        control={
                                                            <Checkbox
                                                                checked={config.userPool?.includes(u.id)}
                                                                onChange={(e) => {
                                                                    const pool = config.userPool || [];
                                                                    if (e.target.checked) {
                                                                        setConfig({ ...config, userPool: [...pool, u.id] });
                                                                    } else {
                                                                        setConfig({ ...config, userPool: pool.filter((id: string) => id !== u.id) });
                                                                    }
                                                                }}
                                                            />
                                                        }
                                                        label={<Typography variant="body2">{u.name}</Typography>}
                                                    />
                                                </Grid>
                                            ))}
                                        </Grid>
                                    </Paper>
                                </Box>
                            ) : (
                                <FormControl fullWidth>
                                    <InputLabel>Select Sales Group</InputLabel>
                                    <Select
                                        value={config.salesGroupId || ""}
                                        label="Select Sales Group"
                                        onChange={(e) => setConfig({ ...config, salesGroupId: e.target.value })}
                                    >
                                        {salesGroups.map((g) => (
                                            <MenuItem key={g.id} value={g.id}>
                                                {g.name} ({g._count?.members || 0} members)
                                            </MenuItem>
                                        ))}
                                    </Select>
                                </FormControl>
                            )}
                        </Paper>

                        <Paper variant="outlined" sx={{ p: 3, borderRadius: 2 }}>
                            <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600 }}>Fallback Owner</Typography>
                            <FormControl fullWidth size="small">
                                <InputLabel>Fallback User</InputLabel>
                                <Select
                                    value={config.fallbackUserId || ""}
                                    label="Fallback User"
                                    onChange={(e) => setConfig({ ...config, fallbackUserId: e.target.value || undefined })}
                                >
                                    <MenuItem value=""><em>No fallback</em></MenuItem>
                                    {users.map((u) => (
                                        <MenuItem key={u.id} value={u.id}>{u.name || u.email}</MenuItem>
                                    ))}
                                </Select>
                                <FormHelperText>Used when the rule matches but no target user is eligible.</FormHelperText>
                            </FormControl>
                        </Paper>

                        <Paper variant="outlined" sx={{ p: 3, borderRadius: 2, bgcolor: alpha(theme.palette.action.hover, 0.04) }}>
                            <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600 }}>Rule Criteria</Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                                Add field/value conditions. All conditions must match before distribution runs.
                            </Typography>

                            <Grid container spacing={2} sx={{ mb: 1 }}>
                                <Grid size={{ xs: 5 }}><Typography variant="caption" fontWeight={600} color="text.secondary">Record Field</Typography></Grid>
                                <Grid size={{ xs: 5 }}><Typography variant="caption" fontWeight={600} color="text.secondary">Expected Value</Typography></Grid>
                                <Grid size={{ xs: 2 }}></Grid>
                            </Grid>

                            {Object.entries(config.matchingKeys || {}).map(([entityField, userSkillKey], index) => (
                                <Grid container spacing={2} key={index} alignItems="center" sx={{ mb: 1 }}>
                                    <Grid size={{ xs: 5 }}>
                                        <TextField size="small" value={entityField} disabled fullWidth sx={{ bgcolor: 'background.paper' }} />
                                    </Grid>
                                    <Grid size={{ xs: 5 }}>
                                        <TextField size="small" value={userSkillKey as string} disabled fullWidth sx={{ bgcolor: 'background.paper' }} />
                                    </Grid>
                                    <Grid size={{ xs: 2 }}>
                                        <IconButton size="small" color="error" onClick={() => removeMatchingKey(entityField)}>
                                            <TrashIcon fontSize="small" />
                                        </IconButton>
                                    </Grid>
                                </Grid>
                            ))}

                            <Grid container spacing={2} alignItems="center">
                                <Grid size={{ xs: 5 }}>
                                    <TextField
                                        size="small"
                                        placeholder={form.entityType === "LEAD" ? "source" : "priority"}
                                        fullWidth
                                        value={newEntityField}
                                        onChange={(e) => setNewEntityField(e.target.value)}
                                    />
                                </Grid>
                                <Grid size={{ xs: 5 }}>
                                    <TextField
                                        size="small"
                                        placeholder={form.entityType === "LEAD" ? "Website" : "HIGH"}
                                        fullWidth
                                        value={newSkillKey}
                                        onChange={(e) => setNewSkillKey(e.target.value)}
                                    />
                                </Grid>
                                <Grid size={{ xs: 2 }}>
                                    <Button variant="contained" size="small" onClick={addMatchingKey} sx={{ minWidth: 'auto', borderRadius: 8 }}>
                                        <AddIcon fontSize="small" />
                                    </Button>
                                </Grid>
                            </Grid>
                        </Paper>

                        {false && form.type === "SKILL_BASED" && (
                            <Paper variant="outlined" sx={{ p: 3, borderRadius: 2, bgcolor: alpha(theme.palette.action.hover, 0.05) }}>
                                <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600 }}>Skill Matching Configuration</Typography>

                                <Grid container spacing={2} sx={{ mb: 1 }}>
                                    <Grid size={{ xs: 5 }}><Typography variant="caption" fontWeight={600} color="text.secondary">Entity Field</Typography></Grid>
                                    <Grid size={{ xs: 5 }}><Typography variant="caption" fontWeight={600} color="text.secondary">User Skill Key</Typography></Grid>
                                    <Grid size={{ xs: 2 }}></Grid>
                                </Grid>

                                {Object.entries(config.matchingKeys || {}).map(([entityField, userSkillKey], index) => (
                                    <Grid container spacing={2} key={index} alignItems="center" sx={{ mb: 1 }}>
                                        <Grid size={{ xs: 5 }}>
                                            <TextField size="small" value={entityField} disabled fullWidth sx={{ bgcolor: 'background.paper' }} />
                                        </Grid>
                                        <Grid size={{ xs: 5 }}>
                                            <TextField size="small" value={userSkillKey as string} disabled fullWidth sx={{ bgcolor: 'background.paper' }} />
                                        </Grid>
                                        <Grid size={{ xs: 2 }}>
                                            <IconButton size="small" color="error" onClick={() => removeMatchingKey(entityField)}>
                                                <TrashIcon fontSize="small" />
                                            </IconButton>
                                        </Grid>
                                    </Grid>
                                ))}

                                <Divider sx={{ my: 2 }} />

                                <Grid container spacing={2} alignItems="center">
                                    <Grid size={{ xs: 5 }}>
                                        <TextField
                                            size="small"
                                            placeholder="Entity Field"
                                            fullWidth
                                            value={newEntityField}
                                            onChange={(e) => setNewEntityField(e.target.value)}
                                        />
                                    </Grid>
                                    <Grid size={{ xs: 5 }}>
                                        <TextField
                                            size="small"
                                            placeholder="Skill Key"
                                            fullWidth
                                            value={newSkillKey}
                                            onChange={(e) => setNewSkillKey(e.target.value)}
                                        />
                                    </Grid>
                                    <Grid size={{ xs: 2 }}>
                                        <Button variant="contained" size="small" onClick={addMatchingKey} sx={{ minWidth: 'auto', borderRadius: 8 }}>
                                            <AddIcon fontSize="small" />
                                        </Button>
                                    </Grid>
                                </Grid>
                            </Paper>
                        )}
                    </Stack>
                </Box>

                <Box sx={{ pt: 3, mt: 'auto' }}>
                    <Stack direction="row" justifyContent="flex-end" spacing={2}>
                        <Button variant="outlined" onClick={handleClose} sx={{ borderRadius: 20 }}>
                            Cancel
                        </Button>
                        <Button variant="contained" onClick={handleSave} sx={{ borderRadius: 20 }}>
                            Save Rule
                        </Button>
                    </Stack>
                </Box>
            </Box>
        </Drawer>
    );
}
