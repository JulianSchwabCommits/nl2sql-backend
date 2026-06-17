# nl2sql-backend

Microservices backend for natural-language to SQL over a USDA food database.
Four containers behind an nginx api-gateway.

- **api-gateway** — nginx reverse proxy (port 3000)
- **core** — JWT auth + admin workflow
- **agent** — NL-to-SQL via OpenAI, streams over Socket.IO
- **database** — Food Postgres + Redis, internal-only API

Postgres and Redis are external (not managed by compose).

## Setup

```bash
cp .env.example .env
docker compose up --build -d
```

```bash
# Create admin user
docker compose exec core npm run auth:seed

# Seed food database
docker compose exec database bash scripts/setup-food-database.sh
```

## Docs

- [QUICKSTART.md](./QUICKSTART.md) — AWS deployment
- [DEPLOYMENT.md](./DEPLOYMENT.md) — full deployment docs
- [CHECKLIST.md](./CHECKLIST.md) — deployment checklist
