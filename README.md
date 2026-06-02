# nl2sql-backend

NestJS backend with JWT authentication and PostgreSQL.

## Prerequisites

- Docker & Docker Compose

## Setup & Start

```bash
# Clone and enter project
git clone https://github.com/JulianSchwabCommits/nl2sql-backend.git
cd nl2sql-backend

# Copy environment variables
cp .env.example .env

# Start all containers (app + databases)
docker compose up --build -d

# Run database migrations
docker compose exec app npx prisma migrate deploy --schema=data/prisma/schema.prisma
docker compose exec app npx prisma migrate deploy --config prisma-auth.config.ts

# Seed main database (optional)
docker compose exec app npx ts-node data/prisma/seed.ts
```

The API is available at `http://localhost:3000`.

## Services

| Service | Port | Description |
|---------|------|-------------|
| app | 3000 | NestJS API |
| db | 5432 | PostgreSQL (main data) |
| auth-db | 5433 | PostgreSQL (auth data) |

## Auth Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | /auth/signup | - | Register new user |
| POST | /auth/login | - | Login, returns JWT |
| POST | /auth/refresh | Cookie | Refresh access token |
| POST | /auth/logout | Bearer | Invalidate refresh token |
| GET | /auth/profile | Bearer | Get own profile |
| DELETE | /auth/profile | Bearer | Delete own account |

## Environment Variables

| Variable | Description |
|----------|-------------|
| DATABASE_URL | Main PostgreSQL connection |
| AUTH_DATABASE_URL | Auth PostgreSQL connection |
| JWT_SECRET | Secret for access tokens |
| JWT_REFRESH_SECRET | Secret for refresh tokens |
| CORS_ORIGIN | Allowed origins (comma-separated) |
| PORT | Server port (default: 3000) |

## Development (without Docker)

```bash
npm ci
npm run start:dev
```

Requires local PostgreSQL instances on ports 5432 and 5433.
