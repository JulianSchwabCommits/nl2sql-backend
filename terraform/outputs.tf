# --------------------------------------------------------------------------
# VPC
# --------------------------------------------------------------------------

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

# --------------------------------------------------------------------------
# RDS
# --------------------------------------------------------------------------

output "rds_endpoint" {
  description = "RDS instance endpoint"
  value       = aws_db_instance.postgres.endpoint
}

output "rds_address" {
  description = "RDS address (without port)"
  value       = aws_db_instance.postgres.address
}

output "rds_port" {
  description = "RDS port"
  value       = aws_db_instance.postgres.port
}

output "rds_database_name" {
  description = "Default database name"
  value       = aws_db_instance.postgres.db_name
}

# --------------------------------------------------------------------------
# Redis
# --------------------------------------------------------------------------

output "redis_endpoint" {
  description = "Redis endpoint"
  value       = aws_elasticache_cluster.redis.cache_nodes[0].address
}

output "redis_port" {
  description = "Redis port"
  value       = aws_elasticache_cluster.redis.cache_nodes[0].port
}

# --------------------------------------------------------------------------
# Security Groups
# --------------------------------------------------------------------------

output "alb_security_group_id" {
  description = "ALB security group ID"
  value       = aws_security_group.alb.id
}

output "core_security_group_id" {
  description = "Core service security group ID"
  value       = aws_security_group.core.id
}

output "agent_security_group_id" {
  description = "Agent service security group ID"
  value       = aws_security_group.agent.id
}

output "database_svc_security_group_id" {
  description = "Database service security group ID"
  value       = aws_security_group.database_svc.id
}

output "rds_security_group_id" {
  description = "RDS security group ID"
  value       = aws_security_group.rds.id
}

output "redis_security_group_id" {
  description = "Redis security group ID"
  value       = aws_security_group.redis.id
}

# --------------------------------------------------------------------------
# ECS
# --------------------------------------------------------------------------

output "ecs_cluster_name" {
  description = "ECS cluster name"
  value       = aws_ecs_cluster.main.name
}

output "ecs_cluster_arn" {
  description = "ECS cluster ARN"
  value       = aws_ecs_cluster.main.arn
}

output "ecs_service_core" {
  description = "Core ECS service name"
  value       = aws_ecs_service.core.name
}

output "ecs_service_agent" {
  description = "Agent ECS service name"
  value       = aws_ecs_service.agent.name
}

output "ecs_service_database" {
  description = "Database ECS service name"
  value       = aws_ecs_service.database.name
}

# --------------------------------------------------------------------------
# ECR
# --------------------------------------------------------------------------

output "ecr_core_url" {
  description = "ECR repository URL for core"
  value       = aws_ecr_repository.core.repository_url
}

output "ecr_agent_url" {
  description = "ECR repository URL for agent"
  value       = aws_ecr_repository.agent.repository_url
}

output "ecr_database_url" {
  description = "ECR repository URL for database"
  value       = aws_ecr_repository.database.repository_url
}

# --------------------------------------------------------------------------
# ALB
# --------------------------------------------------------------------------

output "alb_dns_name" {
  description = "ALB DNS name"
  value       = aws_lb.main.dns_name
}

output "alb_zone_id" {
  description = "ALB hosted zone ID (for Route53 alias)"
  value       = aws_lb.main.zone_id
}

output "app_url" {
  description = "Application URL"
  value       = var.domain_name != "" ? "https://${var.domain_name}" : "http://${aws_lb.main.dns_name}"
}
