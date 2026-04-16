"use client";

import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useAuth } from "@/providers/auth-provider";
import { apiFetch } from "@/lib/api";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
    Box,
    Button,
    Card,
    CardContent,
    Typography,
    TextField,
    Stack,
    alpha,
    useTheme,
    CircularProgress,
    InputAdornment,
    IconButton
} from "@mui/material";
import {
    Email as EmailIcon,
    Lock as LockIcon,
    Visibility,
    VisibilityOff,
    Login as LoginIcon
} from "@mui/icons-material";
import { motion } from "framer-motion";
import { fadeInUp } from "@/lib/motion";

const formSchema = z.object({
    email: z.string().email("Invalid email address"),
    password: z.string().min(6, "Password must be at least 6 characters"),
});

export default function LoginPage() {
    const { login } = useAuth();
    const router = useRouter();
    const theme = useTheme();
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    const { control, handleSubmit, formState: { errors } } = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            email: "",
            password: "",
        },
    });

    async function onSubmit(values: z.infer<typeof formSchema>) {
        setLoading(true);
        try {
            const res = await apiFetch("/auth/login", {
                method: "POST",
                body: JSON.stringify(values),
            });

            login(res.access_token);
            toast.success("Logged in successfully");
            router.push("/dashboard");
        } catch (error: any) {
            toast.error(error.message || "Failed to login");
        } finally {
            setLoading(false);
        }
    }

    return (
        <Box
            sx={{
                height: '100vh',
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                bgcolor: 'surfaceContainerLowest',
                px: 2
            }}
        >
            <Box
                component={motion.div}
                variants={fadeInUp}
                initial="initial"
                animate="animate"
                sx={{ width: '100%', maxWidth: 440 }}
            >
                <Card
                    elevation={0}
                    sx={{
                        borderRadius: '28px',
                        border: '1px solid',
                        borderColor: 'divider',
                        bgcolor: 'surfaceContainerLow',
                        overflow: 'hidden',
                        boxShadow: '0 4px 20px rgba(0,0,0,0.05)'
                    }}
                >
                    <Box sx={{ p: 4, pb: 2, textAlign: 'center' }}>
                        <Box
                            sx={{
                                width: 48,
                                height: 48,
                                borderRadius: '12px',
                                bgcolor: 'primary.main',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                mx: 'auto',
                                mb: 3,
                                color: 'primary.contrastText'
                            }}
                        >
                            <LoginIcon />
                        </Box>
                        <Typography variant="h4" sx={{ fontWeight: 800, mb: 1, letterSpacing: '-0.5px' }}>
                            Welcome back
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            Log in to your account to continue
                        </Typography>
                    </Box>

                    <CardContent sx={{ p: 4 }}>
                        <form onSubmit={handleSubmit(onSubmit)}>
                            <Stack spacing={3}>
                                <Controller
                                    name="email"
                                    control={control}
                                    render={({ field }) => (
                                        <TextField
                                            {...field}
                                            label="Email address"
                                            fullWidth
                                            error={!!errors.email}
                                            helperText={errors.email?.message}
                                            placeholder="name@company.com"
                                            disabled={loading}
                                            InputProps={{
                                                startAdornment: (
                                                    <InputAdornment position="start">
                                                        <EmailIcon fontSize="small" color="action" />
                                                    </InputAdornment>
                                                ),
                                            }}
                                            sx={{
                                                '& .MuiOutlinedInput-root': { borderRadius: '12px' }
                                            }}
                                        />
                                    )}
                                />

                                <Controller
                                    name="password"
                                    control={control}
                                    render={({ field }) => (
                                        <TextField
                                            {...field}
                                            label="Password"
                                            type={showPassword ? "text" : "password"}
                                            fullWidth
                                            error={!!errors.password}
                                            helperText={errors.password?.message}
                                            disabled={loading}
                                            InputProps={{
                                                startAdornment: (
                                                    <InputAdornment position="start">
                                                        <LockIcon fontSize="small" color="action" />
                                                    </InputAdornment>
                                                ),
                                                endAdornment: (
                                                    <InputAdornment position="end">
                                                        <IconButton
                                                            onClick={() => setShowPassword(!showPassword)}
                                                            edge="end"
                                                            size="small"
                                                        >
                                                            {showPassword ? <VisibilityOff /> : <Visibility />}
                                                        </IconButton>
                                                    </InputAdornment>
                                                ),
                                            }}
                                            sx={{
                                                '& .MuiOutlinedInput-root': { borderRadius: '12px' }
                                            }}
                                        />
                                    )}
                                />

                                <Button
                                    type="submit"
                                    variant="contained"
                                    fullWidth
                                    disabled={loading}
                                    sx={{
                                        height: 56,
                                        borderRadius: '16px',
                                        fontSize: '1rem',
                                        fontWeight: 700,
                                        textTransform: 'none',
                                        mt: 2,
                                        boxShadow: 'none',
                                        '&:hover': { boxShadow: 'none' }
                                    }}
                                >
                                    {loading ? (
                                        <CircularProgress size={24} color="inherit" />
                                    ) : (
                                        "Sign in"
                                    )}
                                </Button>
                            </Stack>
                        </form>
                    </CardContent>
                </Card>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 3, textAlign: 'center' }}>
                    Need help? Contact your administrator
                </Typography>
            </Box>
        </Box>
    );
}
