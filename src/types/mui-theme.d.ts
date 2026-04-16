import '@mui/material/styles';

declare module '@mui/material/styles' {
    interface Palette {
        onPrimary: string;
        primaryContainer: string;
        onPrimaryContainer: string;

        onSecondary: string;
        secondaryContainer: string;
        onSecondaryContainer: string;

        onTertiary: string;
        tertiary: string;
        tertiaryContainer: string;
        onTertiaryContainer: string;

        errorContainer: string;
        onErrorContainer: string;

        surface: string;
        onSurface: string;
        surfaceVariant: string;
        onSurfaceVariant: string;

        outline: string;
        outlineVariant: string;

        inverseSurface: string;
        inverseOnSurface: string;
        inversePrimary: string;

        surfaceContainerHighest: string;
        surfaceContainerHigh: string;
        surfaceContainer: string;
        surfaceContainerLow: string;
        surfaceContainerLowest: string;
        surfaceDim: string;
        surfaceBright: string;
    }

    interface PaletteOptions {
        onPrimary?: string;
        primaryContainer?: string;
        onPrimaryContainer?: string;

        onSecondary?: string;
        secondaryContainer?: string;
        onSecondaryContainer?: string;

        onTertiary?: string;
        tertiary?: string;
        tertiaryContainer?: string;
        onTertiaryContainer?: string;

        errorContainer?: string;
        onErrorContainer?: string;

        surface?: string;
        onSurface?: string;
        surfaceVariant?: string;
        onSurfaceVariant?: string;

        outline?: string;
        outlineVariant?: string;

        inverseSurface?: string;
        inverseOnSurface?: string;
        inversePrimary?: string;

        surfaceContainerHighest?: string;
        surfaceContainerHigh?: string;
        surfaceContainer?: string;
        surfaceContainerLow?: string;
        surfaceContainerLowest?: string;
        surfaceDim?: string;
        surfaceBright?: string;
    }

    // Extend simple palette color options if needed, but the above strictly adds them to Palette.
    // We can also extend PaletteColor if we wanted primary.container, but we flatted them in `theme.ts` (e.g. md3Colors.light.primaryContainer)
    // However, in `theme.ts` I assigned them to `primary.light/dark` slots too.
    // But in NavigationDrawer I used `theme.palette.secondary.container` which suggests I expected nesting.
    // Let's check `theme.ts` again. I did NOT nest them in `theme.ts`.
    // I mapped `primary.light` to `md3Colors.light.primaryContainer`.
    // So `theme.palette.primary.light` is the container color.
    // BUT, in `NavigationDrawer` I wrote `theme.palette.secondary.container`. This is wrong based on my `theme.ts`.
    // I should fix `NavigationDrawer` to use the top-level palette properties I defined in `theme.ts` MD3 object, OR I should add them to the palette in `theme.ts`.

    // In `theme.ts`:
    // I just created `md3Colors` object but didn't assign all of them to the `palette` object except via the standard slots (primary/secondary/etc).
    // I need to add the extra MD3 colors to the `palette` object in `theme.ts`.

    interface TypographyVariants {
        labelLarge: React.CSSProperties;
        labelMedium: React.CSSProperties;
        labelSmall: React.CSSProperties;
        titleMedium: React.CSSProperties;
        titleSmall: React.CSSProperties;
    }

    interface TypographyVariantsOptions {
        labelLarge?: React.CSSProperties;
        labelMedium?: React.CSSProperties;
        labelSmall?: React.CSSProperties;
        titleMedium?: React.CSSProperties;
        titleSmall?: React.CSSProperties;
    }
}

declare module '@mui/material/Typography' {
    interface TypographyPropsVariantOverrides {
        labelLarge: true;
        labelMedium: true;
        labelSmall: true;
        titleMedium: true;
        titleSmall: true;
    }
}
