# nl2sql-backend

Microservices backend for natural-language to SQL. Users connect their own databases.
Four containers behind an nginx api-gateway.

- **api-gateway** — nginx reverse proxy (port 3000)
- **core** — JWT auth + admin workflow + connection management
- **agent** — NL-to-SQL via OpenAI, streams over Socket.IO
- **database** — dynamic DB connections + Redis, internal-only API

## Setup

```bash
cp .env.example .env
docker compose up --build -d
```

```bash
# Create admin user
docker compose exec core npm run auth:seed
```
