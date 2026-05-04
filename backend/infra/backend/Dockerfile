# No-Backdoor Backend Dockerfile
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .

# Use tsx for runtime — handles path aliases natively
FROM node:22-alpine
WORKDIR /app
RUN apk add --no-cache curl
COPY package*.json ./
RUN npm install --omit=dev
COPY --from=builder /app/src ./src
COPY --from=builder /app/tsconfig.json ./
RUN mkdir -p uploads
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1
CMD ["npx", "tsx", "src/index.ts"]
