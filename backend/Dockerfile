# ── Build Stage ─────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Install Prisma deps
RUN apk add --no-cache openssl

# Copy package files
COPY package.json package-lock.json ./

# Install ALL dependencies (including devDependencies for build)
RUN npm ci

# Copy source code
COPY tsconfig.json ./
COPY src/ ./src/
COPY prisma/ ./prisma/

# Generate Prisma client
RUN npx prisma generate

# Build TypeScript
RUN npm run build

# ── Production Stage ────────────────────────────────────────────────
FROM node:22-alpine

WORKDIR /app

RUN apk add --no-cache openssl

# Copy package files and install production deps + prisma (needed for migrations)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm install prisma@5.22.0 --no-save

# Copy built code
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/prisma ./prisma

# Expose backend port
EXPOSE 3000

# Run migrations on startup, then start server
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
