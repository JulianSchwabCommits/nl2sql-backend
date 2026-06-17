# --------------------------------------------------------------------------
# General
# --------------------------------------------------------------------------

variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
  default     = "prod"
}

variable "project_name" {
  description = "Project name for resource naming"
  type        = string
  default     = "nl2sql"
}

# --------------------------------------------------------------------------
# VPC
# --------------------------------------------------------------------------

variable "vpc_cidr" {
  description = "CIDR block for VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "availability_zones" {
  description = "Availability zones"
  type        = list(string)
  default     = ["us-east-1a", "us-east-1b"]
}

variable "enable_nat_gateway" {
  description = "Enable NAT gateway for private subnets (~$32/month)"
  type        = bool
  default     = false
}

# --------------------------------------------------------------------------
# RDS
# --------------------------------------------------------------------------

variable "rds_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t4g.micro"
}

variable "rds_allocated_storage" {
  description = "Allocated storage in GB"
  type        = number
  default     = 20
}

variable "rds_max_allocated_storage" {
  description = "Max storage for autoscaling in GB"
  type        = number
  default     = 100
}

variable "rds_backup_retention_days" {
  description = "Backup retention days"
  type        = number
  default     = 7
}

variable "rds_multi_az" {
  description = "Enable Multi-AZ"
  type        = bool
  default     = false
}

variable "db_master_username" {
  description = "RDS master username"
  type        = string
  sensitive   = true
}

variable "db_master_password" {
  description = "RDS master password"
  type        = string
  sensitive   = true
}

# --------------------------------------------------------------------------
# ElastiCache
# --------------------------------------------------------------------------

variable "redis_node_type" {
  description = "ElastiCache node type"
  type        = string
  default     = "cache.t4g.micro"
}

variable "redis_num_cache_nodes" {
  description = "Number of cache nodes"
  type        = number
  default     = 1
}

# --------------------------------------------------------------------------
# ECS (shared defaults for all services)
# --------------------------------------------------------------------------

variable "ecs_task_cpu" {
  description = "CPU units per task (256=0.25vCPU, 512=0.5vCPU)"
  type        = number
  default     = 512
}

variable "ecs_task_memory" {
  description = "Memory per task in MB"
  type        = number
  default     = 1024
}

variable "ecs_desired_count" {
  description = "Desired task count per service"
  type        = number
  default     = 1
}

variable "ecs_enable_container_insights" {
  description = "Enable CloudWatch Container Insights"
  type        = bool
  default     = false
}

variable "ecs_log_retention_days" {
  description = "CloudWatch log retention days"
  type        = number
  default     = 7
}

# --------------------------------------------------------------------------
# Per-service image tags
# --------------------------------------------------------------------------

variable "core_image_tag" {
  description = "Docker image tag for core service"
  type        = string
  default     = "latest"
}

variable "agent_image_tag" {
  description = "Docker image tag for agent service"
  type        = string
  default     = "latest"
}

variable "database_image_tag" {
  description = "Docker image tag for database service"
  type        = string
  default     = "latest"
}

# --------------------------------------------------------------------------
# ALB / Networking
# --------------------------------------------------------------------------

variable "allowed_cidr_blocks" {
  description = "CIDRs allowed to reach the ALB"
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

variable "alb_enable_deletion_protection" {
  description = "Enable ALB deletion protection"
  type        = bool
  default     = false
}

variable "acm_certificate_arn" {
  description = "ACM certificate ARN for HTTPS (empty = HTTP only)"
  type        = string
  default     = ""
}

variable "domain_name" {
  description = "Domain name (e.g. api.example.com)"
  type        = string
  default     = ""
}

variable "cors_origin" {
  description = "Allowed CORS origins (comma-separated)"
  type        = string
  default     = "*"
}

# --------------------------------------------------------------------------
# Secrets (from secrets.tfvars)
# --------------------------------------------------------------------------

variable "jwt_secret" {
  description = "JWT access token secret"
  type        = string
  sensitive   = true
}

variable "jwt_refresh_secret" {
  description = "JWT refresh token secret"
  type        = string
  sensitive   = true
}

variable "openai_api_key" {
  description = "OpenAI API key"
  type        = string
  sensitive   = true
}

variable "internal_api_key" {
  description = "Shared key for inter-service authentication (x-internal-key header)"
  type        = string
  sensitive   = true
}

# --------------------------------------------------------------------------
# Tags
# --------------------------------------------------------------------------

variable "tags" {
  description = "Additional tags for all resources"
  type        = map(string)
  default     = {}
}
