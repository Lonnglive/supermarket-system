# ==============================================================================
# AeroPOS Supermarket Management System - Production Dockerfile
# ==============================================================================

# Stage 1: Build Frontend (Vite + React)
FROM node:20-alpine AS client-builder
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# Stage 2: Build Backend (TypeScript + Express)
FROM node:20-alpine AS server-builder
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci
COPY server/ ./
RUN npm run build

# Stage 3: Production Runtime
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=5000

# Install production dependencies for server
COPY server/package*.json ./server/
RUN cd server && npm ci --only=production

# Copy compiled backend
COPY --from=server-builder /app/server/dist ./server/dist
COPY --from=server-builder /app/server/src/db ./server/src/db

# Copy built frontend
COPY --from=client-builder /app/client/dist ./client/dist

# Expose standard application port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:5000/api/health || exit 1

# Start the unified application
CMD ["node", "server/dist/index.js"]
