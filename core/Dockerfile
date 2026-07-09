FROM node:20-alpine AS build
WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
COPY packages/logger/package.json ./packages/logger/
COPY packages/auth/package.json ./packages/auth/
COPY core/package.json ./core/
COPY agent/package.json ./agent/
COPY database/package.json ./database/
RUN npm ci
COPY packages/logger ./packages/logger
COPY packages/auth ./packages/auth
COPY core ./core

RUN npm run build -w @nl2sql/logger \
 && npm run build -w @nl2sql/auth \
 && npm run prisma:generate -w @nl2sql/core \
 && npm run build -w @nl2sql/core

FROM node:20-alpine AS runner
WORKDIR /app/core
ENV NODE_ENV=production
RUN apk add --no-cache dumb-init \
 && addgroup -S app && adduser -S app -G app

COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/packages/logger/dist /app/packages/logger/dist
COPY --from=build /app/packages/logger/package.json /app/packages/logger/package.json
COPY --from=build /app/packages/auth/dist /app/packages/auth/dist
COPY --from=build /app/packages/auth/package.json /app/packages/auth/package.json
COPY --from=build /app/core/dist ./dist
COPY --from=build /app/core/package.json ./package.json
COPY --from=build /app/core/prisma.config.ts ./prisma.config.ts
COPY --from=build /app/core/data ./data
COPY --from=build /app/core/entrypoint.sh ./entrypoint.sh
USER app
EXPOSE 3000
ENTRYPOINT ["dumb-init", "--"]
CMD ["sh", "entrypoint.sh"]
