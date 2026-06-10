#!/bin/bash
set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}Setting up GitHub Actions secrets...${NC}"

# Check if gh CLI is installed
if ! command -v gh &> /dev/null; then
    echo -e "${RED}Error: GitHub CLI (gh) is not installed${NC}"
    echo "Install it from: https://cli.github.com/"
    exit 1
fi

# Check if logged in
if ! gh auth status &> /dev/null; then
    echo -e "${YELLOW}Not logged in to GitHub CLI. Logging in...${NC}"
    gh auth login
fi

# Get current repository
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
echo -e "${GREEN}Setting secrets for repository: ${REPO}${NC}"

# Prompt for secrets
echo ""
echo -e "${YELLOW}=== AWS Configuration ===${NC}"
read -p "AWS Region (e.g., eu-central-2): " AWS_REGION
read -p "AWS Role ARN for GitHub Actions (e.g., arn:aws:iam::123456789012:role/github-actions-role): " AWS_ROLE_ARN

echo ""
echo -e "${YELLOW}=== ECR Configuration ===${NC}"
read -p "ECR Repository Name (e.g., nl2sql-prod-backend): " ECR_REPOSITORY_NAME

echo ""
echo -e "${YELLOW}=== ECS Configuration ===${NC}"
read -p "ECS Cluster Name (e.g., nl2sql-prod-cluster): " ECS_CLUSTER_NAME
read -p "ECS Service Name (e.g., nl2sql-prod-backend): " ECS_SERVICE_NAME
read -p "ECS Task Definition Family (e.g., nl2sql-prod-backend): " ECS_TASK_DEFINITION_FAMILY

# Set GitHub secrets
echo ""
echo -e "${GREEN}Creating GitHub secrets...${NC}"

gh secret set AWS_REGION --body "$AWS_REGION"
gh secret set AWS_ROLE_ARN --body "$AWS_ROLE_ARN"
gh secret set ECR_REPOSITORY_NAME --body "$ECR_REPOSITORY_NAME"
gh secret set ECS_CLUSTER_NAME --body "$ECS_CLUSTER_NAME"
gh secret set ECS_SERVICE_NAME --body "$ECS_SERVICE_NAME"
gh secret set ECS_TASK_DEFINITION_FAMILY --body "$ECS_TASK_DEFINITION_FAMILY"

echo ""
echo -e "${GREEN}✓ GitHub secrets created successfully!${NC}"
echo ""
echo "Secrets set:"
echo "  - AWS_REGION: $AWS_REGION"
echo "  - AWS_ROLE_ARN: $AWS_ROLE_ARN"
echo "  - ECR_REPOSITORY_NAME: $ECR_REPOSITORY_NAME"
echo "  - ECS_CLUSTER_NAME: $ECS_CLUSTER_NAME"
echo "  - ECS_SERVICE_NAME: $ECS_SERVICE_NAME"
echo "  - ECS_TASK_DEFINITION_FAMILY: $ECS_TASK_DEFINITION_FAMILY"
echo ""
echo -e "${YELLOW}Note: Make sure you've created the IAM role for GitHub Actions OIDC${NC}"
