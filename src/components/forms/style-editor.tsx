"use client";

import {
    Box,
    Typography,
    TextField,
    Select,
    MenuItem,
    FormControl,
    InputLabel,
    Input,
    Stack,
    Button,
    ButtonGroup,
    Paper,
    useTheme,
    alpha
} from "@mui/material";
import {
    Palette as PaletteIcon,
    TextFields as TypeIcon
} from "@mui/icons-material";

interface StyleEditorProps {
    values: {
        theme: string;
        customCss: string;
    };
    onChange: (values: { theme: string; customCss: string }) => void;
}

const THEMES = [
    { value: "default", label: "Default" },
    { value: "minimal", label: "Minimal" },
    { value: "modern", label: "Modern" },
    { value: "dark", label: "Dark" },
];

const FONTS = [
    { value: "Inter, sans-serif", label: "Inter" },
    { value: "Roboto, sans-serif", label: "Roboto" },
    { value: "Open Sans, sans-serif", label: "Open Sans" },
    { value: "Merriweather, serif", label: "Merriweather" },
    { value: "Courier New, monospace", label: "Monospace" },
];

export function StyleEditor({ values, onChange }: StyleEditorProps) {
    const theme = useTheme();
    const updateCssVariable = (variable: string, value: string) => {
        let css = values.customCss || "";
        const rootRegex = /:root\s*{([^}]*)}/;
        const match = css.match(rootRegex);
        let newRootContent = "";

        if (match) {
            let rootContent = match[1];
            if (rootContent.includes(variable)) {
                const varRegex = new RegExp(`${variable}:[^;]*;`);
                rootContent = rootContent.replace(varRegex, `${variable}: ${value};`);
            } else {
                rootContent += `\n  ${variable}: ${value};`;
            }
            newRootContent = `:root {${rootContent}}`;
            css = css.replace(rootRegex, newRootContent);
        } else {
            newRootContent = `:root {\n  ${variable}: ${value};\n}`;
            css = `${newRootContent}\n${css}`;
        }
        onChange({ ...values, customCss: css });
    };

    const getCssVariable = (variable: string) => {
        const match = values.customCss?.match(new RegExp(`${variable}:\\s*([^;]*)`));
        return match ? match[1].trim() : "";
    };

    return (
        <Stack spacing={3}>
            <FormControl fullWidth size="small">
                <InputLabel>Theme Preset</InputLabel>
                <Select
                    value={values.theme}
                    label="Theme Preset"
                    onChange={(e) => onChange({ ...values, theme: e.target.value })}
                >
                    {THEMES.map(t => (
                        <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>
                    ))}
                </Select>
            </FormControl>

            <Paper
                elevation={0}
                sx={{
                    p: 3,
                    borderRadius: '24px',
                    bgcolor: alpha(theme.palette.primary.main, 0.02),
                    border: `1px solid ${theme.palette.divider}`
                }}
            >
                <Stack spacing={2.5}>
                    <Typography variant="overline" sx={{ display: 'flex', alignItems: 'center', gap: 1, fontWeight: 700, color: 'text.secondary' }}>
                        <PaletteIcon fontSize="small" /> Color Palette
                    </Typography>
                    <ColorInput
                        label="Primary"
                        variable="--primary"
                        value={getCssVariable("--primary") || "#0f172a"}
                        onChange={(v) => updateCssVariable("--primary", v)}
                    />
                    <ColorInput
                        label="Background"
                        variable="--background"
                        value={getCssVariable("--background") || "#ffffff"}
                        onChange={(v) => updateCssVariable("--background", v)}
                    />
                    <ColorInput
                        label="Text"
                        variable="--foreground"
                        value={getCssVariable("--foreground") || "#020817"}
                        onChange={(v) => updateCssVariable("--foreground", v)}
                    />
                </Stack>
            </Paper>

            <Paper
                elevation={0}
                sx={{
                    p: 3,
                    borderRadius: '24px',
                    bgcolor: alpha(theme.palette.primary.main, 0.02),
                    border: `1px solid ${theme.palette.divider}`
                }}
            >
                <Stack spacing={2.5}>
                    <Typography variant="overline" sx={{ display: 'flex', alignItems: 'center', gap: 1, fontWeight: 700, color: 'text.secondary' }}>
                        <TypeIcon fontSize="small" /> Typography
                    </Typography>
                    <FormControl fullWidth size="small">
                        <InputLabel>Font Family</InputLabel>
                        <Select
                            value={getCssVariable("--font-sans")}
                            label="Font Family"
                            onChange={(e) => updateCssVariable("--font-sans", e.target.value)}
                            sx={{ borderRadius: '12px' }}
                        >
                            {FONTS.map(f => (
                                <MenuItem key={f.value} value={f.value}>{f.label}</MenuItem>
                            ))}
                        </Select>
                    </FormControl>

                    <Box>
                        <Typography variant="caption" sx={{ fontWeight: 600, mb: 1, display: 'block' }}>Corner Smoothing</Typography>
                        <ButtonGroup size="small" fullWidth sx={{ '& .MuiButton-root': { borderRadius: '12px', border: 'none' } }}>
                            {["0px", "4px", "8px", "16px", "99px"].map((r) => (
                                <Button
                                    key={r}
                                    variant={getCssVariable("--radius") === r ? "contained" : "outlined"}
                                    onClick={() => updateCssVariable("--radius", r)}
                                    sx={{
                                        borderRadius: '12px !important',
                                        mr: 1,
                                        border: '1px solid !important',
                                        borderColor: getCssVariable("--radius") === r ? 'primary.main' : 'divider'
                                    }}
                                >
                                    {r === "99px" ? "Round" : r}
                                </Button>
                            ))}
                        </ButtonGroup>
                    </Box>
                </Stack>
            </Paper>

            <TextField
                label="Custom CSS"
                multiline
                rows={6}
                value={values.customCss}
                onChange={(e) => onChange({ ...values, customCss: e.target.value })}
                placeholder=":root { --primary: blue; }"
                InputProps={{ sx: { fontFamily: 'monospace', fontSize: 12 } }}
            />
        </Stack>
    );
}

function ColorInput({ label, variable, value, onChange }: { label: string, variable: string, value: string, onChange: (val: string) => void }) {
    return (
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="caption">{label}</Typography>
            <Stack direction="row" spacing={1} alignItems="center">
                <Box
                    sx={{
                        width: 24,
                        height: 24,
                        borderRadius: 1,
                        bgcolor: value,
                        border: '1px solid #ddd'
                    }}
                />
                <Input
                    type="color"
                    disableUnderline
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    sx={{ p: 0, width: 0, height: 0, opacity: 0, overflow: 'hidden', position: 'absolute' }}
                    id={`color-${variable}`}
                />
                <Button
                    variant="outlined"
                    size="small"
                    component="label"
                    htmlFor={`color-${variable}`}
                    sx={{ minWidth: 80, p: 0.5, fontSize: 11, textTransform: 'none' }}
                >
                    {value}
                </Button>
            </Stack>
        </Box>
    );
}
