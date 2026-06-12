# ── Build stage ────────────────────────────────────────────────────────────────
FROM oven/bun:1 AS builder
WORKDIR /app

# Public Supabase credentials (anon/publishable key — safe to embed in image).
# Vite replaces import.meta.env.VITE_* at build time; these end up in the client bundle.
ARG VITE_SUPABASE_URL=https://vabfxtarxoenvkadfzym.supabase.co
ARG VITE_SUPABASE_ANON_KEY=sb_publishable_mp_vdMThhERuSTHhhc-V9g_O40_CSp_
ARG VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_mp_vdMThhERuSTHhhc-V9g_O40_CSp_

ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY \
    VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY \
    NITRO_PRESET=node-server

COPY package.json bun.lock bunfig.toml ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

# ── Runtime stage ───────────────────────────────────────────────────────────────
FROM node:20-slim AS runner
WORKDIR /app

# Only copy the built output — no source, no secrets, no node_modules
COPY --from=builder /app/dist ./dist

ENV NODE_ENV=production \
    # Nitro node-server reads PORT from process.env (set by Dokku at runtime).
    # NITRO_HOST=0.0.0.0 ensures the server listens on all interfaces inside the container.
    NITRO_HOST=0.0.0.0

EXPOSE 3000

CMD ["node", "dist/server/index.mjs"]
