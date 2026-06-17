FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/logger/package.json ./packages/logger/
COPY packages/auth/package.json ./packages/auth/
COPY core/package.json ./core/
COPY agent/package.json ./agent/
COPY database/package.json ./database/
RUN npm ci
COPY packages/logger ./packages/logger
COPY packages/auth ./packages/auth
COPY agent ./agent
RUN npm run build -w @nl2sql/logger \
 && npm run build -w @nl2sql/auth \
 && npm run build -w @nl2sql/agent

FROM node:20-alpine AS runner
WORKDIR /app/agent
ENV NODE_ENV=production
RUN apk add --no-cache dumb-init
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/packages/logger/dist /app/packages/logger/dist
COPY --from=build /app/packages/logger/package.json /app/packages/logger/package.json
COPY --from=build /app/packages/auth/dist /app/packages/auth/dist
COPY --from=build /app/packages/auth/package.json /app/packages/auth/package.json
COPY --from=build /app/agent/dist ./dist
COPY --from=build /app/agent/package.json ./package.json
COPY --from=build /app/agent/data ./data
COPY --from=build /app/agent/entrypoint.sh ./entrypoint.sh
EXPOSE 3001
ENTRYPOINT ["dumb-init", "--"]
CMD ["sh", "entrypoint.sh"]
