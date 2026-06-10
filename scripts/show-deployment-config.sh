#!/bin/bash
set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}   NL2SQL Deployment Configuration     ${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

cd "$(dirname "$0")/../terraform"

# Check if terraform state exists
if [ ! -f "terraform.tfstate" ]; then
    echo -e "${RED}Error: Terraform state not found${NC}"
    echo "Please run 'terraform apply' first"
    exit 1
fi

echo -e "${GREEN}Extracting configuration from Terraform...${NC}"
echo ""

# Extract outputs
ECR_REPO_URL=$(terraform output -raw ecr_repository_url 2>/dev/null || echo "N/A")
ECR_REPO_NAME=$(echo $ECR_REPO_URL | rev | cut -d'/' -f1 | rev)
ECS_CLUSTER_NAME=$(terraform output -raw ecs_cluster_name 2>/dev/null || echo "N/A")
ECS_SERVICE_NAME=$(terraform output -raw ecs_service_name 2>/dev/null || echo "N/A")
AWS_REGION=$(terraform output -json | jq -r '.aws_region.value // "N/A"' 2>/dev/null || echo "N/A")
ALB_DNS=$(terraform output -raw alb_dns_name 2>/dev/null || echo "N/A")
RDS_ENDPOINT=$(terraform output -raw rds_address 2>/dev/null || echo "N/A")
REDIS_ENDPOINT=$(terraform output -raw redis_endpoint 2>/dev/null || echo "N/A")

echo -e "${YELLOW}=== AWS Configuration ===${NC}"
echo "AWS Region: $AWS_REGION"
echo "AWS Account ID: $(aws sts get-caller-identity --query Account --output text 2>/dev/null || echo 'N/A')"
echo ""

echo -e "${YELLOW}=== ECR Configuration ===${NC}"
echo "ECR Repository URL: $ECR_REPO_URL"
echo "ECR Repository Name: $ECR_REPO_NAME"
echo ""

echo -e "${YELLOW}=== ECS Configuration ===${NC}"
echo "ECS Cluster Name: $ECS_CLUSTER_NAME"
echo "ECS Service Name: $ECS_SERVICE_NAME"
echo "ECS Task Definition Family: $ECS_SERVICE_NAME"
echo ""

echo -e "${YELLOW}=== Load Balancer ===${NC}"
echo "ALB DNS Name: $ALB_DNS"
echo ""

echo -e "${YELLOW}=== Database Configuration ===${NC}"
echo "RDS Endpoint: $RDS_ENDPOINT"
echo "Redis Endpoint: $REDIS_ENDPOINT"
echo ""

echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}Next Steps:${NC}"
echo ""
echo "1. Setup GitHub OIDC Role:"
echo -e "   ${BLUE}cd scripts && ./setup-github-oidc-role.sh${NC}"
echo ""
echo "2. Setup GitHub Secrets:"
echo -e "   ${BLUE}./setup-github-secrets.sh${NC}"
echo "   Use these values:"
echo "   - AWS Region: $AWS_REGION"
echo "   - ECR Repository Name: $ECR_REPO_NAME"
echo "   - ECS Cluster Name: $ECS_CLUSTER_NAME"
echo "   - ECS Service Name: $ECS_SERVICE_NAME"
echo "   - ECS Task Definition Family: $ECS_SERVICE_NAME"
echo ""
echo "3. Setup AWS Secrets:"
echo -e "   ${BLUE}./setup-aws-secrets.sh${NC}"
echo ""
echo "4. Configure DNS:"
echo "   Create a CNAME record:"
echo "   api.yourdomain.com -> $ALB_DNS"
echo ""
echo "5. Initialize databases and deploy:"
echo "   See DEPLOYMENT.md for detailed instructions"
echo ""
echo -e "${BLUE}========================================${NC}"

# Save to file for reference
cat > ../deployment-config.txt <<EOF
# NL2SQL Deployment Configuration
# Generated: $(date)

# AWS
AWS_REGION=$AWS_REGION

# ECR
ECR_REPOSITORY_NAME=$ECR_REPO_NAME
ECR_REPOSITORY_URL=$ECR_REPO_URL

# ECS
ECS_CLUSTER_NAME=$ECS_CLUSTER_NAME
ECS_SERVICE_NAME=$ECS_SERVICE_NAME
ECS_TASK_DEFINITION_FAMILY=$ECS_SERVICE_NAME

# Load Balancer
ALB_DNS_NAME=$ALB_DNS

# Database
RDS_ENDPOINT=$RDS_ENDPOINT
REDIS_ENDPOINT=$REDIS_ENDPOINT
EOF

echo ""
echo -e "${GREEN}Configuration saved to deployment-config.txt${NC}"
