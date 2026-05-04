#!/bin/bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "=== Transferring deploy tarball to VPS ==="
scp -o StrictHostKeyChecking=no -o ConnectTimeout=10 no-backdoor-deploy.tar.gz root@92.205.13.231:/opt/no-backdoor-deploy.tar.gz

echo "=== Extracting on VPS ==="
ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 root@92.205.13.231 "mkdir -p /opt/no-backdoor && cd /opt/no-backdoor && tar xzf /opt/no-backdoor-deploy.tar.gz && rm /opt/no-backdoor-deploy.tar.gz"

echo "=== Starting Docker services ==="
ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 root@92.205.13.231 "cd /opt/no-backdoor/backend/infra && docker compose up -d --build"

echo "=== Checking container status ==="
ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 root@92.205.13.231 "cd /opt/no-backdoor/backend/infra && docker compose ps"

echo "=== Deployment complete ==="
