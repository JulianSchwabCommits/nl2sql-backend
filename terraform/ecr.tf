# ECR Repositories — one per microservice

resource "aws_ecr_repository" "core" {
  name                 = "${var.project_name}-${var.environment}-core"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration { scan_on_push = true }
  encryption_configuration { encryption_type = "AES256" }

  tags = { Name = "${var.project_name}-${var.environment}-core-ecr" }
}

resource "aws_ecr_repository" "agent" {
  name                 = "${var.project_name}-${var.environment}-agent"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration { scan_on_push = true }
  encryption_configuration { encryption_type = "AES256" }

  tags = { Name = "${var.project_name}-${var.environment}-agent-ecr" }
}

resource "aws_ecr_repository" "database" {
  name                 = "${var.project_name}-${var.environment}-database"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration { scan_on_push = true }
  encryption_configuration { encryption_type = "AES256" }

  tags = { Name = "${var.project_name}-${var.environment}-database-ecr" }
}

# Lifecycle policies — keep last 10 images per repo

resource "aws_ecr_lifecycle_policy" "core" {
  repository = aws_ecr_repository.core.name

  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep last 10 images"
      selection    = { tagStatus = "any", countType = "imageCountMoreThan", countNumber = 10 }
      action       = { type = "expire" }
    }]
  })
}

resource "aws_ecr_lifecycle_policy" "agent" {
  repository = aws_ecr_repository.agent.name

  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep last 10 images"
      selection    = { tagStatus = "any", countType = "imageCountMoreThan", countNumber = 10 }
      action       = { type = "expire" }
    }]
  })
}

resource "aws_ecr_lifecycle_policy" "database" {
  repository = aws_ecr_repository.database.name

  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep last 10 images"
      selection    = { tagStatus = "any", countType = "imageCountMoreThan", countNumber = 10 }
      action       = { type = "expire" }
    }]
  })
}
