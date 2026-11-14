# ==============================================================================
# SBS Browser - Server-Side Web Browser & OS Daemon Docker Image
# ==============================================================================

FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Production runtime stage
FROM node:22-alpine AS runner

WORKDIR /opt/sbs-browser

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
ENV SBS_OS_EMBEDDED=1

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/server.js ./
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
COPY --from=builder /app/desktop ./desktop 2>/dev/null || true

RUN npm install --omit=dev --ignore-scripts

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "server.js"]
