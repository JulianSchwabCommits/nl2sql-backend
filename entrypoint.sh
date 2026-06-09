#!/bin/sh
set -e

# Run migrations
npx prisma migrate deploy
npx prisma migrate deploy --config prisma-auth.config.ts

# Setup food database (downloads data if needed and seeds)
sh scripts/setup-food-database.sh

# Start the application
exec node dist/main
