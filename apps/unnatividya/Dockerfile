# syntax=docker/dockerfile:1

FROM node:20-bookworm-slim AS deps
WORKDIR /repo
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-bookworm-slim AS builder
WORKDIR /repo
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /repo/node_modules ./node_modules
COPY . .
RUN npm run unnatividya:build

FROM node:20-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3100
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs \
  && chown -R nextjs:nodejs /app

COPY --from=builder --chown=nextjs:nodejs /repo/apps/unnatividya/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /repo/apps/unnatividya/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /repo/apps/unnatividya/public ./public
COPY --from=builder --chown=nextjs:nodejs /repo/apps/unnatividya/scripts ./scripts
COPY --from=builder --chown=nextjs:nodejs /repo/apps/unnatividya/migrations ./migrations

USER nextjs
EXPOSE 3100

CMD ["node", "server.js"]
