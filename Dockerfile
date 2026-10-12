# ─────────────────────────────────────────────────────────────
#  QueueForge — Multi-stage Dockerfile
#
#  Stages:
#   1. deps    — install ALL npm dependencies (cache layer)
#   2. builder — compile TypeScript to dist/
#   3. runner  — minimal production image (no devDeps, no src/)
# ─────────────────────────────────────────────────────────────

# ── Stage 1: Install dependencies ────────────────────────────
FROM node:20-alpine AS deps

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# ── Stage 2: Build TypeScript ─────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json tsconfig.json ./
COPY src/ ./src/

RUN npm run build

# ── Stage 3: Production runner ────────────────────────────────
FROM node:20-alpine AS runner

RUN addgroup --system jobforge && adduser --system --ingroup jobforge jobforge

WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

COPY --from=builder --chown=jobforge:jobforge /app/dist ./dist

USER jobforge

EXPOSE 3000

CMD ["node", "dist/server.js"]
