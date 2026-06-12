# ── Install stage (Bun para velocidad) ────────────────────────────────────────
FROM oven/bun:1 AS installer
WORKDIR /app
COPY package.json bun.lock bunfig.toml ./
RUN bun install

# ── Build stage (Node.js/V8 para evitar quirks de Bun/JSC con rollup) ─────────
FROM node:20 AS builder
WORKDIR /app

# Public Supabase credentials — Vite las embebe en el bundle de cliente en build time.
ARG VITE_SUPABASE_URL=https://vabfxtarxoenvkadfzym.supabase.co
ARG VITE_SUPABASE_ANON_KEY=sb_publishable_mp_vdMThhERuSTHhhc-V9g_O40_CSp_
ARG VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_mp_vdMThhERuSTHhhc-V9g_O40_CSp_

ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY \
    VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY \
    NITRO_PRESET=node \
    NODE_OPTIONS="--stack-size=65536"

COPY --from=installer /app/node_modules ./node_modules
COPY . .
RUN node node_modules/.bin/vite build

# ── Runtime stage ───────────────────────────────────────────────────────────────
FROM node:20-slim AS runner
WORKDIR /app
COPY --from=builder /app/dist ./dist

ENV NODE_ENV=production \
    NITRO_HOST=0.0.0.0

EXPOSE 3000
CMD ["node", "dist/server/index.mjs"]
