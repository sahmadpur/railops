# syntax=docker/dockerfile:1

FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts && npm rebuild esbuild @swc/core unrs-resolver

# Dev server + the migrate/seed one-shot both run from here.
FROM node:24-alpine AS dev
WORKDIR /app
RUN apk add --no-cache tzdata
# `datetime-local` inputs carry no offset, so the server must parse and print them in the
# corridor's wall-clock zone. Azerbaijan and Georgia are both UTC+4.
ENV NEXT_TELEMETRY_DISABLED=1 TZ=Asia/Baku
COPY --from=deps /app/node_modules ./node_modules
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev"]

FROM node:24-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 TZ=Asia/Baku
RUN apk add --no-cache tzdata
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
