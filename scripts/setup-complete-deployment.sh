#!/bin/bash
set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}   Complete Deployment Setup           ${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

cd "$(dirname "$0")/../terraform"

# Check if secrets.tfvars exists
if [ ! -f "secrets.tfvars" ]; then
    echo -e "${RED}Error: secrets.tfvars not found${NC}"
    echo "Please create it from secrets.tfvars.example"
    exit 1
fi

# Check if terraform.tfvars has ACM certificate ARN
if ! grep -q "acm_certificate_arn.*arn:aws" terraform.tfvars 2>/dev/null; then
    echo -e "${YELLOW}Warning: ACM certificate ARN not configured in terraform.tfvars${NC}"
    echo ""
    echo "You need to:"
    echo "1. Create or request an SSL certificate in AWS ACM"
    echo "2. Add the ARN to terraform.tfvars:"
    echo "   acm_certificate_arn = \"arn:aws:acm:...\""
    echo "3. Optionally set domain_name = \"api.yourdomain.com\""
    echo ""
    read -p "Press Enter when ready, or Ctrl+C to exit..."
fi

# Check if application secrets are configured
if ! grep -q "jwt_secret" secrets.tfvars; then
    echo -e "${YELLOW}Adding application secrets to secrets.tfvars...${NC}"
    echo ""
    echo "# Application Secrets" >> secrets.tfvars
    
    # Generate JWT secrets
    JWT_SECRET=$(openssl rand -base64 32)
    JWT_REFRESH_SECRET=$(openssl rand -base64 32)
    
    echo "jwt_secret         = \"$JWT_SECRET\"" >> secrets.tfvars
    echo "jwt_refresh_secret = \"$JWT_REFRESH_SECRET\"" >> secrets.tfvars
    
    # Prompt for OpenAI API key
    read -p "Enter OpenAI API Key (or press Enter to skip): " OPENAI_KEY
    if [ -z "$OPENAI_KEY" ]; then
        OPENAI_KEY="sk-placeholder"
    fi
    echo "openai_api_key     = \"$OPENAI_KEY\"" >> secrets.tfvars
    
    echo -e "${GREEN}✓ Application secrets added${NC}"
fi

echo ""
echo -e "${GREEN}Step 1: Applying Terraform configuration...${NC}"
echo "This will create ECS cluster, ALB, ECR, and other infrastructure"
echo ""
read -p "Continue with terraform apply? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted. Run manually with:"
    echo "  cd terraform"
    echo "  terraform apply -var-file=\"terraform.tfvars\" -var-file=\"secrets.tfvars\""
    exit 0
fi

terraform apply -var-file="terraform.tfvars" -var-file="secrets.tfvars" -auto-approve

if [ $? -ne 0 ]; then
    echo -e "${RED}Terraform apply failed${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}✓ Infrastructure created${NC}"
echo ""

# Extract configuration
ECR_REPO_URL=$(terraform output -raw ecr_repository_url)
ECR_REPO_NAME=$(echo $ECR_REPO_URL | rev | cut -d'/' -f1 | rev)
ECS_CLUSTER_NAME=$(terraform output -raw ecs_cluster_name)
ECS_SERVICE_NAME=$(terraform output -raw ecs_service_name)
AWS_REGION=$(terraform show -json | jq -r '.values.root_module.resources[] | select(.address=="aws_vpc.main") | .values.tags_all.Environment' | head -1)
ALB_DNS=$(terraform output -raw alb_dns_name)
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

cd ../scripts

echo ""
echo -e "${GREEN}Step 2: Setting up GitHub OIDC role...${NC}"
echo ""
read -p "GitHub repository (format: owner/repo): " GITHUB_REPO
read -p "IAM role name (default: github-actions-nl2sql-role): " ROLE_NAME
ROLE_NAME=${ROLE_NAME:-github-actions-nl2sql-role}

# Create OIDC provider if it doesn't exist
if ! aws iam get-open-id-connect-provider --open-id-connect-provider-arn "arn:aws:iam::${AWS_ACCOUNT_ID}:oidc-provider/token.actions.githubusercontent.com" &>/dev/null; then
    echo "Creating GitHub OIDC provider..."
    aws iam create-open-id-connect-provider \
        --url https://token.actions.githubusercontent.com \
        --client-id-list sts.amazonaws.com \
        --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1 \
        --tags Key=Project,Value=nl2sql
fi

# Create or update IAM role using the script
AWS_REGION=$AWS_REGION GITHUB_REPO=$GITHUB_REPO ROLE_NAME=$ROLE_NAME \
  bash -c 'cat > /tmp/oidc-setup-auto.sh <<EOF
#!/bin/bash
export AWS_REGION="$AWS_REGION"
export GITHUB_REPO="$GITHUB_REPO"
export ROLE_NAME="$ROLE_NAME"
cd "$(dirname "$0")"
bash setup-github-oidc-role.sh <<ANSWERS
$GITHUB_REPO
$AWS_REGION
$ROLE_NAME
ANSWERS
EOF
chmod +x /tmp/oidc-setup-auto.sh
/tmp/oidc-setup-auto.sh'

ROLE_ARN="arn:aws:iam::${AWS_ACCOUNT_ID}:role/${ROLE_NAME}"
echo ""
echo -e "${GREEN}✓ GitHub OIDC role created: $ROLE_ARN${NC}"
echo ""

echo -e "${GREEN}Step 3: Setting up GitHub secrets...${NC}"
echo ""

gh secret set AWS_REGION --body "$AWS_REGION"
gh secret set AWS_ROLE_ARN --body "$ROLE_ARN"
gh secret set ECR_REPOSITORY_NAME --body "$ECR_REPO_NAME"
gh secret set ECS_CLUSTER_NAME --body "$ECS_CLUSTER_NAME"
gh secret set ECS_SERVICE_NAME --body "$ECS_SERVICE_NAME"
gh secret set ECS_TASK_DEFINITION_FAMILY --body "$ECS_SERVICE_NAME"

echo -e "${GREEN}✓ GitHub secrets configured${NC}"
echo ""

echo -e "${GREEN}Step 4: Setting up AWS Secrets Manager...${NC}"
echo ""

# Extract secrets from terraform
cd ../terraform
DB_PASSWORD=$(grep db_master_password secrets.tfvars | cut -d'"' -f2)
JWT_SECRET=$(grep jwt_secret secrets.tfvars | head -1 | cut -d'"' -f2)
JWT_REFRESH_SECRET=$(grep jwt_refresh_secret secrets.tfvars | cut -d'"' -f2)
OPENAI_KEY=$(grep openai_api_key secrets.tfvars | cut -d'"' -f2)

# Update secrets in AWS Secrets Manager
aws secretsmanager put-secret-value \
  --secret-id nl2sql-prod-app-secrets \
  --secret-string "{\"database_password\":\"$DB_PASSWORD\",\"jwt_secret\":\"$JWT_SECRET\",\"jwt_refresh_secret\":\"$JWT_REFRESH_SECRET\",\"openai_api_key\":\"$OPENAI_KEY\"}" \
  --region $AWS_REGION

echo -e "${GREEN}✓ AWS secrets configured${NC}"
echo ""

echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}Setup Complete!${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo "Configuration:"
echo "  - ECR Repository: $ECR_REPO_URL"
echo "  - ECS Cluster: $ECS_CLUSTER_NAME"
echo "  - ALB DNS: $ALB_DNS"
echo ""
echo "Next Steps:"
echo ""
echo "1. Configure DNS (CNAME):"
echo "   api.yourdomain.com -> $ALB_DNS"
echo ""
echo "2. Initialize databases:"
echo "   See DEPLOYMENT.md for database setup instructions"
echo ""
echo "3. Deploy application:"
echo "   Option A: Push to GitHub main branch (triggers CI/CD)"
echo "   Option B: Manual docker build and push"
echo ""
echo "For detailed instructions, see DEPLOYMENT.md"
echo ""
