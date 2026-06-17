#!/bin/sh
set -e

# database-service entrypoint. Applies Food DB migrations (idempotent) before
# starting. Seeding the large USDA dataset is a separate manual step
# (`npm run db:setup`) so normal restarts stay fast.
echo "[database] applying Food DB migrations..."
npx prisma migrate deploy || echo "[database] migrate deploy failed (continuing; DB may be unreachable)"

echo "[database] starting service..."
exec node dist/main
