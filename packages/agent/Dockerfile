# ---- Build stage ----
FROM node:20-slim AS builder
WORKDIR /app

COPY package.json package-lock.json tsconfig.json ./
COPY packages/shared/ packages/shared/
COPY packages/agent/ packages/agent/

RUN npm ci --workspace=packages/agent --workspace=packages/shared --include-workspace-root

RUN npm run build -w packages/agent

# ---- Production stage ----
FROM node:20-slim
WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/package.json /app/package-lock.json /app/tsconfig.json ./
COPY --from=builder /app/packages/shared/ packages/shared/
COPY --from=builder /app/packages/agent/package.json packages/agent/
COPY --from=builder /app/packages/agent/dist/ packages/agent/dist/

RUN npm ci --workspace=packages/agent --workspace=packages/shared --include-workspace-root --omit=dev

EXPOSE 3002

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3002/health').then(r=>{if(!r.ok)throw r.status}).catch(()=>process.exit(1))"

CMD ["node", "packages/agent/dist/index.js"]
