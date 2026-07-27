# Build: pnpm install → buf generate → next build (standalone output).
FROM node:24-alpine AS build
RUN npm install -g pnpm@11.9.0
WORKDIR /app

# Manifests first so the install layer caches across source-only changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY packages/protogen/package.json packages/protogen/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile

COPY buf.yaml buf.gen.yaml ./
COPY proto/ proto/
COPY packages/ packages/
COPY apps/ apps/

# NEXT_PUBLIC_* is inlined into the client bundle by `next build`, so it has to
# be present HERE rather than at runtime — supplying it only via env_file
# produces an image whose Google button never appears. Not a secret: the value
# ends up in the bundle by design, so a build arg is the right shape for it.
ARG NEXT_PUBLIC_GOOGLE_CLIENT_ID=""
ENV NEXT_PUBLIC_GOOGLE_CLIENT_ID=$NEXT_PUBLIC_GOOGLE_CLIENT_ID

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

# Reads Docker secrets from /run/secrets into the environment before starting
# the app, so no secret value lives in a compose file or an image layer. A
# no-op when no secrets are mounted, which is what keeps `docker run` of this
# image usable for a smoke test.
COPY ops/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod 755 /usr/local/bin/docker-entrypoint.sh

USER node
EXPOSE 3000
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "apps/web/server.js"]
