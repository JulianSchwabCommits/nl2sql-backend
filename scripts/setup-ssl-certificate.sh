#!/bin/bash
set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}   SSL Certificate Setup               ${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

read -p "Domain name for your API (e.g., api.yourdomain.com): " DOMAIN_NAME
read -p "AWS Region (default: eu-central-2): " AWS_REGION
AWS_REGION=${AWS_REGION:-eu-central-2}

echo ""
echo -e "${GREEN}Requesting SSL certificate from AWS ACM...${NC}"

CERT_ARN=$(aws acm request-certificate \
  --domain-name "$DOMAIN_NAME" \
  --validation-method DNS \
  --region "$AWS_REGION" \
  --query 'CertificateArn' \
  --output text)

echo ""
echo -e "${GREEN}✓ Certificate requested${NC}"
echo "Certificate ARN: $CERT_ARN"
echo ""

echo -e "${YELLOW}Fetching DNS validation records...${NC}"
sleep 3  # Wait for AWS to generate validation records

aws acm describe-certificate \
  --certificate-arn "$CERT_ARN" \
  --region "$AWS_REGION" \
  --query 'Certificate.DomainValidationOptions[0].ResourceRecord' \
  --output table

echo ""
echo -e "${YELLOW}Next Steps:${NC}"
echo "1. Add the DNS validation record to your domain:"
echo "   - Log in to your DNS provider"
echo "   - Add the CNAME record shown above"
echo ""
echo "2. Wait for certificate validation (usually 5-30 minutes)"
echo "   Check status with:"
echo "   aws acm describe-certificate --certificate-arn $CERT_ARN --region $AWS_REGION --query 'Certificate.Status'"
echo ""
echo "3. Once validated, update terraform.tfvars:"
echo "   domain_name = \"$DOMAIN_NAME\""
echo "   acm_certificate_arn = \"$CERT_ARN\""
echo ""

# Save certificate ARN
cat > ../certificate-info.txt <<EOF
# SSL Certificate Information
# Generated: $(date)

DOMAIN_NAME=$DOMAIN_NAME
CERTIFICATE_ARN=$CERT_ARN
AWS_REGION=$AWS_REGION

# Status check command:
aws acm describe-certificate --certificate-arn $CERT_ARN --region $AWS_REGION --query 'Certificate.Status'

# Add to terraform.tfvars:
domain_name = "$DOMAIN_NAME"
acm_certificate_arn = "$CERT_ARN"
EOF

echo -e "${GREEN}Certificate info saved to certificate-info.txt${NC}"
