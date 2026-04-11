# ---- Build stage ----
FROM node:20-slim AS builder
WORKDIR /app

COPY package.json package-lock.json tsconfig.json ./
COPY packages/shared/ packages/shared/
COPY packages/frontend/ packages/frontend/

RUN npm ci --workspace=packages/frontend --workspace=packages/shared --include-workspace-root

ARG VITE_GATEWAY_URL=http://localhost:3001
ENV VITE_GATEWAY_URL=$VITE_GATEWAY_URL

RUN npm run build -w packages/frontend

# ---- Production stage ----
FROM nginx:alpine

COPY --from=builder /app/packages/frontend/dist/ /usr/share/nginx/html/
COPY packages/frontend/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost/ || exit 1
