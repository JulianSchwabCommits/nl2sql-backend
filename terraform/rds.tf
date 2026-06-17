# DB Subnet Group for RDS (TEMPORARY: using public subnets for initial setup)
resource "aws_db_subnet_group" "main" {
  name       = "${var.project_name}-${var.environment}-db-subnet-group"
  subnet_ids = aws_subnet.public[*].id # CHANGED to public for migrations

  tags = {
    Name = "${var.project_name}-${var.environment}-db-subnet-group"
  }
}

# RDS Parameter Group for PostgreSQL optimization
resource "aws_db_parameter_group" "postgres" {
  name   = "${var.project_name}-${var.environment}-postgres-params"
  family = "postgres16"

  parameter {
    name  = "log_connections"
    value = "1"
  }

  parameter {
    name  = "log_disconnections"
    value = "1"
  }

  parameter {
    name  = "log_duration"
    value = "1"
  }

  parameter {
    name  = "rds.force_ssl"
    value = "0"
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-postgres-params"
  }
}

# RDS PostgreSQL Instance (hosts BOTH auth and food databases)
resource "aws_db_instance" "postgres" {
  identifier = "${var.project_name}-${var.environment}-postgres"

  # Engine
  engine                = "postgres"
  engine_version        = "16.13"
  instance_class        = var.rds_instance_class
  allocated_storage     = var.rds_allocated_storage
  max_allocated_storage = var.rds_max_allocated_storage
  storage_type          = "gp3"
  storage_encrypted     = true

  # Credentials
  db_name  = "nl2sql" # Default database
  username = var.db_master_username
  password = var.db_master_password

  # Network
  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  publicly_accessible    = true # TEMPORARY: for initial migrations
  port                   = 5432

  # Backup
  backup_retention_period   = var.rds_backup_retention_days
  backup_window             = "03:00-04:00"         # UTC
  maintenance_window        = "mon:04:00-mon:05:00" # UTC
  skip_final_snapshot       = true                  # TEMPORARY: skip snapshot for faster recreation
  final_snapshot_identifier = "${var.project_name}-${var.environment}-final-snapshot-${formatdate("YYYY-MM-DD-hhmm", timestamp())}"

  # High Availability
  multi_az = var.rds_multi_az

  # Parameter Group
  parameter_group_name = aws_db_parameter_group.postgres.name

  # Monitoring
  enabled_cloudwatch_logs_exports = ["postgresql", "upgrade"]
  monitoring_interval             = 60
  monitoring_role_arn             = aws_iam_role.rds_monitoring.arn

  # Performance Insights
  performance_insights_enabled = false # Set to true for production (extra cost)
  # performance_insights_retention_period = 7

  # Deletion Protection
  deletion_protection = false # Set to true for production

  # Auto minor version upgrade
  auto_minor_version_upgrade = true

  tags = {
    Name = "${var.project_name}-${var.environment}-postgres"
    Note = "Hosts both auth and nl2sql databases"
  }

  lifecycle {
    ignore_changes = [
      final_snapshot_identifier,
    ]
  }
}

# IAM Role for RDS Enhanced Monitoring
resource "aws_iam_role" "rds_monitoring" {
  name = "${var.project_name}-${var.environment}-rds-monitoring-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "monitoring.rds.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Name = "${var.project_name}-${var.environment}-rds-monitoring-role"
  }
}

resource "aws_iam_role_policy_attachment" "rds_monitoring" {
  role       = aws_iam_role.rds_monitoring.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole"
}

# Note: After RDS is created, you need to create the "auth" database manually:
# psql -h <endpoint> -U <master_username> -d nl2sql -c "CREATE DATABASE auth;"
# Then run Prisma migrations for both databases
