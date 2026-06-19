# ── Install stage (Bun para velocidad) ────────────────────────────────────────
FROM oven/bun:1 AS installer
WORKDIR /app
COPY package.json bun.lock bunfig.toml ./
RUN bun install

# ── Build stage (Node.js/V8 para evitar quirks de Bun/JSC con rollup) ─────────
FROM node:20 AS builder
WORKDIR /app

ENV NITRO_PRESET=node

COPY --from=installer /app/node_modules ./node_modules
COPY . .
RUN node --stack-size=65536 node_modules/.bin/vite build

# ── Runtime stage ───────────────────────────────────────────────────────────────
FROM node:22-slim AS runner
WORKDIR /app
COPY --from=builder /app/dist ./dist

ENV NODE_ENV=production \
    NITRO_HOST=0.0.0.0 \
    NITRO_PORT=3000

EXPOSE 3000
CMD ["node", "dist/server/index.mjs"]
