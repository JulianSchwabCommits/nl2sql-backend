#!/bin/sh
set -e

echo "[core] applying Auth DB migrations..."
npx prisma migrate deploy || echo "[core] migrate deploy failed (continuing; DB may be unreachable)"

echo "[core] starting service..."
exec node dist/main
