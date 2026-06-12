// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// NITRO_PRESET=node-server → builds a Node.js SSR server (for Dokku/VPS).
// Unset (default) → auto mode: nitro only activates inside Lovable's infra (Cloudflare).
const nitroPreset = process.env.NITRO_PRESET;

export default defineConfig({
  nitro: nitroPreset ? { preset: nitroPreset } : undefined,
  tanstackStart: {
    server: { entry: "server" },
  },
});
