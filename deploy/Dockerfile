# Multi-stage build for production-ready Tradebaas application

# Stage 1: Build frontend
FROM node:20-alpine AS frontend-builder

WORKDIR /app

COPY package*.json ./
COPY tsconfig.json ./
COPY vite.config.ts ./
COPY index.html ./
COPY tailwind.config.js ./
COPY components.json ./

RUN npm ci --only=production

COPY src ./src

RUN npm run build

# Stage 2: Build backend
FROM node:20-alpine AS backend-builder

WORKDIR /app/backend

COPY backend/package*.json ./
COPY backend/tsconfig.json ./

RUN npm ci --only=production

COPY backend/src ./src
COPY backend/strategies ./strategies

RUN npm run build 2>/dev/null || echo "Backend build step optional"

# Stage 3: Production runtime
FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache \
    dumb-init \
    curl

COPY --from=frontend-builder /app/dist ./dist
COPY --from=frontend-builder /app/node_modules ./node_modules
COPY --from=frontend-builder /app/package*.json ./

COPY --from=backend-builder /app/backend/node_modules ./backend/node_modules
COPY --from=backend-builder /app/backend/src ./backend/src
COPY --from=backend-builder /app/backend/strategies ./backend/strategies
COPY --from=backend-builder /app/backend/package*.json ./backend/

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

EXPOSE 3000

USER node

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

ENTRYPOINT ["dumb-init", "--"]

CMD ["node", "backend/src/index.js"]
