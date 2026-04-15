# syntax=docker/dockerfile:1
#
# Clodds — three-mode container (gateway / mcp-stdio / mcp-http).
# Default CMD is the gateway; override in compose or Railway for the MCP modes.
#
# Build: multi-stage on node:22-bookworm-slim (engines pins node >=22).
# better-sqlite3 + sharp compile native addons; build-essential + python3 live
# in the builder only, so the runner stays lean (<500 MB target).

FROM node:22-bookworm-slim AS builder

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
       build-essential \
       python3 \
       ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json tsconfig.json ./
COPY src ./src

RUN npm ci --legacy-peer-deps --no-audit --no-fund
RUN npm run build

# -------------------------------------------------------------------

FROM node:22-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production \
    CLODDS_STATE_DIR=/data \
    CLODDS_WORKSPACE=/data/workspace \
    CLODDS_GATEWAY_PORT=18789 \
    CLODDS_MCP_PORT=18790

# Runtime native deps for better-sqlite3 (libstdc++) and sharp (libvips).
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
       ca-certificates \
       dumb-init \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --legacy-peer-deps --no-audit --no-fund

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/.transformers-cache ./.transformers-cache

# Writable state dir for the non-root user
RUN mkdir -p /data /data/workspace \
 && chown -R node:node /app /data

USER node

EXPOSE 18789 18790

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:' + (process.env.HEALTHCHECK_PORT || process.env.CLODDS_GATEWAY_PORT || 18789) + '/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]
