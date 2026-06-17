# --------------------------------------------------------------------------
# ECS Cluster + Service Connect namespace
# --------------------------------------------------------------------------

resource "aws_ecs_cluster" "main" {
  name = "${var.project_name}-${var.environment}-cluster"

  setting {
    name  = "containerInsights"
    value = var.ecs_enable_container_insights ? "enabled" : "disabled"
  }

  service_connect_defaults {
    namespace = aws_service_discovery_http_namespace.main.arn
  }

  tags = { Name = "${var.project_name}-${var.environment}-cluster" }
}

resource "aws_service_discovery_http_namespace" "main" {
  name        = "${var.project_name}-${var.environment}"
  description = "Service Connect namespace for ${var.project_name} microservices"

  tags = { Name = "${var.project_name}-${var.environment}-namespace" }
}

# --------------------------------------------------------------------------
# IAM Roles (shared across all services)
# --------------------------------------------------------------------------

resource "aws_iam_role" "ecs_task_execution" {
  name = "${var.project_name}-${var.environment}-ecs-exec"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "ecs_task_execution" {
  role       = aws_iam_role.ecs_task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy" "ecs_task_execution_extra" {
  name = "${var.project_name}-${var.environment}-ecs-exec-extra"
  role = aws_iam_role.ecs_task_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["ecr:GetAuthorizationToken", "ecr:BatchCheckLayerAvailability", "ecr:GetDownloadUrlForLayer", "ecr:BatchGetImage"]
        Resource = "*"
      },
      {
        Effect   = "Allow"
        Action   = ["secretsmanager:GetSecretValue"]
        Resource = [aws_secretsmanager_secret.app_secrets.arn]
      }
    ]
  })
}

resource "aws_iam_role" "ecs_task" {
  name = "${var.project_name}-${var.environment}-ecs-task"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
    }]
  })
}

# --------------------------------------------------------------------------
# CloudWatch Log Groups (one per service)
# --------------------------------------------------------------------------

resource "aws_cloudwatch_log_group" "core" {
  name              = "/ecs/${var.project_name}-${var.environment}/core"
  retention_in_days = var.ecs_log_retention_days
  tags              = { Name = "${var.project_name}-${var.environment}-core-logs" }
}

resource "aws_cloudwatch_log_group" "agent" {
  name              = "/ecs/${var.project_name}-${var.environment}/agent"
  retention_in_days = var.ecs_log_retention_days
  tags              = { Name = "${var.project_name}-${var.environment}-agent-logs" }
}

resource "aws_cloudwatch_log_group" "database" {
  name              = "/ecs/${var.project_name}-${var.environment}/database"
  retention_in_days = var.ecs_log_retention_days
  tags              = { Name = "${var.project_name}-${var.environment}-database-logs" }
}

# --------------------------------------------------------------------------
# Task Definitions
# --------------------------------------------------------------------------

resource "aws_ecs_task_definition" "core" {
  family                   = "${var.project_name}-${var.environment}-core"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.ecs_task_cpu
  memory                   = var.ecs_task_memory
  execution_role_arn       = aws_iam_role.ecs_task_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([{
    name      = "core"
    image     = "${aws_ecr_repository.core.repository_url}:${var.core_image_tag}"
    essential = true

    portMappings = [{ containerPort = 3000, hostPort = 3000, protocol = "tcp", name = "core" }]

    environment = [
      { name = "NODE_ENV", value = "production" },
      { name = "PORT", value = "3000" },
      { name = "AUTH_DATABASE_URL", value = "postgresql://${var.db_master_username}:${var.db_master_password}@${aws_db_instance.postgres.address}:${aws_db_instance.postgres.port}/auth?schema=public" },
      { name = "DATABASE_SERVICE_URL", value = "http://database:3002" },
      { name = "CORS_ORIGIN", value = var.cors_origin },
      { name = "BCRYPT_ROUNDS", value = "10" },
      { name = "ACCESS_TOKEN_TTL_SEC", value = "900" },
      { name = "REFRESH_TOKEN_TTL_SEC", value = "604800" },
      { name = "ADMIN_TOKEN_TTL_SEC", value = "14400" },
      { name = "THROTTLE_SHORT_TTL_MS", value = "60000" },
      { name = "THROTTLE_SHORT_LIMIT", value = "10" },
      { name = "THROTTLE_LONG_TTL_MS", value = "600000" },
      { name = "THROTTLE_LONG_LIMIT", value = "100" },
    ]

    secrets = [
      { name = "JWT_SECRET", valueFrom = "${aws_secretsmanager_secret.app_secrets.arn}:jwt_secret::" },
      { name = "JWT_REFRESH_SECRET", valueFrom = "${aws_secretsmanager_secret.app_secrets.arn}:jwt_refresh_secret::" },
      { name = "INTERNAL_API_KEY", valueFrom = "${aws_secretsmanager_secret.app_secrets.arn}:internal_api_key::" },
    ]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.core.name
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "core"
      }
    }

    healthCheck = {
      command     = ["CMD-SHELL", "wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1"]
      interval    = 30
      timeout     = 5
      retries     = 3
      startPeriod = 60
    }
  }])

  tags = { Name = "${var.project_name}-${var.environment}-core-task" }
}

