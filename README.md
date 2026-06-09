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
```

The API is available at `http://localhost:3000`.

**Note:** The database setup (download USDA food data + seed) happens automatically during container startup via `entrypoint.sh`. The setup script is idempotent - it only seeds if the database is empty.

### Manual Database Setup

If you need to manually setup the food database:

```bash
# Option 1: Run the automated setup script (downloads data if needed + seeds)
docker compose exec app bash scripts/setup-food-database.sh

# Option 2: Use npm script
docker compose exec app npm run db:setup

# Option 3: Manual steps
docker compose exec app npx tsx data/prisma/seed.ts
```

## Services

| Service | Port | Description |
|---------|------|-------------|
| app | 3000 | NestJS API |
| db | 5432 | PostgreSQL (main data) |
| auth-db | 5433 | PostgreSQL (auth data) |
| redisDB | 6379 | Redis (conversations) |

## Food Data

The application uses **USDA FoodData Central Foundation Foods** dataset:
- **Source:** https://fdc.nal.usda.gov/
- **File:** `FoodData_Central_foundation_food_json_2026-04-30.json` (6.5MB)
- **Contents:** ~363 foundation foods with detailed nutritional information
- **Download:** Automated via `scripts/setup-food-database.sh`
- **Schema:** Foods, Categories, Nutrients, Measure Units, Food Nutrients, Food Portions

The setup script automatically:
1. Downloads the dataset if not present
2. Runs Prisma migrations
3. Seeds the database (only if empty)

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
