# ---- Build stage ----
FROM node:20-slim AS builder
WORKDIR /app

RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json tsconfig.json ./
COPY packages/shared/ packages/shared/
COPY packages/gateway/ packages/gateway/

RUN npm ci --workspace=packages/gateway --workspace=packages/shared --include-workspace-root

RUN npx prisma generate --schema=packages/gateway/prisma/schema.prisma
RUN npm run build -w packages/gateway

# ---- Production stage ----
FROM node:20-slim
WORKDIR /app

RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production

COPY --from=builder /app/package.json /app/package-lock.json /app/tsconfig.json ./
COPY --from=builder /app/packages/shared/ packages/shared/
COPY --from=builder /app/packages/gateway/package.json packages/gateway/
COPY --from=builder /app/packages/gateway/dist/ packages/gateway/dist/
COPY --from=builder /app/packages/gateway/prisma/ packages/gateway/prisma/
COPY --from=builder /app/packages/gateway/node_modules/.prisma/ packages/gateway/node_modules/.prisma/

RUN npm ci --workspace=packages/gateway --workspace=packages/shared --include-workspace-root --omit=dev

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3001/health').then(r=>{if(!r.ok)throw r.status}).catch(()=>process.exit(1))"

CMD ["sh", "-c", "npx prisma migrate deploy --schema=packages/gateway/prisma/schema.prisma && node packages/gateway/dist/index.js"]