resource "aws_ecs_task_definition" "agent" {
  family                   = "${var.project_name}-${var.environment}-agent"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.ecs_task_cpu
  memory                   = var.ecs_task_memory
  execution_role_arn       = aws_iam_role.ecs_task_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([{
    name      = "agent"
    image     = "${aws_ecr_repository.agent.repository_url}:${var.agent_image_tag}"
    essential = true

    portMappings = [{ containerPort = 3001, hostPort = 3001, protocol = "tcp", name = "agent" }]

    environment = [
      { name = "NODE_ENV", value = "production" },
      { name = "PORT", value = "3001" },
      { name = "CORE_SERVICE_URL", value = "http://core:3000" },
      { name = "DATABASE_SERVICE_URL", value = "http://database:3002" },
      { name = "CORS_ORIGIN", value = var.cors_origin },
      { name = "AGENT_MAX_ROWS", value = "25" },
      { name = "AGENT_MAX_TOOL_ITERATIONS", value = "10" },
      { name = "AGENT_MAX_REQUESTS_PER_DAY", value = "100" },
      { name = "AGENT_RATE_LIMIT_WINDOW_MS", value = "86400000" },
      { name = "AGENT_MAX_HISTORY_MESSAGES", value = "10" },
      { name = "DEFAULT_HISTORY_LIMIT", value = "10" },
      { name = "OPENAI_MODEL", value = "gpt-4o-mini" },
      { name = "OPENAI_BASE_URL", value = "https://api.openai.com/v1/chat/completions" },
    ]

    secrets = [
      { name = "JWT_SECRET", valueFrom = "${aws_secretsmanager_secret.app_secrets.arn}:jwt_secret::" },
      { name = "OPENAI_API_KEY", valueFrom = "${aws_secretsmanager_secret.app_secrets.arn}:openai_api_key::" },
      { name = "INTERNAL_API_KEY", valueFrom = "${aws_secretsmanager_secret.app_secrets.arn}:internal_api_key::" },
    ]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.agent.name
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "agent"
      }
    }

    healthCheck = {
      command     = ["CMD-SHELL", "wget --no-verbose --tries=1 --spider http://localhost:3001/health || exit 1"]
      interval    = 30
      timeout     = 5
      retries     = 3
      startPeriod = 60
    }
  }])

  tags = { Name = "${var.project_name}-${var.environment}-agent-task" }
}

