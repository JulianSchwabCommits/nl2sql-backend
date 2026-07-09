#!/bin/bash
set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}Setting up AWS Secrets Manager secrets...${NC}"

# is AWS CLI installed?
if ! command -v aws &> /dev/null; then
    echo -e "${RED}Error: AWS CLI is not installed${NC}"
    echo "Install it from: https://aws.amazon.com/cli/"
    exit 1
fi

# Check if jq is installed
if ! command -v jq &> /dev/null; then
    echo -e "${RED}Error: jq is not installed${NC}"
    echo "Install it: sudo apt-get install jq (Ubuntu/Debian) or brew install jq (macOS)"
    exit 1
fi

# Load environment variables from terraform outputs or prompt
echo ""
echo -e "${YELLOW}=== Configuration ===${NC}"
read -p "Project name (e.g., nl2sql): " PROJECT_NAME
read -p "Environment (e.g., prod): " ENVIRONMENT
read -p "AWS Region (e.g., eu-central-2): " AWS_REGION

SECRET_NAME="${PROJECT_NAME}-${ENVIRONMENT}-app-secrets"

echo ""
echo -e "${YELLOW}=== Application Secrets ===${NC}"
echo "Enter the following secrets:"
echo ""

read -sp "Database Password: " DATABASE_PASSWORD
echo ""
read -sp "JWT Secret: " JWT_SECRET
echo ""
read -sp "JWT Refresh Secret: " JWT_REFRESH_SECRET
echo ""
read -sp "DB Encryption Key: " DB_ENCRYPTION_KEY
echo ""
read -sp "Internal API Key: " INTERNAL_API_KEY
echo ""

# Create JSON for secrets
SECRET_JSON=$(jq -n \
  --arg db_pass "$DATABASE_PASSWORD" \
  --arg jwt_secret "$JWT_SECRET" \
  --arg jwt_refresh "$JWT_REFRESH_SECRET" \
  --arg db_enc_key "$DB_ENCRYPTION_KEY" \
  --arg internal_key "$INTERNAL_API_KEY" \
  '{
    database_password: $db_pass,
    jwt_secret: $jwt_secret,
    jwt_refresh_secret: $jwt_refresh,
    db_encryption_key: $db_enc_key,
    internal_api_key: $internal_key
  }')

echo ""
echo -e "${GREEN}Updating AWS Secrets Manager...${NC}"

# Check if secret exists
if aws secretsmanager describe-secret --secret-id "$SECRET_NAME" --region "$AWS_REGION" &> /dev/null; then
    echo "Secret exists. Updating..."
    aws secretsmanager put-secret-value \
        --secret-id "$SECRET_NAME" \
        --secret-string "$SECRET_JSON" \
        --region "$AWS_REGION"
else
    echo "Secret does not exist. Creating..."
    aws secretsmanager create-secret \
        --name "$SECRET_NAME" \
        --description "Application secrets for ${PROJECT_NAME} ${ENVIRONMENT}" \
        --secret-string "$SECRET_JSON" \
        --region "$AWS_REGION"
fi

echo ""
echo -e "${GREEN}✓ AWS secrets updated successfully!${NC}"
echo ""
echo "Secret name: $SECRET_NAME"
echo "Region: $AWS_REGION"
echo ""
echo -e "${YELLOW}Note: ECS tasks will automatically fetch these secrets at runtime${NC}"
