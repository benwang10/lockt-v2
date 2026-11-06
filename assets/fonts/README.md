# Bundled fonts

| Family | Files | Version source | License |
|---|---|---|---|
| **Source Serif 4** (default serif) | `source-serif-4/SourceSerif4_400Regular.ttf`, `_400Regular_Italic`, `_600SemiBold`, `_700Bold` | `@expo-google-fonts/source-serif-4@0.4.2` (Google Fonts build) | SIL Open Font License 1.1, see [`source-serif-4/OFL.txt`](source-serif-4/OFL.txt). © 2014 The Source Serif 4 Project Authors (https://github.com/adobe-fonts/source-serif) |
| **Inter** (sparing sans: navigation, metadata, chart labels, timer) | `inter/Inter_500Medium.ttf`, `_600SemiBold`, `_700Bold` | `@expo-google-fonts/inter@0.4.2` (Google Fonts build) | SIL Open Font License 1.1, see [`inter/OFL.txt`](inter/OFL.txt). © 2020 The Inter Project Authors (https://github.com/rsms/inter) |

Only the weights listed are bundled, and the app only references these weights (each one is registered as
its own family name in `src/constants/fonts.ts`). The OFL permits bundling and redistribution with the app;
the license text must stay with the font files, and the fonts may not be sold on their own.

## Switching to Tiempos Text later

Tiempos Text (Klim Type Foundry) is commercially licensed and is **not** included. If you buy an app/embedding
license that covers iOS, Android and web:

1. Put the licensed files in `assets/fonts/tiempos/` (Regular, Italic, Semibold, Bold) together with the
   license you received.
2. In `src/constants/fonts.ts`, add them to `FONT_ASSETS` and point `SERIF.regular / italic / semibold / bold`
   at the new family names. Nothing else needs to change.
3. Re-check line heights in `src/constants/theme.ts` (`Type`), since Tiempos has different vertical metrics.
