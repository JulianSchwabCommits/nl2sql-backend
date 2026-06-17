# database-service image.
# IMPORTANT: build context MUST be the repo root (see docker-compose.yml) so the
# npm workspace lockfile and the @nl2sql/auth + @nl2sql/logger packages are
# available.

FROM node:20-alpine AS build
WORKDIR /app
# Install the whole workspace from the root lockfile. Only manifests are copied
# first so this layer is cached until a package.json changes.
COPY package.json package-lock.json ./
COPY packages/logger/package.json ./packages/logger/
COPY packages/auth/package.json ./packages/auth/
COPY core/package.json ./core/
COPY agent/package.json ./agent/
COPY database/package.json ./database/
RUN npm ci
# Sources needed to build this service (+ the shared libs).
COPY packages/logger ./packages/logger
COPY packages/auth ./packages/auth
COPY database ./database
# Generate the Food Prisma client BEFORE building the service: DatabaseService
# extends PrismaClient, so tsc needs the generated client types to already exist.
RUN npm run build -w @nl2sql/logger \
 && npm run build -w @nl2sql/auth \
 && npm run prisma:generate -w @nl2sql/database \
 && npm run build -w @nl2sql/database

FROM node:20-alpine AS runner
WORKDIR /app/database
ENV NODE_ENV=production
# dumb-init for signal handling; unzip for the optional food-data setup script.
RUN apk add --no-cache dumb-init unzip
# Hoisted node_modules carries the generated Prisma client + all runtime deps.
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/packages/logger/dist /app/packages/logger/dist
COPY --from=build /app/packages/logger/package.json /app/packages/logger/package.json
COPY --from=build /app/packages/auth/dist /app/packages/auth/dist
COPY --from=build /app/packages/auth/package.json /app/packages/auth/package.json
COPY --from=build /app/database/dist ./dist
COPY --from=build /app/database/package.json ./package.json
COPY --from=build /app/database/prisma.config.ts ./prisma.config.ts
COPY --from=build /app/database/data ./data
COPY --from=build /app/database/scripts ./scripts
COPY --from=build /app/database/entrypoint.sh ./entrypoint.sh
EXPOSE 3002
ENTRYPOINT ["dumb-init", "--"]
CMD ["sh", "entrypoint.sh"]
