# Dependencies
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production && \
    npm ci --only=development

# Build
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma clients
RUN npx prisma generate && \
    npx prisma generate --config prisma-auth.config.ts

# Build application
RUN npm run build

# prod
FROM node:20-alpine AS runner
WORKDIR /app

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Copy only production dependencies
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY package*.json ./
COPY prisma*.config.ts ./
COPY data/prisma ./data/prisma
COPY data/prisma-auth ./data/prisma-auth
COPY data/system-prompt.txt ./data/system-prompt.txt
COPY scripts ./scripts

# Create entrypoint script
RUN echo '#!/bin/sh' > /app/entrypoint.sh && \
    echo 'set -e' >> /app/entrypoint.sh && \
    echo '' >> /app/entrypoint.sh && \
    echo 'echo "Waiting for databases..."' >> /app/entrypoint.sh && \
    echo 'sleep 5' >> /app/entrypoint.sh && \
    echo '' >> /app/entrypoint.sh && \
    echo 'echo "Running migrations..."' >> /app/entrypoint.sh && \
    echo 'echo "DATABASE_URL: $DATABASE_URL"' >> /app/entrypoint.sh && \
    echo 'echo "AUTH_DATABASE_URL: $AUTH_DATABASE_URL"' >> /app/entrypoint.sh && \
    echo 'DATABASE_URL="$DATABASE_URL" npx prisma migrate deploy || echo "Main DB migration failed"' >> /app/entrypoint.sh && \
    echo 'AUTH_DATABASE_URL="$AUTH_DATABASE_URL" DATABASE_URL="$AUTH_DATABASE_URL" npx prisma migrate deploy --config prisma-auth.config.ts || echo "Auth DB migration failed"' >> /app/entrypoint.sh && \
    echo '' >> /app/entrypoint.sh && \
    echo 'echo "Starting application..."' >> /app/entrypoint.sh && \
    echo 'exec node dist/main' >> /app/entrypoint.sh && \
    chmod +x /app/entrypoint.sh && \
    chmod +x /app/scripts/setup-food-database.sh

EXPOSE 3000

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]
CMD ["sh", "/app/entrypoint.sh"]
