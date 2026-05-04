# =============================================================================
# No-Backdoor System — Makefile
# =============================================================================
# Common commands for managing the Docker infrastructure.
# Usage: make <command>
# =============================================================================

# Colors for output
BLUE := \033[0;34m
GREEN := \033[0;32m
YELLOW := \033[1;33m
RED := \033[0;31m
NC := \033[0m

# Docker Compose command (supports both v1 and v2)
COMPOSE := $(shell if command -v docker-compose >/dev/null 2>&1; then echo "docker-compose"; else echo "docker compose"; fi)

# Project name
PROJECT := no-backdoor

.PHONY: help setup dev build up down logs ps backup restore reset clean shell-%

# Default target
.DEFAULT_GOAL := help

# ---------------------------------------------------------------------------
# Help
# ---------------------------------------------------------------------------
help: ## Show this help message
	@echo ""
	@echo -e "$(BLUE)═══════════════════════════════════════════════════════════════$(NC)"
	@echo -e "$(BLUE)  No-Backdoor System — Available Commands$(NC)"
	@echo -e "$(BLUE)═══════════════════════════════════════════════════════════════$(NC)"
	@echo ""
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  $(GREEN)%-15s$(NC) %s\n", $$1, $$2}' $(MAKEFILE_LIST)
	@echo ""

# ---------------------------------------------------------------------------
# Setup & Initialization
# ---------------------------------------------------------------------------
setup: ## Initial setup — creates .env, directories, builds and starts all services
	@echo -e "$(BLUE)[INFO]$(NC) Running initial setup..."
	@./scripts/setup.sh

dev: ## Start in development mode with hot-reload
	@echo -e "$(BLUE)[INFO]$(NC) Starting in development mode..."
	@$(COMPOSE) -f docker-compose.yml -f docker-compose.dev.yml up -d

# ---------------------------------------------------------------------------
# Build & Deploy
# ---------------------------------------------------------------------------
build: ## Build all Docker images
	@echo -e "$(BLUE)[INFO]$(NC) Building Docker images..."
	@$(COMPOSE) build
	@echo -e "$(GREEN)[OK]$(NC) All images built successfully"

build-no-cache: ## Build all Docker images without cache
	@echo -e "$(BLUE)[INFO]$(NC) Building Docker images (no cache)..."
	@$(COMPOSE) build --no-cache
	@echo -e "$(GREEN)[OK]$(NC) All images built successfully"

up: ## Start all services
	@echo -e "$(BLUE)[INFO]$(NC) Starting services..."
	@$(COMPOSE) up -d
	@echo -e "$(GREEN)[OK]$(NC) Services started"
	@$(MAKE) ps

down: ## Stop all services
	@echo -e "$(BLUE)[INFO]$(NC) Stopping services..."
	@$(COMPOSE) down
	@echo -e "$(GREEN)[OK]$(NC) Services stopped"

restart: ## Restart all services
	@echo -e "$(BLUE)[INFO]$(NC) Restarting services..."
	@$(COMPOSE) restart
	@echo -e "$(GREEN)[OK]$(NC) Services restarted"

# ---------------------------------------------------------------------------
# Monitoring & Logs
# ---------------------------------------------------------------------------
logs: ## View logs from all services
	@$(COMPOSE) logs -f

logs-%: ## View logs for a specific service (e.g., make logs-backend)
	@$(COMPOSE) logs -f $*

ps: ## Show running services status
	@echo -e "$(BLUE)[INFO]$(NC) Service status:"
	@$(COMPOSE) ps

# ---------------------------------------------------------------------------
# Database Operations
# ---------------------------------------------------------------------------
backup: ## Backup the PostgreSQL database
	@echo -e "$(BLUE)[INFO]$(NC) Running database backup..."
	@./scripts/backup.sh

restore: ## Restore database from latest backup (interactive)
	@echo -e "$(YELLOW)[WARN]$(NC) This will overwrite the current database!"
	@read -p "Are you sure? (yes/no): " confirm && [ "$$confirm" = "yes" ] || exit 1
	@echo -e "$(BLUE)[INFO]$(NC) Restoring from latest backup..."
	@LATEST_BACKUP=$$(ls -t backups/backup_*.sql.gz 2>/dev/null | head -1) && \
	if [ -z "$$LATEST_BACKUP" ]; then \
		echo -e "$(RED)[ERROR]$(NC) No backup files found"; \
		exit 1; \
	fi && \
	echo -e "$(BLUE)[INFO]$(NC) Restoring from: $$LATEST_BACKUP" && \
	gunzip -c "$$LATEST_BACKUP" | docker exec -i nb-postgres psql -U nbadmin -d nobackdoor && \
	echo -e "$(GREEN)[OK]$(NC) Database restored successfully"

migrate: ## Run database migrations
	@echo -e "$(BLUE)[INFO]$(NC) Running database migrations..."
	@docker exec -it nb-backend npm run migrate

migrate-rollback: ## Rollback last database migration
	@echo -e "$(YELLOW)[WARN]$(NC) Rolling back last migration..."
	@docker exec -it nb-backend npm run migrate:rollback

# ---------------------------------------------------------------------------
# Maintenance
# ---------------------------------------------------------------------------
update: ## Pull latest images and restart services
	@echo -e "$(BLUE)[INFO]$(NC) Updating services..."
	@$(COMPOSE) pull
	@$(COMPOSE) up -d --force-recreate
	@echo -e "$(GREEN)[OK]$(NC) Services updated"

prune: ## Clean up unused Docker resources
	@echo -e "$(BLUE)[INFO]$(NC) Cleaning up unused Docker resources..."
	@docker system prune -f
	@echo -e "$(GREEN)[OK]$(NC) Cleanup complete"

reset: ## ⚠️  Reset everything — removes volumes, containers, and data
	@echo -e "$(RED)═══════════════════════════════════════════════════════════════$(NC)"
	@echo -e "$(RED)  DANGER: This will delete all data including databases!$(NC)"
	@echo -e "$(RED)═══════════════════════════════════════════════════════════════$(NC)"
	@read -p "Type 'destroy' to confirm: " confirm && [ "$$confirm" = "destroy" ] || exit 1
	@echo -e "$(BLUE)[INFO]$(NC) Stopping and removing containers..."
	@$(COMPOSE) down -v --remove-orphans
	@echo -e "$(BLUE)[INFO]$(NC) Removing local data directories..."
	@rm -rf uploads/* logs/* backups/*
	@echo -e "$(GREEN)[OK]$(NC) All data has been reset"

clean: ## Remove stopped containers, unused networks and images
	@echo -e "$(BLUE)[INFO]$(NC) Cleaning up..."
	@$(COMPOSE) down --remove-orphans
	@docker system prune -f
	@echo -e "$(GREEN)[OK]$(NC) Cleanup complete"

# ---------------------------------------------------------------------------
# Shell Access
# ---------------------------------------------------------------------------
shell-%: ## Open shell in a service container (e.g., make shell-backend)
	@echo -e "$(BLUE)[INFO]$(NC) Opening shell in $*..."
	@docker exec -it nb-$* sh

# ---------------------------------------------------------------------------
# Health Checks
# ---------------------------------------------------------------------------
health: ## Check health status of all services
	@echo -e "$(BLUE)[INFO]$(NC) Checking service health..."
	@for service in nb-postgres nb-redis nb-backend nb-nginx; do \
		status=$$(docker inspect --format='{{.State.Health.Status}}' $$service 2>/dev/null || echo "not found"); \
		if [ "$$status" = "healthy" ]; then \
			echo -e "  $(GREEN)✓$$service$(NC) — $$status"; \
		elif [ "$$status" = "not found" ]; then \
			echo -e "  $(RED)✗ $$service$(NC) — container not running"; \
		else \
			echo -e "  $(YELLOW)! $$service$(NC) — $$status"; \
		fi; \
	done

test: ## Run backend tests
	@echo -e "$(BLUE)[INFO]$(NC) Running tests..."
	@docker exec -it nb-backend npm test
