# --------------------------------------------------------------------------
# ALB Security Group (public-facing)
# --------------------------------------------------------------------------

resource "aws_security_group" "alb" {
  name        = "${var.project_name}-${var.environment}-alb-sg"
  description = "Security group for Application Load Balancer"
  vpc_id      = aws_vpc.main.id

  ingress {
    description = "HTTP"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = var.allowed_cidr_blocks
  }

  ingress {
    description = "HTTPS"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = var.allowed_cidr_blocks
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.project_name}-${var.environment}-alb-sg" }
}

# --------------------------------------------------------------------------
# Core service SG (receives traffic from ALB on port 3000)
# --------------------------------------------------------------------------

resource "aws_security_group" "core" {
  name        = "${var.project_name}-${var.environment}-core-sg"
  description = "Core service - ALB traffic on 3000"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "From ALB"
    from_port       = 3000
    to_port         = 3000
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  # Service Connect sidecar proxy traffic from other services
  ingress {
    description = "Service Connect mesh"
    from_port   = 3000
    to_port     = 3000
    protocol    = "tcp"
    self        = true
  }

  ingress {
    description     = "From agent (approval checks)"
    from_port       = 3000
    to_port         = 3000
    protocol        = "tcp"
    security_groups = [aws_security_group.agent.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.project_name}-${var.environment}-core-sg" }
}

# --------------------------------------------------------------------------
# Agent service SG (receives traffic from ALB on port 3001)
# --------------------------------------------------------------------------

resource "aws_security_group" "agent" {
  name        = "${var.project_name}-${var.environment}-agent-sg"
  description = "Agent service - ALB traffic on 3001"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "From ALB"
    from_port       = 3001
    to_port         = 3001
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  ingress {
    description = "Service Connect mesh"
    from_port   = 3001
    to_port     = 3001
    protocol    = "tcp"
    self        = true
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.project_name}-${var.environment}-agent-sg" }
}

# --------------------------------------------------------------------------
# Database service SG (internal only — NO ALB access)
# --------------------------------------------------------------------------

resource "aws_security_group" "database_svc" {
  name        = "${var.project_name}-${var.environment}-database-svc-sg"
  description = "Database service - internal only, from core and agent"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "From core"
    from_port       = 3002
    to_port         = 3002
    protocol        = "tcp"
    security_groups = [aws_security_group.core.id]
  }

  ingress {
    description     = "From agent"
    from_port       = 3002
    to_port         = 3002
    protocol        = "tcp"
    security_groups = [aws_security_group.agent.id]
  }

  ingress {
    description = "Service Connect mesh"
    from_port   = 3002
    to_port     = 3002
    protocol    = "tcp"
    self        = true
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.project_name}-${var.environment}-database-svc-sg" }
}

# --------------------------------------------------------------------------
# RDS Security Group
# --------------------------------------------------------------------------

resource "aws_security_group" "rds" {
  name        = "${var.project_name}-${var.environment}-rds-sg"
  description = "Security group for RDS PostgreSQL instance"
  vpc_id      = aws_vpc.main.id

  # Core needs auth DB access
  ingress {
    description     = "PostgreSQL from core"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.core.id]
  }

  # Database service needs food DB access
  ingress {
    description     = "PostgreSQL from database service"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.database_svc.id]
  }

  # TEMPORARY: Allow from anywhere for migrations
  ingress {
    description = "PostgreSQL from anywhere (TEMPORARY)"
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.project_name}-${var.environment}-rds-sg" }
}

# --------------------------------------------------------------------------
# ElastiCache (Redis) Security Group
# --------------------------------------------------------------------------

resource "aws_security_group" "redis" {
  name        = "${var.project_name}-${var.environment}-redis-sg"
  description = "Security group for ElastiCache Redis"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "Redis from database service"
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.database_svc.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.project_name}-${var.environment}-redis-sg" }
}
