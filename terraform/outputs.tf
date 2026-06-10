output "vpc_id" {
  description = "VPC ID"
  value       = aws_vpc.main.id
}

output "public_subnet_ids" {
  description = "Public subnet IDs"
  value       = aws_subnet.public[*].id
}

output "private_subnet_ids" {
  description = "Private subnet IDs"
  value       = aws_subnet.private[*].id
}

# RDS Outputs
output "rds_endpoint" {
  description = "RDS instance endpoint"
  value       = aws_db_instance.postgres.endpoint
}

output "rds_address" {
  description = "RDS instance address (without port)"
  value       = aws_db_instance.postgres.address
}

output "rds_port" {
  description = "RDS instance port"
  value       = aws_db_instance.postgres.port
}

output "rds_database_name" {
  description = "Default database name"
  value       = aws_db_instance.postgres.db_name
}

output "database_url_template" {
  description = "Template for DATABASE_URL (food database)"
  value       = "postgresql://${var.db_master_username}:<PASSWORD>@${aws_db_instance.postgres.endpoint}/nl2sql"
  sensitive   = true
}

output "auth_database_url_template" {
  description = "Template for AUTH_DATABASE_URL (auth database)"
  value       = "postgresql://${var.db_master_username}:<PASSWORD>@${aws_db_instance.postgres.endpoint}/auth"
  sensitive   = true
}

# Redis Outputs
output "redis_endpoint" {
  description = "Redis cluster endpoint"
  value       = aws_elasticache_cluster.redis.cache_nodes[0].address
}

output "redis_port" {
  description = "Redis cluster port"
  value       = aws_elasticache_cluster.redis.cache_nodes[0].port
}

output "redis_url" {
  description = "Redis connection URL"
  value       = "redis://${aws_elasticache_cluster.redis.cache_nodes[0].address}:${aws_elasticache_cluster.redis.cache_nodes[0].port}"
}

# Security Group IDs
output "rds_security_group_id" {
  description = "RDS security group ID"
  value       = aws_security_group.rds.id
}

output "redis_security_group_id" {
  description = "Redis security group ID"
  value       = aws_security_group.redis.id
}

output "backend_security_group_id" {
  description = "Backend security group ID"
  value       = aws_security_group.ecs_tasks.id
}

output "alb_security_group_id" {
  description = "ALB security group ID"
  value       = aws_security_group.alb.id
}

# ECS Outputs
output "ecs_cluster_name" {
  description = "ECS cluster name"
  value       = aws_ecs_cluster.main.name
}

output "ecs_cluster_arn" {
  description = "ECS cluster ARN"
  value       = aws_ecs_cluster.main.arn
}

output "ecs_service_name" {
  description = "ECS service name"
  value       = aws_ecs_service.backend.name
}

output "ecr_repository_url" {
  description = "ECR repository URL"
  value       = aws_ecr_repository.backend.repository_url
}

output "alb_dns_name" {
  description = "ALB DNS name"
  value       = aws_lb.main.dns_name
}

output "alb_zone_id" {
  description = "ALB hosted zone ID (for Route53 alias record)"
  value       = aws_lb.main.zone_id
}

output "app_url" {
  description = "Application URL"
  value       = var.domain_name != "" ? "https://${var.domain_name}" : "https://${aws_lb.main.dns_name}"
}

# Instructions
output "next_steps" {
  description = "Next steps after infrastructure is created"
  sensitive   = true
  value       = <<-EOT
  
  ============================================================
  Infrastructure Created Successfully!
  ============================================================
  
  1. CREATE THE AUTH DATABASE:
     
     psql -h ${aws_db_instance.postgres.address} -U ${var.db_master_username} -d nl2sql
     
     Then run: CREATE DATABASE auth;
     
  2. UPDATE YOUR .env FILE:
     
     DATABASE_URL="postgresql://${var.db_master_username}:<PASSWORD>@${aws_db_instance.postgres.endpoint}/nl2sql"
     AUTH_DATABASE_URL="postgresql://${var.db_master_username}:<PASSWORD>@${aws_db_instance.postgres.endpoint}/auth"
     REDIS_URL="redis://${aws_elasticache_cluster.redis.cache_nodes[0].address}:${aws_elasticache_cluster.redis.cache_nodes[0].port}"
     
  3. RUN PRISMA MIGRATIONS:
     
     npm run db:migrate    # For food database
     npm run auth:migrate  # For auth database
     
  4. SEED THE DATABASES:
     
     npm run db:setup      # Seed food data
     npm run auth:seed     # Create admin user
     
  5. STORE SECRETS IN SSM:
     
     aws ssm put-parameter --name /nl2sql/prod/database-url --value "<DATABASE_URL>" --type SecureString
     aws ssm put-parameter --name /nl2sql/prod/auth-database-url --value "<AUTH_DATABASE_URL>" --type SecureString
     aws ssm put-parameter --name /nl2sql/prod/redis-url --value "<REDIS_URL>" --type SecureString
     
  Note: Password is in your secrets.tfvars file
  
  ============================================================
  EOT
}
