# Build from the repository root: docker build -f infra/deploy/api.Dockerfile .
FROM node:24.15.0-bookworm-slim AS base
RUN npm install --global pnpm@11.19.0
WORKDIR /app

FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/config-typescript/ packages/config-typescript/
COPY apps/api/ apps/api/
RUN pnpm --filter @dealse/api... install --frozen-lockfile
RUN apt-get update && apt-get install --no-install-recommends -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*
# Prisma generation needs a URL, but never connects to this placeholder database.
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build pnpm --filter @dealse/api build

FROM base AS production-dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/config-typescript/package.json packages/config-typescript/package.json
COPY apps/api/package.json apps/api/package.json
RUN pnpm --filter @dealse/api... install --prod --frozen-lockfile

FROM node:24.15.0-bookworm-slim AS runtime
ENV NODE_ENV=production
ENV PORT=3001
WORKDIR /app
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=production-dependencies /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/api/dist ./apps/api/dist
USER node
WORKDIR /app/apps/api
EXPOSE 3001
CMD ["node", "dist/main.js"]
