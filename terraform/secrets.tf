# AWS Secrets Manager for application secrets
resource "aws_secretsmanager_secret" "app_secrets" {
  name                    = "${var.project_name}-${var.environment}-app-secrets"
  description             = "Application secrets for ${var.project_name} ${var.environment}"
  recovery_window_in_days = 0  # Set to 0 for immediate deletion (dev/test), 7-30 for production

  tags = {
    Name = "${var.project_name}-${var.environment}-app-secrets"
  }
}

# Secret values - these will be set via CLI after terraform apply
resource "aws_secretsmanager_secret_version" "app_secrets" {
  secret_id = aws_secretsmanager_secret.app_secrets.id
  secret_string = jsonencode({
    database_password   = var.db_master_password
    jwt_secret          = var.jwt_secret
    jwt_refresh_secret  = var.jwt_refresh_secret
    openai_api_key      = var.openai_api_key
  })

  lifecycle {
    ignore_changes = [secret_string]  # Allow manual updates via CLI
  }
}
