#!/usr/bin/env bash
# =============================================================================
# No-Backdoor System — Database Backup Script
# =============================================================================
# Usage: ./scripts/backup.sh
#
# This script:
#   1. Dumps the PostgreSQL database to a timestamped SQL file
#   2. Compresses the dump with gzip
#   3. Removes backups older than 7 days
#   4. Outputs the backup file path
#
# Can be run manually or via cron for scheduled backups.
# =============================================================================

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Configuration
BACKUP_DIR="$PROJECT_DIR/backups"
CONTAINER_NAME="nb-postgres"
RETENTION_DAYS=7

# Load environment variables
if [[ -f "$PROJECT_DIR/.env" ]]; then
    # shellcheck source=/dev/null
    source "$PROJECT_DIR/.env"
fi

DB_NAME="${DB_NAME:-nobackdoor}"
DB_USER="${DB_USER:-nbadmin}"

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

# ---------------------------------------------------------------------------
# Backup Functions
# ---------------------------------------------------------------------------
ensure_backup_dir() {
    mkdir -p "$BACKUP_DIR"
}

check_container() {
    if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
        log_error "PostgreSQL container '$CONTAINER_NAME' is not running!"
        log_info "Start services first with: docker compose up -d"
        exit 1
    fi
}

create_backup() {
    local timestamp
    timestamp=$(date +%Y%m%d_%H%M%S)
    local filename="backup_${DB_NAME}_${timestamp}.sql"
    local filepath="$BACKUP_DIR/$filename"
    local compressed="${filepath}.gz"

    log_info "Starting database backup..."
    log_info "  Database: $DB_NAME"
    log_info "  User:     $DB_USER"
    log_info "  Target:   $compressed"

    # Create the dump
    if ! docker exec "$CONTAINER_NAME" pg_dump \
        -U "$DB_USER" \
        -d "$DB_NAME" \
        --no-owner \
        --no-privileges \
        --clean \
        --if-exists \
        > "$filepath" 2>/dev/null; then
        log_error "Database dump failed!"
        rm -f "$filepath"
        exit 1
    fi

    # Compress the dump
    gzip -f "$filepath"

    # Get file size
    local size
    size=$(du -h "$compressed" | cut -f1)

    log_success "Backup completed successfully!"
    log_success "  File: $compressed"
    log_success "  Size: $size"
}

cleanup_old_backups() {
    log_info "Cleaning up backups older than $RETENTION_DAYS days..."

    local deleted=0
    while IFS= read -r -d '' file; do
        rm -f "$file"
        deleted=$((deleted + 1))
    done < <(find "$BACKUP_DIR" -name "backup_${DB_NAME}_*.sql.gz" -mtime +$RETENTION_DAYS -print0 2>/dev/null)

    if [[ $deleted -gt 0 ]]; then
        log_success "Removed $deleted old backup(s)"
    else
        log_info "No old backups to remove"
    fi
}

show_backup_status() {
    local count
    count=$(find "$BACKUP_DIR" -name "backup_${DB_NAME}_*.sql.gz" -type f | wc -l)
    local total_size
    total_size=$(du -sh "$BACKUP_DIR" 2>/dev/null | cut -f1)

    echo ""
    log_info "Backup storage status:"
    log_info "  Total backups: $count"
    log_info "  Total size:    $total_size"
    log_info "  Location:      $BACKUP_DIR"
    echo ""
    log_info "Recent backups:"
    ls -lht "$BACKUP_DIR"/backup_${DB_NAME}_*.sql.gz 2>/dev/null | head -5 || true
}

# ---------------------------------------------------------------------------
# Main Execution
# ---------------------------------------------------------------------------
main() {
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}  No-Backdoor System — Database Backup${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
    echo ""

    ensure_backup_dir
    check_container
    create_backup
    cleanup_old_backups
    show_backup_status
}

# Run main function
main "$@"
