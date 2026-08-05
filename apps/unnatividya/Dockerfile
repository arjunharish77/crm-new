# syntax=docker/dockerfile:1

FROM node:20-bookworm-slim AS deps
WORKDIR /repo
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-bookworm-slim AS builder
WORKDIR /repo
ENV NEXT_TELEMETRY_DISABLED=1
ARG GOOGLE_SITE_VERIFICATION
ARG BING_SITE_VERIFICATION
ARG NEXT_PUBLIC_GA_ID
ARG NEXT_PUBLIC_GTM_ID
ARG INDEXNOW_ENABLED
ARG INDEXNOW_KEY
ENV GOOGLE_SITE_VERIFICATION=$GOOGLE_SITE_VERIFICATION
ENV BING_SITE_VERIFICATION=$BING_SITE_VERIFICATION
ENV NEXT_PUBLIC_GA_ID=$NEXT_PUBLIC_GA_ID
ENV NEXT_PUBLIC_GTM_ID=$NEXT_PUBLIC_GTM_ID
ENV INDEXNOW_ENABLED=$INDEXNOW_ENABLED
ENV INDEXNOW_KEY=$INDEXNOW_KEY
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
# Next's standalone trace only keeps the node_modules the *server bundle* needs (it inlines
# small pure-JS deps like `pg` directly into the compiled output instead of leaving them as
# external files). The CLI scripts below (db-migrate-local.js, create-admin.js, etc.) are
# plain `require()`-based Node scripts Next never traces, so they need the real npm packages
# on disk -- layer the full node_modules on top to cover them.
COPY --from=deps --chown=nextjs:nodejs /repo/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /repo/apps/unnatividya/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /repo/apps/unnatividya/public ./public
COPY --from=builder --chown=nextjs:nodejs /repo/apps/unnatividya/scripts ./scripts
COPY --from=builder --chown=nextjs:nodejs /repo/apps/unnatividya/migrations ./migrations

USER nextjs
EXPOSE 3100

CMD ["node", "server.js"]
