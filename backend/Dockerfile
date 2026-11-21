FROM node:22-bookworm-slim AS base
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.18.0 --activate

# Dependencies stage
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/
COPY frontend/patches ./frontend/patches
RUN pnpm install --frozen-lockfile --filter=nexcore-backend...

# Build stage
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/backend/node_modules ./backend/node_modules
COPY backend ./backend
WORKDIR /app/backend
RUN pnpm run build

# Production stage
FROM base AS runner
ENV NODE_ENV=production
WORKDIR /app/backend

# Copy built dist and dependencies
COPY --from=builder /app/backend/dist ./dist
COPY --from=builder /app/backend/package.json ./package.json
COPY --from=builder /app/backend/node_modules ./node_modules

EXPOSE 5000
ENV PORT=5000

CMD ["node", "dist/index.js"]
