# Build: pnpm install → buf generate → next build (standalone output).
FROM node:24-alpine AS build
RUN npm install -g pnpm@11.9.0
WORKDIR /app

# Manifests first so the install layer caches across source-only changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY packages/protogen/package.json packages/protogen/
RUN pnpm install --frozen-lockfile

COPY buf.yaml buf.gen.yaml ./
COPY proto/ proto/
COPY packages/ packages/
COPY apps/ apps/
RUN pnpm gen && pnpm --filter @haalkhata/web build

# Runtime: only the standalone server + static assets, no toolchain.
FROM node:24-alpine
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /app/apps/web/public ./apps/web/public
# Pending migrations apply automatically on boot (db.ts); ship them.
COPY --from=build --chown=node:node /app/apps/web/migrations ./apps/web/migrations
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
