#!/bin/sh
set -e

echo "[entrypoint] Running database migrations..."
node dist/migrate.js

echo "[entrypoint] Starting application..."
exec node dist/index.js
