#!/usr/bin/env bash
# =============================================================================
# No-Backdoor System — One-Command Setup Script
# =============================================================================
# Usage: ./scripts/setup.sh
# 
# This script:
#   1. Verifies Docker and Docker Compose are installed
#   2. Creates .env from .env.example if it doesn't exist
#   3. Creates required directories (uploads, logs)
#   4. Builds all Docker images
#   5. Starts all services
#   6. Waits for healthchecks to pass
#   7. Displays service status
# =============================================================================

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# ---------------------------------------------------------------------------
# Helper Functions
# ---------------------------------------------------------------------------
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[OK]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_banner() {
    echo -e "${BLUE}"
    echo "╔══════════════════════════════════════════════════════════════════╗"
    echo "║           No-Backdoor System — Infrastructure Setup             ║"
    echo "╚══════════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

# ---------------------------------------------------------------------------
# Step 1: Check Prerequisites
# ---------------------------------------------------------------------------
check_prerequisites() {
    log_info "Checking prerequisites..."

    # Check Docker
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed. Please install Docker first."
        echo "   Visit: https://docs.docker.com/get-docker/"
        exit 1
    fi
    DOCKER_VERSION=$(docker --version | awk '{print $3}' | sed 's/,//')
    log_success "Docker found: v$DOCKER_VERSION"

    # Check Docker Compose
    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null 2>&1; then
        log_error "Docker Compose is not installed. Please install Docker Compose first."
        echo "   Visit: https://docs.docker.com/compose/install/"
        exit 1
    fi
    
    if docker compose version &> /dev/null 2>&1; then
        COMPOSE_CMD="docker compose"
        COMPOSE_VERSION=$(docker compose version --short)
    else
        COMPOSE_CMD="docker-compose"
        COMPOSE_VERSION=$(docker-compose --version | awk '{print $4}')
    fi
    log_success "Docker Compose found: v$COMPOSE_VERSION"

    # Check if Docker daemon is running
    if ! docker info &> /dev/null; then
        log_error "Docker daemon is not running. Please start Docker."
        exit 1
    fi
    log_success "Docker daemon is running"
}

# ---------------------------------------------------------------------------
# Step 2: Create Environment File
# ---------------------------------------------------------------------------
setup_environment() {
    log_info "Setting up environment..."

    cd "$PROJECT_DIR"

    if [[ -f .env ]]; then
        log_warn ".env file already exists. Keeping existing configuration."
        read -p "   Do you want to overwrite it with .env.example? (y/N): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            cp .env.example .env
            log_success ".env file overwritten from .env.example"
        else
            log_info "Keeping existing .env file"
        fi
    else
        cp .env.example .env
        log_success ".env file created from .env.example"
        log_warn "IMPORTANT: Please review and update values in .env before production use!"
    fi
}

# ---------------------------------------------------------------------------
# Step 3: Create Required Directories
# ---------------------------------------------------------------------------
create_directories() {
    log_info "Creating required directories..."

    mkdir -p "$PROJECT_DIR/uploads"
    mkdir -p "$PROJECT_DIR/logs"
    mkdir -p "$PROJECT_DIR/backups"

    log_success "Directories created:"
    log_success "  - uploads/"
    log_success "  - logs/"
    log_success "  - backups/"
}

# ---------------------------------------------------------------------------
# Step 4: Build Docker Images
# ---------------------------------------------------------------------------
build_images() {
    log_info "Building Docker images..."

    cd "$PROJECT_DIR"
    $COMPOSE_CMD build --no-cache

    log_success "All images built successfully"
}

# ---------------------------------------------------------------------------
# Step 5: Start Services
# ---------------------------------------------------------------------------
start_services() {
    log_info "Starting services..."

    cd "$PROJECT_DIR"
    $COMPOSE_CMD up -d

    log_success "Services started"
}

# ---------------------------------------------------------------------------
# Step 6: Wait for Healthchecks
# ---------------------------------------------------------------------------
wait_for_healthchecks() {
    log_info "Waiting for services to be healthy..."

    local services=("nb-postgres" "nb-redis" "nb-backend" "nb-nginx")
    local max_attempts=30
    local attempt=0

    for service in "${services[@]}"; do
        attempt=0
        echo -n "  Waiting for $service..."
        
        while [[ $attempt -lt $max_attempts ]]; do
            if docker inspect --format='{{.State.Health.Status}}' "$service" 2>/dev/null | grep -q "healthy"; then
                echo -e " ${GREEN}healthy${NC}"
                break
            fi
            
            attempt=$((attempt + 1))
            if [[ $attempt -eq $max_attempts ]]; then
                echo -e " ${RED}timeout${NC}"
                log_error "Service $service did not become healthy within timeout"
                show_logs
                exit 1
            fi
            
            echo -n "."
            sleep 5
        done
    done

    log_success "All services are healthy!"
}

# ---------------------------------------------------------------------------
# Step 7: Show Status
# ---------------------------------------------------------------------------
show_status() {
    echo ""
    echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}  Setup Complete — No-Backdoor System is Running!${NC}"
    echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
    echo ""
    echo -e "  ${BLUE}Services:${NC}"
    $COMPOSE_CMD ps
    echo ""
    echo -e "  ${BLUE}Access Points:${NC}"
    echo -e "    Frontend (Nginx):  http://localhost"
    echo -e "    API Endpoint:      http://localhost/api"
    echo -e "    Health Check:      http://localhost/health"
    echo ""
    echo -e "  ${BLUE}Useful Commands:${NC}"
    echo -e "    View logs:         ${YELLOW}$COMPOSE_CMD logs -f${NC}"
    echo -e "    Stop services:     ${YELLOW}$COMPOSE_CMD down${NC}"
    echo -e "    Restart:           ${YELLOW}$COMPOSE_CMD restart${NC}"
    echo -e "    Backup database:   ${YELLOW}./scripts/backup.sh${NC}"
    echo ""
    echo -e "  ${BLUE}Data Volumes:${NC}"
    echo -e "    Uploads:           ./uploads/"
    echo -e "    Logs:              ./logs/"
    echo -e "    Backups:           ./backups/"
    echo ""
    echo -e "${YELLOW}  NOTE: Remember to change default passwords in .env for production!${NC}"
    echo ""
}

show_logs() {
    log_info "Showing recent logs..."
    cd "$PROJECT_DIR"
    $COMPOSE_CMD logs --tail=50
}

# ---------------------------------------------------------------------------
# Main Execution
# ---------------------------------------------------------------------------
main() {
    print_banner
    check_prerequisites
    setup_environment
    create_directories
    build_images
    start_services
    wait_for_healthchecks
    show_status
}

# Run main function
main "$@"