resource "aws_ecs_task_definition" "database" {
  family                   = "${var.project_name}-${var.environment}-database"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.ecs_task_cpu
  memory                   = var.ecs_task_memory
  execution_role_arn       = aws_iam_role.ecs_task_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([{
    name      = "database"
    image     = "${aws_ecr_repository.database.repository_url}:${var.database_image_tag}"
    essential = true

    portMappings = [{ containerPort = 3002, hostPort = 3002, protocol = "tcp", name = "database" }]

    environment = [
      { name = "NODE_ENV", value = "production" },
      { name = "PORT", value = "3002" },
      { name = "DATABASE_URL", value = "postgresql://${var.db_master_username}:${var.db_master_password}@${aws_db_instance.postgres.address}:${aws_db_instance.postgres.port}/nl2sql?schema=public" },
      { name = "REDIS_URL", value = "redis://${aws_elasticache_cluster.redis.cache_nodes[0].address}:${aws_elasticache_cluster.redis.port}" },
      { name = "MAX_MESSAGES_PER_CONVERSATION", value = "200" },
      { name = "DEFAULT_HISTORY_LIMIT", value = "10" },
      { name = "REDIS_RETRY_STEP_MS", value = "200" },
      { name = "REDIS_RETRY_MAX_MS", value = "5000" },
    ]

    secrets = [
      { name = "INTERNAL_API_KEY", valueFrom = "${aws_secretsmanager_secret.app_secrets.arn}:internal_api_key::" },
    ]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.database.name
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "database"
      }
    }

    healthCheck = {
      command     = ["CMD-SHELL", "wget --no-verbose --tries=1 --spider http://localhost:3002/health || exit 1"]
      interval    = 30
      timeout     = 5
      retries     = 3
      startPeriod = 60
    }
  }])

  tags = { Name = "${var.project_name}-${var.environment}-database-task" }
}

# --------------------------------------------------------------------------
# ECS Services (with Service Connect)
# --------------------------------------------------------------------------

resource "aws_ecs_service" "core" {
  name            = "${var.project_name}-${var.environment}-core"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.core.arn
  desired_count   = var.ecs_desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = aws_subnet.public[*].id
    security_groups  = [aws_security_group.core.id]
    assign_public_ip = true
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.core.arn
    container_name   = "core"
    container_port   = 3000
  }

  service_connect_configuration {
    enabled   = true
    namespace = aws_service_discovery_http_namespace.main.arn

    service {
      port_name      = "core"
      discovery_name = "core"
      client_alias {
        port     = 3000
        dns_name = "core"
      }
    }
  }

  deployment_maximum_percent         = 200
  deployment_minimum_healthy_percent = 100
  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  lifecycle { ignore_changes = [desired_count, task_definition] }

  depends_on = [aws_lb_listener.http, aws_iam_role_policy_attachment.ecs_task_execution]

  tags = { Name = "${var.project_name}-${var.environment}-core-service" }
}

resource "aws_ecs_service" "agent" {
  name            = "${var.project_name}-${var.environment}-agent"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.agent.arn
  desired_count   = var.ecs_desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = aws_subnet.public[*].id
    security_groups  = [aws_security_group.agent.id]
    assign_public_ip = true
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.agent.arn
    container_name   = "agent"
    container_port   = 3001
  }

  service_connect_configuration {
    enabled   = true
    namespace = aws_service_discovery_http_namespace.main.arn

    service {
      port_name      = "agent"
      discovery_name = "agent"
      client_alias {
        port     = 3001
        dns_name = "agent"
      }
    }
  }

  deployment_maximum_percent         = 200
  deployment_minimum_healthy_percent = 100
  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  lifecycle { ignore_changes = [desired_count, task_definition] }

  depends_on = [aws_lb_listener.http, aws_iam_role_policy_attachment.ecs_task_execution]

  tags = { Name = "${var.project_name}-${var.environment}-agent-service" }
}

resource "aws_ecs_service" "database" {
  name            = "${var.project_name}-${var.environment}-database"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.database.arn
  desired_count   = var.ecs_desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = aws_subnet.public[*].id
    security_groups  = [aws_security_group.database_svc.id]
    assign_public_ip = true
  }

  # No load_balancer block — database is internal-only

  service_connect_configuration {
    enabled   = true
    namespace = aws_service_discovery_http_namespace.main.arn

    service {
      port_name      = "database"
      discovery_name = "database"
      client_alias {
        port     = 3002
        dns_name = "database"
      }
    }
  }

  deployment_maximum_percent         = 200
  deployment_minimum_healthy_percent = 100
  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  lifecycle { ignore_changes = [desired_count, task_definition] }

  depends_on = [aws_iam_role_policy_attachment.ecs_task_execution]

  tags = { Name = "${var.project_name}-${var.environment}-database-service" }
}
