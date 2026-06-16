#!/usr/bin/env bash
set -euo pipefail

# Config
BASTION_IP="${BASTION_IP:-51.34.118.164}"
BASTION_USER="${BASTION_USER:-ec2-user}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/nl2sql-redis-bastion.pem}"
REDIS_HOST="${REDIS_HOST:-nl2sql-prod-redis.w9gjra.0001.euc2.cache.amazonaws.com}"
REDIS_PORT="${REDIS_PORT:-6379}"
LOCAL_PORT="${LOCAL_PORT:-6380}"
PG_HOST="${PG_HOST:-nl2sql-prod-postgres.crsa4g8uk19b.eu-central-2.rds.amazonaws.com}"
PG_PORT="${PG_PORT:-5432}"
LOCAL_PG_PORT="${LOCAL_PG_PORT:-5432}"
BIND_ADDR="${BIND_ADDR:-0.0.0.0}"

PID_FILE="/tmp/nl2sql-redis-tunnel.pid"
LOG_FILE="/tmp/nl2sql-redis-tunnel.log"
FORWARD="${BIND_ADDR}:${LOCAL_PORT}:${REDIS_HOST}:${REDIS_PORT}"
PG_FORWARD="${BIND_ADDR}:${LOCAL_PG_PORT}:${PG_HOST}:${PG_PORT}"

ssh_cmd() {
  ssh -i "$SSH_KEY" -N \
    -o StrictHostKeyChecking=accept-new \
    -o ServerAliveInterval=30 \
    -o ServerAliveCountMax=3 \
    -o ExitOnForwardFailure=yes \
    -L "$FORWARD" \
    -L "$PG_FORWARD" \
    "${BASTION_USER}@${BASTION_IP}"
}

is_running() {
  [[ -f "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null
}

case "${1:-start}" in
  start)
    if is_running; then
      echo "Tunnel already running (pid $(cat "$PID_FILE")) on localhost:${LOCAL_PORT}"
      exit 0
    fi
    chmod 600 "$SSH_KEY" 2>/dev/null || true
    # Auto-reconnect loop in the background, fully detached so it does not
    # hold the parent's stdout (which would block pipes like `| tail`).
    setsid bash -c '
      while true; do
        ssh -i "'"$SSH_KEY"'" -N \
          -o StrictHostKeyChecking=accept-new \
          -o ServerAliveInterval=30 \
          -o ServerAliveCountMax=3 \
          -o ExitOnForwardFailure=yes \
          -L "'"$FORWARD"'" \
          -L "'"$PG_FORWARD"'" \
          "'"${BASTION_USER}@${BASTION_IP}"'" || true
        echo "[redis-tunnel] connection dropped, reconnecting in 3s..."
        sleep 3
      done
    ' </dev/null >"$LOG_FILE" 2>&1 &
    echo $! > "$PID_FILE"
    sleep 2
    if is_running; then
      echo "Tunnel started:"
      echo "  localhost:${LOCAL_PORT}    -> ${REDIS_HOST}:${REDIS_PORT} (Redis)"
      echo "  localhost:${LOCAL_PG_PORT} -> ${PG_HOST}:${PG_PORT} (Postgres)"
    else
      echo "Failed to start tunnel" >&2
      exit 1
    fi
    ;;
  stop)
    if is_running; then
      kill "$(cat "$PID_FILE")" 2>/dev/null || true
      # also kill the child ssh process group
      pkill -f "$FORWARD" 2>/dev/null || true
      pkill -f "$PG_FORWARD" 2>/dev/null || true
      rm -f "$PID_FILE"
      echo "Tunnel stopped."
    else
      pkill -f "$FORWARD" 2>/dev/null || true
      pkill -f "$PG_FORWARD" 2>/dev/null || true
      rm -f "$PID_FILE"
      echo "No tunnel running."
    fi
    ;;
  status)
    if is_running; then
      echo "Tunnel UP (pid $(cat "$PID_FILE")) -> Redis localhost:${LOCAL_PORT}, Postgres localhost:${LOCAL_PG_PORT}"
    else
      echo "Tunnel DOWN"
      exit 1
    fi
    ;;
  foreground)
    chmod 600 "$SSH_KEY" 2>/dev/null || true
    echo "Tunnel: Redis localhost:${LOCAL_PORT}, Postgres localhost:${LOCAL_PG_PORT} (Ctrl-C to quit)"
    exec ssh_cmd
    ;;
  *)
    echo "Usage: $0 {start|stop|status|foreground}" >&2
    exit 1
    ;;
esac
