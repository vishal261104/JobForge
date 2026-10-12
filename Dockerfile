# ─────────────────────────────────────────────────────────────
#  QueueForge — Multi-stage Dockerfile
#
#  Stages:
#   1. deps    — install ALL npm dependencies (cache layer)
#   2. builder — compile TypeScript to dist/
#   3. runner  — minimal production image (no devDeps, no src/)
#
#  Build:  docker build -t jobforge .
#  Run:    docker run --env-file .env -p 3000:3000 jobforge
# ─────────────────────────────────────────────────────────────

# ── Stage 1: Install dependencies ────────────────────────────
FROM node:20-alpine AS deps

WORKDIR /app

# Copy only manifests first to leverage Docker layer caching.
# Rebuilds only when package*.json changes.
COPY package.json package-lock.json ./

RUN npm ci --ignore-scripts

# ── Stage 2: Build TypeScript ─────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Bring in all deps (including devDeps for tsc)
COPY --from=deps /app/node_modules ./node_modules

# Copy source
COPY tsconfig.json ./
COPY src/ ./src/

RUN npm run build

# ── Stage 3: Production runner ────────────────────────────────
FROM node:20-alpine AS runner

# Security: run as non-root user
RUN addgroup --system jobforge && adduser --system --ingroup jobforge jobforge

WORKDIR /app

ENV NODE_ENV=production

# Only copy production deps (re-install without devDeps for a slim image)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# Copy compiled output from builder
COPY --from=builder /app/dist ./dist

# Drop privileges
USER jobforge

EXPOSE 3000

# Default command: API server
# Override with `command: npm run worker` in docker-compose for the worker service
CMD ["node", "dist/server.js"]
