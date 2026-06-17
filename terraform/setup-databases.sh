#!/bin/bash

# Post-Terraform Database Setup Script
# Creates the auth database and runs migrations after Terraform deployment

set -e

echo "========================================="
echo "NL2SQL Database Setup"
echo "========================================="

# Check if terraform outputs are available
if ! terraform output > /dev/null 2>&1; then
  echo "Error: Terraform outputs not found. Run 'terraform apply' first."
  exit 1
fi

# Get credentials from secrets.tfvars
DB_USER=$(grep db_master_username secrets.tfvars | cut -d'"' -f2)
DB_PASS=$(grep db_master_password secrets.tfvars | cut -d'"' -f2)

# Get endpoints from terraform
RDS_ENDPOINT=$(terraform output -raw rds_endpoint)
RDS_ADDRESS=$(terraform output -raw rds_address)
REDIS_ENDPOINT=$(terraform output -raw redis_endpoint)
REDIS_PORT=$(terraform output -raw redis_port)

echo ""
echo "Infrastructure:"
echo "  RDS: $RDS_ADDRESS"
echo "  Redis: $REDIS_ENDPOINT:$REDIS_PORT"
echo ""

# Check PostgreSQL client is installed
if ! command -v psql &> /dev/null; then
  echo "Error: psql not found. Install postgresql-client."
  exit 1
fi

echo "Step 1: Testing RDS connection..."
if PGPASSWORD=$DB_PASS psql -h "$RDS_ADDRESS" -U "$DB_USER" -d nl2sql -c "SELECT version();" > /dev/null 2>&1; then
  echo "  OK - RDS connection successful"
else
  echo "  FAIL - Cannot connect to RDS. Check security group and credentials."
  exit 1
fi

echo ""
echo "Step 2: Creating auth database..."
if PGPASSWORD=$DB_PASS psql -h "$RDS_ADDRESS" -U "$DB_USER" -d nl2sql -c "CREATE DATABASE auth;" 2>/dev/null; then
  echo "  OK - Auth database created"
else
  echo "  SKIP - Auth database already exists"
fi

echo ""
echo "Step 3: Verifying databases..."
DATABASES=$(PGPASSWORD=$DB_PASS psql -h "$RDS_ADDRESS" -U "$DB_USER" -d nl2sql -t -c "SELECT datname FROM pg_database WHERE datistemplate = false;" | xargs)
echo "  Found: $DATABASES"

if [[ $DATABASES == *"nl2sql"* ]] && [[ $DATABASES == *"auth"* ]]; then
  echo "  OK"
else
  echo "  FAIL - Missing databases. Expected: nl2sql, auth"
  exit 1
fi

# Build connection URLs
DATABASE_URL="postgresql://${DB_USER}:${DB_PASS}@${RDS_ENDPOINT}/nl2sql"
AUTH_DATABASE_URL="postgresql://${DB_USER}:${DB_PASS}@${RDS_ENDPOINT}/auth"
REDIS_URL="redis://${REDIS_ENDPOINT}:${REDIS_PORT}"

echo ""
echo "========================================="
echo "Setup complete."
echo "========================================="
echo ""
echo "Connection URLs (for .env or Secrets Manager):"
echo "  DATABASE_URL=${DATABASE_URL}"
echo "  AUTH_DATABASE_URL=${AUTH_DATABASE_URL}"
echo "  REDIS_URL=${REDIS_URL}"
echo ""
echo "Next: run Prisma migrations from each service container,"
echo "then seed the databases (see README for docker compose commands)."
