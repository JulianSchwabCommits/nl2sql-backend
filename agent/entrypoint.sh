#!/bin/sh
set -e

echo "[agent] starting service..."
exec node dist/main
