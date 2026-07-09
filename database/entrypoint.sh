#!/bin/sh
set -e

echo "[database] starting service..."
exec node dist/main
