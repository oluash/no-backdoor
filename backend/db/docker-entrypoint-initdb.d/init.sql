-- =============================================================================
-- No-Backdoor System Architecture — Docker Auto-Initialization
-- =============================================================================
-- This script runs automatically when the PostgreSQL container starts for
-- the first time. It creates the full schema and populates seed data.
--
-- Usage in docker-compose.yml:
--   volumes:
--     - ./docker-entrypoint-initdb.d:/docker-entrypoint-initdb.d
-- =============================================================================

-- =============================================================================
-- PART 1: SCHEMA
-- =============================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Enum Types
DO $$ BEGIN CREATE TYPE user_role AS ENUM ('admin', 'reviewer', 'viewer');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE system_type AS ENUM ('api', 'web', 'mobile', 'database', 'infrastructure', 'library', 'other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE system_status AS ENUM ('verified', 'pending', 'threat', 'unknown');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE evidence_type AS ENUM ('code_scan', 'audit_report', 'penetration_test', 'config_review', 'dependency_check', 'static_analysis', 'dynamic_analysis');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE evidence_status AS ENUM ('pending', 'processing', 'verified', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE evidence_priority AS ENUM ('low', 'medium', 'high');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE history_event_type AS ENUM ('scan_initiated', 'scan_completed', 'review_started', 'review_completed', 'threat_detected', 'resolved');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE task_type AS ENUM ('code_scan', 'audit_report', 'penetration_test', 'config_review', 'dependency_check', 'static_analysis', 'dynamic_analysis');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE task_priority AS ENUM ('low', 'normal', 'high', 'critical');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE task_status AS ENUM ('pending', 'processing', 'completed', 'failed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE log_level AS ENUM ('info', 'warn', 'error', 'success');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 1. users
CREATE TABLE IF NOT EXISTS users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email           VARCHAR(255) NOT NULL UNIQUE,
    password_hash   TEXT NOT NULL,
    first_name      VARCHAR(100) NOT NULL,
    last_name       VARCHAR(100) NOT NULL,
    role            user_role NOT NULL DEFAULT 'viewer',
    avatar_url      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login      TIMESTAMPTZ,
    CONSTRAINT users_email_format CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

-- 2. systems
CREATE TABLE IF NOT EXISTS systems (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name                VARCHAR(255) NOT NULL,
    version             VARCHAR(50),
    description         TEXT,
    type                system_type NOT NULL DEFAULT 'other',
    status              system_status NOT NULL DEFAULT 'unknown',
    verification_score  SMALLINT NOT NULL DEFAULT 0,
    tags                TEXT[] DEFAULT '{}',
    created_by          UUID REFERENCES users(id) ON DELETE SET NULL,
    assigned_to         UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT systems_verification_score_range CHECK (verification_score >= 0 AND verification_score <= 100)
);

-- 3. evidence_uploads
CREATE TABLE IF NOT EXISTS evidence_uploads (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    system_id       UUID NOT NULL REFERENCES systems(id) ON DELETE CASCADE,
    uploaded_by     UUID REFERENCES users(id) ON DELETE SET NULL,
    filename        VARCHAR(500) NOT NULL,
    original_name   VARCHAR(500) NOT NULL,
    file_path       TEXT NOT NULL,
    file_size       BIGINT NOT NULL DEFAULT 0,
    mime_type       VARCHAR(255),
    evidence_type   evidence_type NOT NULL,
    description     TEXT,
    priority        evidence_priority NOT NULL DEFAULT 'medium',
    tags            TEXT[] DEFAULT '{}',
    status          evidence_status NOT NULL DEFAULT 'pending',
    checksum        VARCHAR(64),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at    TIMESTAMPTZ,
    CONSTRAINT evidence_uploads_checksum_format CHECK (checksum IS NULL OR checksum ~ '^[A-Fa-f0-9]{64}$'),
    CONSTRAINT evidence_uploads_file_size_positive CHECK (file_size >= 0)
);

-- 4. verification_history
CREATE TABLE IF NOT EXISTS verification_history (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    system_id       UUID NOT NULL REFERENCES systems(id) ON DELETE CASCADE,
    event_type      history_event_type NOT NULL,
    description     TEXT,
    performed_by    UUID REFERENCES users(id) ON DELETE SET NULL,
    metadata        JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. verification_tasks
CREATE TABLE IF NOT EXISTS verification_tasks (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id                 VARCHAR(20) NOT NULL UNIQUE,
    system_id               UUID NOT NULL REFERENCES systems(id) ON DELETE CASCADE,
    task_type               task_type NOT NULL,
    priority                task_priority NOT NULL DEFAULT 'normal',
    status                  task_status NOT NULL DEFAULT 'pending',
    progress                SMALLINT NOT NULL DEFAULT 0,
    assigned_to             UUID REFERENCES users(id) ON DELETE SET NULL,
    created_by              UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    started_at              TIMESTAMPTZ,
    completed_at            TIMESTAMPTZ,
    estimated_completion    TIMESTAMPTZ,
    result_summary          TEXT,
    error_message           TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT verification_tasks_task_id_format CHECK (task_id ~ '^VT-[0-9]+$'),
    CONSTRAINT verification_tasks_progress_range CHECK (progress >= 0 AND progress <= 100)
);

-- 6. task_logs
CREATE TABLE IF NOT EXISTS task_logs (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id     UUID NOT NULL REFERENCES verification_tasks(id) ON DELETE CASCADE,
    level       log_level NOT NULL DEFAULT 'info',
    message     TEXT NOT NULL,
    metadata    JSONB DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. activity_log
CREATE TABLE IF NOT EXISTS activity_log (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    actor_id    UUID REFERENCES users(id) ON DELETE SET NULL,
    action_type VARCHAR(100) NOT NULL,
    entity_type VARCHAR(100) NOT NULL,
    entity_id   UUID,
    description TEXT,
    metadata    JSONB DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- INDEXES
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_systems_status ON systems(status);
CREATE INDEX IF NOT EXISTS idx_systems_type ON systems(type);
CREATE INDEX IF NOT EXISTS idx_systems_created_by ON systems(created_by);
CREATE INDEX IF NOT EXISTS idx_systems_assigned_to ON systems(assigned_to);
CREATE INDEX IF NOT EXISTS idx_systems_created_at ON systems(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_systems_tags ON systems USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_systems_name ON systems(name);
CREATE INDEX IF NOT EXISTS idx_systems_verification_score ON systems(verification_score DESC);
CREATE INDEX IF NOT EXISTS idx_evidence_system_id ON evidence_uploads(system_id);
CREATE INDEX IF NOT EXISTS idx_evidence_uploaded_by ON evidence_uploads(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_evidence_status ON evidence_uploads(status);
CREATE INDEX IF NOT EXISTS idx_evidence_type ON evidence_uploads(evidence_type);
CREATE INDEX IF NOT EXISTS idx_evidence_priority ON evidence_uploads(priority);
CREATE INDEX IF NOT EXISTS idx_evidence_created_at ON evidence_uploads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_evidence_tags ON evidence_uploads USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_evidence_checksum ON evidence_uploads(checksum);
CREATE INDEX IF NOT EXISTS idx_vh_system_id ON verification_history(system_id);
CREATE INDEX IF NOT EXISTS idx_vh_event_type ON verification_history(event_type);
CREATE INDEX IF NOT EXISTS idx_vh_created_at ON verification_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vh_performed_by ON verification_history(performed_by);
CREATE INDEX IF NOT EXISTS idx_vt_task_id ON verification_tasks(task_id);
CREATE INDEX IF NOT EXISTS idx_vt_system_id ON verification_tasks(system_id);
CREATE INDEX IF NOT EXISTS idx_vt_status ON verification_tasks(status);
CREATE INDEX IF NOT EXISTS idx_vt_priority ON verification_tasks(priority);
CREATE INDEX IF NOT EXISTS idx_vt_task_type ON verification_tasks(task_type);
CREATE INDEX IF NOT EXISTS idx_vt_assigned_to ON verification_tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_vt_created_at ON verification_tasks(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vt_status_priority ON verification_tasks(status, priority);
CREATE INDEX IF NOT EXISTS idx_vt_started_at ON verification_tasks(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_tl_task_id ON task_logs(task_id);
CREATE INDEX IF NOT EXISTS idx_tl_level ON task_logs(level);
CREATE INDEX IF NOT EXISTS idx_tl_created_at ON task_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_al_actor_id ON activity_log(actor_id);
CREATE INDEX IF NOT EXISTS idx_al_action_type ON activity_log(action_type);
CREATE INDEX IF NOT EXISTS idx_al_entity ON activity_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_al_created_at ON activity_log(created_at DESC);

-- =============================================================================
-- FULL-TEXT SEARCH
-- =============================================================================
DO $$ BEGIN
    ALTER TABLE systems ADD COLUMN search_vector tsvector
        GENERATED ALWAYS AS (
            setweight(to_tsvector('english', COALESCE(name, '')), 'A') ||
            setweight(to_tsvector('english', COALESCE(description, '')), 'B') ||
            setweight(to_tsvector('english', COALESCE(array_to_string(tags, ' '), '')), 'C')
        ) STORED;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS idx_systems_search ON systems USING GIN(search_vector);

-- =============================================================================
-- UPDATED_AT TRIGGERS
-- =============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER trg_systems_updated_at BEFORE UPDATE ON systems FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER trg_evidence_uploads_updated_at BEFORE UPDATE ON evidence_uploads FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER trg_verification_tasks_updated_at BEFORE UPDATE ON verification_tasks FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =============================================================================
-- VIEWS
-- =============================================================================
CREATE OR REPLACE VIEW v_dashboard_metrics AS
SELECT
    (SELECT COUNT(*) FROM systems) AS total_systems,
    (SELECT COUNT(*) FROM systems WHERE status = 'verified') AS verified_count,
    (SELECT COUNT(*) FROM systems WHERE status = 'pending') AS pending_count,
    (SELECT COUNT(*) FROM systems WHERE status = 'threat') AS threat_count,
    (SELECT COUNT(*) FROM systems WHERE status = 'unknown') AS unknown_count,
    (SELECT COUNT(*) FROM evidence_uploads) AS total_evidence,
    (SELECT COUNT(*) FROM verification_tasks WHERE status = 'pending') AS pending_tasks,
    (SELECT COUNT(*) FROM verification_tasks WHERE status = 'processing') AS processing_tasks,
    (SELECT COUNT(*) FROM verification_tasks WHERE status = 'completed') AS completed_tasks,
    (SELECT COUNT(*) FROM verification_tasks WHERE status = 'failed') AS failed_tasks,
    (SELECT COUNT(*) FROM users) AS total_users,
    (SELECT ROUND(AVG(verification_score)::numeric, 1) FROM systems) AS avg_verification_score;

CREATE OR REPLACE VIEW v_system_overview AS
SELECT s.*,
    u1.email AS created_by_email, u1.first_name AS created_by_first_name, u1.last_name AS created_by_last_name,
    u2.email AS assigned_to_email, u2.first_name AS assigned_to_first_name, u2.last_name AS assigned_to_last_name,
    (SELECT COUNT(*) FROM evidence_uploads WHERE system_id = s.id) AS evidence_count,
    (SELECT COUNT(*) FROM verification_tasks WHERE system_id = s.id) AS task_count,
    (SELECT MAX(created_at) FROM verification_history WHERE system_id = s.id) AS last_verified_at
FROM systems s
LEFT JOIN users u1 ON s.created_by = u1.id
LEFT JOIN users u2 ON s.assigned_to = u2.id;

CREATE OR REPLACE VIEW v_task_overview AS
SELECT vt.*,
    s.name AS system_name, s.type AS system_type, s.status AS system_status,
    u1.email AS assigned_to_email, u1.first_name AS assigned_to_first_name, u1.last_name AS assigned_to_last_name,
    u2.email AS created_by_email, u2.first_name AS created_by_first_name, u2.last_name AS created_by_last_name,
    (SELECT COUNT(*) FROM task_logs WHERE task_id = vt.id) AS log_count
FROM verification_tasks vt
LEFT JOIN systems s ON vt.system_id = s.id
LEFT JOIN users u1 ON vt.assigned_to = u1.id
LEFT JOIN users u2 ON vt.created_by = u2.id;

-- =============================================================================
-- PART 2: SEED DATA
-- =============================================================================

-- USERS
INSERT INTO users (id, email, password_hash, first_name, last_name, role, avatar_url, created_at, updated_at, last_login) VALUES
('a7f4c9d2-1e3b-4c5d-9f8a-2b3c4d5e6f7a', 'admin@nobackdoor.dev', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4.VTtYA.qGZvKG6G', 'Alex', 'Chen', 'admin', 'https://api.dicebear.com/7.x/avataaars/svg?seed=Alex', '2024-12-01T08:00:00Z', '2024-12-01T08:00:00Z', '2025-01-15T09:30:00Z'),
('b8e5d0e3-2f4c-5d6e-0a9b-3c4d5e6f7a8b', 'reviewer@nobackdoor.dev', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4.VTtYA.qGZvKG6G', 'Jordan', 'Miller', 'reviewer', 'https://api.dicebear.com/7.x/avataaars/svg?seed=Jordan', '2024-12-05T10:00:00Z', '2024-12-05T10:00:00Z', '2025-01-14T16:45:00Z'),
('c9f6e1f4-3a5d-6e7f-1b0c-4d5e6f7a8b9c', 'viewer@nobackdoor.dev', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4.VTtYA.qGZvKG6G', 'Taylor', 'Patel', 'viewer', 'https://api.dicebear.com/7.x/avataaars/svg?seed=Taylor', '2024-12-10T14:00:00Z', '2024-12-10T14:00:00Z', '2025-01-13T11:20:00Z')
ON CONFLICT (id) DO NOTHING;

-- SYSTEMS
INSERT INTO systems (id, name, version, description, type, status, verification_score, tags, created_by, assigned_to, created_at, updated_at) VALUES
('d0a7f2a5-4b6e-7f80-2c1d-5e6f7a8b9c0d', 'Auth Service API', 'v2.4.1', 'OAuth2/JWT authentication microservice handling user login, token refresh, and session management across all platform services.', 'api', 'verified', 92, ARRAY['auth','microservice','jwt','oauth','critical'], 'a7f4c9d2-1e3b-4c5d-9f8a-2b3c4d5e6f7a', 'b8e5d0e3-2f4c-5d6e-0a9b-3c4d5e6f7a8b', '2024-11-15T09:00:00Z', '2025-01-10T14:30:00Z'),
('e1b8a3b6-5c7f-8091-3d2e-6f7a8b9c0d1e', 'Payment Gateway', 'v1.8.3', 'PCI-DSS compliant payment processing service integrating with Stripe, PayPal, and Square.', 'api', 'verified', 88, ARRAY['payment','pci-dss','financial','critical'], 'a7f4c9d2-1e3b-4c5d-9f8a-2b3c4d5e6f7a', 'b8e5d0e3-2f4c-5d6e-0a9b-3c4d5e6f7a8b', '2024-11-20T11:00:00Z', '2025-01-12T10:15:00Z'),
('f2c9b4c7-6d80-91a2-4e3f-7a8b9c0d1e2f', 'User Dashboard Web App', 'v3.1.0', 'React-based admin dashboard for system monitoring, evidence management, and verification queue oversight.', 'web', 'pending', 67, ARRAY['dashboard','react','frontend','analytics'], 'a7f4c9d2-1e3b-4c5d-9f8a-2b3c4d5e6f7a', 'b8e5d0e3-2f4c-5d6e-0a9b-3c4d5e6f7a8b', '2024-12-01T08:30:00Z', '2025-01-14T16:00:00Z'),
('a3d0c5d8-7e91-a2b3-5f40-8b9c0d1e2f3a', 'iOS Mobile App', 'v2.0.4', 'Native Swift iOS application for field security auditors to capture evidence and perform offline verification.', 'mobile', 'pending', 54, ARRAY['ios','swift','mobile','offline'], 'b8e5d0e3-2f4c-5d6e-0a9b-3c4d5e6f7a8b', 'b8e5d0e3-2f4c-5d6e-0a9b-3c4d5e6f7a8b', '2024-12-05T13:00:00Z', '2025-01-13T09:45:00Z'),
('b4e1d6e9-8fa2-b3c4-6051-9c0d1e2f3a4b', 'PostgreSQL Main DB', 'v15.4', 'Primary production PostgreSQL cluster with streaming replication and automated backups.', 'database', 'threat', 23, ARRAY['database','postgresql','replication','critical'], 'a7f4c9d2-1e3b-4c5d-9f8a-2b3c4d5e6f7a', 'a7f4c9d2-1e3b-4c5d-9f8a-2b3c4d5e6f7a', '2024-10-20T07:00:00Z', '2025-01-15T08:00:00Z'),
('c5f2e7fa-9ab3-c4d5-7162-0d1e2f3a4b5c', 'Kubernetes Cluster', 'v1.28', 'EKS-managed Kubernetes cluster with ArgoCD for GitOps and Falco runtime threat detection.', 'infrastructure', 'pending', 45, ARRAY['k8s','aws','infrastructure','devops'], 'a7f4c9d2-1e3b-4c5d-9f8a-2b3c4d5e6f7a', 'b8e5d0e3-2f4c-5d6e-0a9b-3c4d5e6f7a8b', '2024-10-25T10:00:00Z', '2025-01-14T12:30:00Z'),
('d603f80b-0bc4-d5e6-8273-1e2f3a4b5c6d', 'Crypto Library (libsecure)', 'v4.2.0', 'Internal cryptographic utility library providing AES-256-GCM, Ed25519 signing, and Argon2id key derivation.', 'library', 'verified', 96, ARRAY['crypto','library','aes','security'], 'b8e5d0e3-2f4c-5d6e-0a9b-3c4d5e6f7a8b', 'b8e5d0e3-2f4c-5d6e-0a9b-3c4d5e6f7a8b', '2024-09-15T06:00:00Z', '2025-01-08T15:00:00Z'),
('e714091c-1cd5-e6f7-9384-2f3a4b5c6d7e', 'Notification Service', 'v1.3.2', 'Event-driven notification dispatcher handling email, SMS, Slack, and webhook delivery via RabbitMQ.', 'api', 'unknown', 0, ARRAY['notifications','rabbitmq','events','microservice'], 'a7f4c9d2-1e3b-4c5d-9f8a-2b3c4d5e6f7a', NULL, '2025-01-05T09:00:00Z', '2025-01-05T09:00:00Z'),
('f8251a2d-2de6-f708-a495-3a4b5c6d7e8f', 'Android Mobile App', 'v1.9.1', 'Kotlin Android application with Material Design 3 UI, biometric authentication, and local evidence caching.', 'mobile', 'pending', 61, ARRAY['android','kotlin','mobile','material-design'], 'b8e5d0e3-2f4c-5d6e-0a9b-3c4d5e6f7a8b', 'c9f6e1f4-3a5d-6e7f-1b0c-4d5e6f7a8b9c', '2024-12-10T11:00:00Z', '2025-01-13T14:20:00Z'),
('a9362b3e-3ef7-0819-b5a6-4b5c6d7e8f90', 'Redis Cache Layer', 'v7.2', 'Clustered Redis deployment for session storage, rate limiting, and real-time analytics aggregation.', 'infrastructure', 'verified', 85, ARRAY['redis','cache','infrastructure','performance'], 'a7f4c9d2-1e3b-4c5d-9f8a-2b3c4d5e6f7a', 'b8e5d0e3-2f4c-5d6e-0a9b-3c4d5e6f7a8b', '2024-11-01T08:00:00Z', '2025-01-11T10:00:00Z'),
('ba473c4f-4f08-192a-c6b7-5c6d7e8f901a', 'Elasticsearch Cluster', 'v8.11', 'Search and analytics engine with three-node cluster and snapshot backups.', 'infrastructure', 'threat', 31, ARRAY['elasticsearch','search','analytics','logging'], 'a7f4c9d2-1e3b-4c5d-9f8a-2b3c4d5e6f7a', 'a7f4c9d2-1e3b-4c5d-9f8a-2b3c4d5e6f7a', '2024-10-10T07:00:00Z', '2025-01-15T07:30:00Z'),
('cb584d50-5f19-2a3b-d7c8-6d7e8f901a2b', 'Config Management Service', 'v2.1.0', 'Centralized configuration using HashiCorp Vault with environment-specific config versioning.', 'api', 'pending', 72, ARRAY['config','vault','secrets','microservice'], 'b8e5d0e3-2f4c-5d6e-0a9b-3c4d5e6f7a8b', 'c9f6e1f4-3a5d-6e7f-1b0c-4d5e6f7a8b9c', '2024-12-15T10:00:00Z', '2025-01-12T11:00:00Z')
ON CONFLICT (id) DO NOTHING;

-- EVIDENCE UPLOADS
INSERT INTO evidence_uploads (id, system_id, uploaded_by, filename, original_name, file_path, file_size, mime_type, evidence_type, description, priority, tags, status, checksum, created_at, updated_at, processed_at) VALUES
('f1357e9a-6b20-4c8d-af12-3e5f7a9b1c2d', 'd0a7f2a5-4b6e-7f80-2c1d-5e6f7a8b9c0d', 'b8e5d0e3-2f4c-5d6e-0a9b-3c4d5e6f7a8b', 'auth_sonar_report_2025_01.pdf', 'AuthService_SonarQube_Scan_Jan2025.pdf', '/uploads/evidence/auth_sonar_report_2025_01.pdf', 2457800, 'application/pdf', 'static_analysis', 'SonarQube static analysis report for Auth Service v2.4.1.', 'high', ARRAY['sonarqube','static-analysis','auth'], 'verified', 'a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456', '2025-01-08T10:00:00Z', '2025-01-09T14:30:00Z', '2025-01-09T14:30:00Z'),
('e0246d89-5a19-3b7c-9e01-2d4e6f8a0b1c', 'e1b8a3b6-5c7f-8091-3d2e-6f7a8b9c0d1e', 'a7f4c9d2-1e3b-4c5d-9f8a-2b3c4d5e6f7a', 'payment_pen_test_nov2024.pdf', 'PaymentGateway_PenTest_Report_Nov2024.pdf', '/uploads/evidence/payment_pen_test_nov2024.pdf', 8451200, 'application/pdf', 'penetration_test', 'Third-party penetration test report by SecureFirst Consulting.', 'high', ARRAY['penetration-test','payment','pci-dss'], 'verified', 'b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456a1', '2024-11-28T09:00:00Z', '2024-11-30T16:00:00Z', '2024-11-30T16:00:00Z'),
('d9135c78-4908-2a6b-8d00-1c3d5e7f9a0b', 'b4e1d6e9-8fa2-b3c4-6051-9c0d1e2f3a4b', 'a7f4c9d2-1e3b-4c5d-9f8a-2b3c4d5e6f7a', 'postgres_audit_config.yml', 'PostgreSQL_Audit_Configuration_v15.yml', '/uploads/evidence/postgres_audit_config.yml', 15230, 'application/x-yaml', 'config_review', 'PostgreSQL audit logging configuration file.', 'medium', ARRAY['config','postgresql','audit'], 'failed', 'c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456a1b2', '2025-01-12T11:00:00Z', '2025-01-12T11:30:00Z', '2025-01-12T11:30:00Z'),
('c8024b67-3807-195a-7c00-0b2c4d6e8f9a', 'c5f2e7fa-9ab3-c4d5-7162-0d1e2f3a4b5c', 'b8e5d0e3-2f4c-5d6e-0a9b-3c4d5e6f7a8b', 'k8s_nsa_hardening_manifest.yaml', 'Kubernetes_NSA_Hardening_Manifest.yaml', '/uploads/evidence/k8s_nsa_hardening_manifest.yaml', 45120, 'text/yaml', 'config_review', 'NSA/CISA Kubernetes hardening guide compliance manifest.', 'high', ARRAY['k8s','hardening','nsa'], 'processing', 'd4e5f6789012345678901234567890abcdef1234567890abcdef123456a1b2c3', '2025-01-14T08:00:00Z', '2025-01-14T08:00:00Z', '2025-01-14T08:15:00Z'),
('b7013a56-2706-0849-6b00-890a2b4c6d7e', 'd603f80b-0bc4-d5e6-8273-1e2f3a4b5c6d', 'b8e5d0e3-2f4c-5d6e-0a9b-3c4d5e6f7a8b', 'libsecure_dependency_check.xml', 'libsecure_OWASP_Dependency_Check.xml', '/uploads/evidence/libsecure_dependency_check.xml', 1893400, 'application/xml', 'dependency_check', 'OWASP Dependency-Check XML report for libsecure v4.2.0.', 'medium', ARRAY['dependency-check','owasp','library'], 'verified', 'e5f6789012345678901234567890abcdef1234567890abcdef123456a1b2c3d4', '2025-01-06T10:00:00Z', '2025-01-07T09:00:00Z', '2025-01-07T09:00:00Z'),
('a6902956-1605-9738-5a00-890a2b4c6d7e', 'ba473c4f-4f08-192a-c6b7-5c6d7e8f901a', 'a7f4c9d2-1e3b-4c5d-9f8a-2b3c4d5e6f7a', 'elasticsearch_threat_alert.json', 'ES_Cluster_Threat_Detection_Alert.json', '/uploads/evidence/elasticsearch_threat_alert.json', 28500, 'application/json', 'dynamic_analysis', 'Dynamic analysis alert from Falco showing unauthorized access attempts.', 'high', ARRAY['threat','elasticsearch','falco'], 'processing', 'f6789012345678901234567890abcdef1234567890abcdef123456a1b2c3d4e5', '2025-01-15T07:00:00Z', '2025-01-15T07:00:00Z', '2025-01-15T07:15:00Z')
ON CONFLICT (id) DO NOTHING;

-- VERIFICATION TASKS (38 tasks: 8 pending, 4 processing, 14 completed, 12 failed)
INSERT INTO verification_tasks (id, task_id, system_id, task_type, priority, status, progress, assigned_to, created_by, started_at, completed_at, estimated_completion, result_summary, error_message, created_at, updated_at) VALUES
('10000001-0000-0000-0000-000000000001', 'VT-10001', 'f2c9b4c7-6d80-91a2-4e3f-7a8b9c0d1e2f', 'static_analysis', 'high', 'pending', 0, 'b8e5d0e3-2f4c-5d6e-0a9b-3c4d5e6f7a8b', 'a7f4c9d2-1e3b-4c5d-9f8a-2b3c4d5e6f7a', NULL, NULL, '2025-01-20T18:00:00Z', NULL, NULL, '2025-01-15T08:00:00Z', '2025-01-15T08:00:00Z'),
('10000002-0000-0000-0000-000000000002', 'VT-10002', 'a3d0c5d8-7e91-a2b3-5f40-8b9c0d1e2f3a', 'penetration_test', 'critical', 'pending', 0, 'b8e5d0e3-2f4c-5d6e-0a9b-3c4d5e6f7a8b', 'a7f4c9d2-1e3b-4c5d-9f8a-2b3c4d5e6f7a', NULL, NULL, '2025-01-22T12:00:00Z', NULL, NULL, '2025-01-15T09:00:00Z', '2025-01-15T09:00:00Z'),
('10000003-0000-0000-0000-000000000003', 'VT-10003', 'f8251a2d-2de6-f708-a495-3a4b5c6d7e8f', 'static_analysis', 'normal', 'pending', 0, 'c9f6e1f4-3a5d-6e7f-1b0c-4d5e6f7a8b9c', 'b8e5d0e3-2f4c-5d6e-0a9b-3c4d5e6f7a8b', NULL, NULL, '2025-01-21T15:00:00Z', NULL, NULL, '2025-01-14T16:00:00Z', '2025-01-14T16:00:00Z'),
('10000004-0000-0000-0000-000000000004', 'VT-10004', 'cb584d50-5f19-2a3b-d7c8-6d7e8f901a2b', 'config_review', 'high', 'pending', 0, 'b8e5d0e3-2f4c-5d6e-0a9b-3c4d5e6f7a8b', 'a7f4c9d2-1e3b-4c5d-9f8a-2b3c4d5e6f7a', NULL, NULL, '2025-01-23T09:00:00Z', NULL, NULL, '2025-01-14T10:00:00Z', '2025-01-14T10:00:00Z'),
('10000005-0000-0000-0000-000000000005', 'VT-10005', 'e714091c-1cd5-e6f7-9384-2f3a4b5c6d7e', 'dynamic_analysis', 'normal', 'pending', 0, NULL, 'a7f4c9d2-1e3b-4c5d-9f8a-2b3c4d5e6f7a', NULL, NULL, '2025-01-25T14:00:00Z', NULL, NULL, '2025-01-13T11:00:00Z', '2025-01-13T11:00:00Z'),
('10000006-0000-0000-0000-000000000006', 'VT-10006', 'a9362b3e-3ef7-0819-b5a6-4b5c6d7e8f90', 'dependency_check', 'low', 'pending', 0, 'c9f6e1f4-3a5d-6e7f-1b0c-4d5e6f7a8b9c', 'b8e5d0e3-2f4c-5d6e-0a9b-3c4d5e6f7a8b', NULL, NULL, '2025-01-24T10:00:00Z', NULL, NULL, '2025-01-13T08:30:00Z', '2025-01-13T08:30:00Z'),
('10000007-0000-0000-0000-000000000007', 'VT-10007', 'f2c9b4c7-6d80-91a2-4e3f-7a8b9c0d1e2f', 'audit_report', 'high', 'pending', 0, 'b8e5d0e3-2f4c-5d6e-0a9b-3c4d5e6f7a8b', 'a7f4c9d2-1e3b-4c5d-9f8a-2b3c4d5e6f7a', NULL, NULL, '2025-01-26T16:00:00Z', NULL, NULL, '2025-01-12T14:00:00Z', '2025-01-12T14:00:00Z'),
('10000008-0000-0000-0000-000000000008', 'VT-10008', 'd0a7f2a5-4b6e-7f80-2c1d-5e6f7a8b9c0d', 'code_scan', 'normal', 'pending', 0, 'c9f6e1f4-3a5d-6e7f-1b0c-4d5e6f7a8b9c', 'b8e5d0e3-2f4c-5d6e-0a9b-3c4d5e6f7a8b', NULL, NULL, '2025-01-21T11:00:00Z', NULL, NULL, '2025-01-11T09:00:00Z', '2025-01-11T09:00:00Z'),
('20000001-0000-0000-0000-000000000001', 'VT-20001', 'c5f2e7fa-9ab3-c4d5-7162-0d1e2f3a4b5c', 'config_review', 'critical', 'processing', 45, 'a7f4c9d2-1e3b-4c5d-9f8a-2b3c4d5e6f7a', '2025-01-14T08:00:00Z', NULL, '2025-01-16T12:00:00Z', 'Validating NSA hardening guidelines...', NULL, '2025-01-14T07:30:00Z', '2025-01-15T10:00:00Z'),
('20000002-0000-0000-0000-000000000002', 'VT-20002', 'ba473c4f-4f08-192a-c6b7-5c6d7e8f901a', 'dynamic_analysis', 'critical', 'processing', 72, 'a7f4c9d2-1e3b-4c5d-9f8a-2b3c4d5e6f7a', '2025-01-15T07:00:00Z', NULL, '2025-01-16T08:00:00Z', 'Investigating unauthorized access patterns...', NULL, '2025-01-15T06:30:00Z', '2025-01-15T09:00:00Z'),
('20000003-0000-0000-0000-000000000003', 'VT-20003', 'c8024b67-3807-195a-7c00-0b2c4d6e8f9a', 'static_analysis', 'high', 'processing', 30, 'b8e5d0e3-2f4c-5d6e-0a9b-3c4d5e6f7a8b', '2025-01-14T08:15:00Z', NULL, '2025-01-17T10:00:00Z', 'Analyzing manifest against CIS benchmarks...', NULL, '2025-01-14T08:00:00Z', '2025-01-14T12:00:00Z'),
('20000004-0000-0000-0000-000000000004', 'VT-20004', 'b4e1d6e9-8fa2-b3c4-6051-9c0d1e2f3a4b', 'audit_report', 'critical', 'processing', 15, 'a7f4c9d2-1e3b-4c5d-9f8a-2b3c4d5e6f7a', '2025-01-15T08:00:00Z', NULL, '2025-01-18T14:00:00Z', 'Compiling PostgreSQL audit findings...', NULL, '2025-01-15T07:00:00Z', '2025-01-15T08:30:00Z'),
('30000001-0000-0000-0000-000000000001', 'VT-30001', 'd0a7f2a5-4b6e-7f80-2c1d-5e6f7a8b9c0d', 'static_analysis', 'high', 'completed', 100, 'b8e5d0e3-2f4c-5d6e-0a9b-3c4d5e6f7a8b', '2024-12-28T09:00:00Z', '2024-12-28T09:00:00Z', '2025-01-08T14:30:00Z', '2025-01-09T10:00:00Z', 'SonarQube scan passed. Zero critical vulnerabilities.', NULL, '2024-12-28T08:00:00Z', '2025-01-09T14:30:00Z'),
('30000002-0000-0000-0000-000000000002', 'VT-30002', 'd0a7f2a5-4b6e-7f80-2c1d-5e6f7a8b9c0d', 'penetration_test', 'critical', 'completed', 100, 'b8e5d0e3-2f4c-5d6e-0a9b-3c4d5e6f7a8b', '2024-12-20T10:00:00Z', '2024-12-20T10:00:00Z', '2025-01-05T16:00:00Z', '2025-01-06T12:00:00Z', 'Penetration test passed. Rate limiting verified.', NULL, '2024-12-20T09:00:00Z', '2025-01-06T16:00:00Z'),
('30000003-0000-0000-0000-000000000003', 'VT-30003', 'e1b8a3b6-5c7f-8091-3d2e-6f7a8b9c0d1e', 'penetration_test', 'critical', 'completed', 100, 'a7f4c9d2-1e3b-4c5d-9f8a-2b3c4d5e6f7a', '2024-11-15T08:00:00Z', '2024-11-15T08:00:00Z', '2024-11-30T14:00:00Z', '2024-12-01T10:00:00Z', 'PCI-DSS test passed. Minor WAF recommendation.', NULL, '2024-11-15T07:00:00Z', '2024-12-01T16:00:00Z'),
('30000004-0000-0000-0000-000000000004', 'VT-30004', 'e1b8a3b6-5c7f-8091-3d2e-6f7a8b9c0d1e', 'dependency_check', 'high', 'completed', 100, 'b8e5d0e3-2f4c-5d6e-0a9b-3c4d5e6f7a8b', '2024-12-10T09:00:00Z', '2024-12-10T09:00:00Z', '2024-12-12T11:00:00Z', '2024-12-13T09:00:00Z', 'Dependency scan clean. No known CVEs.', NULL, '2024-12-10T08:00:00Z', '2024-12-13T12:00:00Z'),
('30000005-0000-0000-0000-000000000005', 'VT-30005', 'd603f80b-0bc4-d5e6-8273-1e2f3a4b5c6d', 'dependency_check', 'high', 'completed', 100, 'b8e5d0e3-2f4c-5d6e-0a9b-3c4d5e6f7a8b', '2025-01-03T10:00:00Z', '2025-01-03T10:00:00Z', '2025-01-07T09:00:00Z', '2025-01-07T14:00:00Z', 'Dependency check passed. One low-priority dev CVE.', NULL, '2025-01-03T09:00:00Z', '2025-01-07T16:00:00Z'),
('30000006-0000-0000-0000-000000000006', 'VT-30006', 'd603f80b-0bc4-d5e6-8273-1e2f3a4b5c6d', 'static_analysis', 'high', 'completed', 100, 'b8e5d0e3-2f4c-5d6e-0a9b-3c4d5e6f7a8b', '2024-12-18T08:00:00Z', '2024-12-18T08:00:00Z', '2025-01-02T15:00:00Z', '2025-01-03T10:00:00Z', 'Coverity scan zero defects. NIST compliant.', NULL, '2024-12-18T07:00:00Z', '2025-01-03T16:00:00Z'),
('30000007-0000-0000-0000-000000000007', 'VT-30007', 'a9362b3e-3ef7-0819-b5a6-4b5c6d7e8f90', 'config_review', 'normal', 'completed', 100, 'b8e5d0e3-2f4c-5d6e-0a9b-3c4d5e6f7a8b', '2025-01-02T09:00:00Z', '2025-01-02T09:00:00Z', '2025-01-10T12:00:00Z', '2025-01-11T08:00:00Z', 'Redis config passed. ACL correct.', NULL, '2025-01-02T08:00:00Z', '2025-01-11T12:00:00Z'),
('30000008-0000-0000-0000-000000000008', 'VT-30008', 'a9362b3e-3ef7-0819-b5a6-4b5c6d7e8f90', 'audit_report', 'normal', 'completed', 100, 'c9f6e1f4-3a5d-6e7f-1b0c-4d5e6f7a8b9c', '2024-12-28T10:00:00Z', '2024-12-28T10:00:00Z', '2025-01-08T09:00:00Z', '2025-01-09T14:00:00Z', 'Quarterly Redis audit complete. Health excellent.', NULL, '2024-12-28T09:00:00Z', '2025-01-09T16:00:00Z'),
('30000009-0000-0000-0000-000000000009', 'VT-30009', 'e1b8a3b6-5c7f-8091-3d2e-6f7a8b9c0d1e', 'code_scan', 'high', 'completed', 100, 'a7f4c9d2-1e3b-4c5d-9f8a-2b3c4d5e6f7a', '2024-12-15T08:00:00Z', '2024-12-15T08:00:00Z', '2024-12-22T16:00:00Z', '2024-12-23T10:00:00Z', 'CodeQL passed. No SQL injection risks.', NULL, '2024-12-15T07:00:00Z', '2024-12-23T12:00:00Z'),
('30000010-0000-0000-0000-000000000010', 'VT-30010', 'd0a7f2a5-4b6e-7f80-2c1d-5e6f7a8b9c0d', 'config_review', 'normal', 'completed', 100, 'b8e5d0e3-2f4c-5d6e-0a9b-3c4d5e6f7a8b', '2024-12-22T09:00:00Z', '2024-12-22T09:00:00Z', '2024-12-28T11:00:00Z', '2024-12-29T09:00:00Z', 'Auth config passed. CORS policy correct.', NULL, '2024-12-22T08:00:00Z', '2024-12-29T12:00:00Z'),
('30000011-0000-0000-0000-000000000011', 'VT-30011', 'cb584d50-5f19-2a3b-d7c8-6d7e8f901a2b', 'dependency_check', 'normal', 'completed', 100, 'c9f6e1f4-3a5d-6e7f-1b0c-4d5e6f7a8b9c', '2024-12-30T10:00:00Z', '2024-12-30T10:00:00Z', '2025-01-10T14:00:00Z', '2025-01-11T10:00:00Z', 'Dependencies clean. No supply chain risks.', NULL, '2024-12-30T09:00:00Z', '2025-01-11T12:00:00Z'),
('30000012-0000-0000-0000-000000000012', 'VT-30012', 'c5f2e7fa-9ab3-c4d5-7162-0d1e2f3a4b5c', 'dynamic_analysis', 'high', 'completed', 100, 'a7f4c9d2-1e3b-4c5d-9f8a-2b3c4d5e6f7a', '2024-12-05T08:00:00Z', '2024-12-05T08:00:00Z', '2024-12-15T16:00:00Z', '2024-12-16T10:00:00Z', 'Falco analysis complete. No suspicious behavior.', NULL, '2024-12-05T07:00:00Z', '2024-12-16T12:00:00Z'),
('30000013-0000-0000-0000-000000000013', 'VT-30013', 'f2c9b4c7-6d80-91a2-4e3f-7a8b9c0d1e2f', 'code_scan', 'normal', 'completed', 100, 'b8e5d0e3-2f4c-5d6e-0a9b-3c4d5e6f7a8b', '2024-12-12T09:00:00Z', '2024-12-12T09:00:00Z', '2024-12-20T11:00:00Z', '2024-12-21T09:00:00Z', 'ESLint passed. No XSS vulnerabilities.', NULL, '2024-12-12T08:00:00Z', '2024-12-21T12:00:00Z'),
('30000014-0000-0000-0000-000000000014', 'VT-30014', 'a3d0c5d8-7e91-a2b3-5f40-8b9c0d1e2f3a', 'config_review', 'normal', 'completed', 100, 'c9f6e1f4-3a5d-6e7f-1b0c-4d5e6f7a8b9c', '2024-12-08T10:00:00Z', '2024-12-08T10:00:00Z', '2024-12-18T09:00:00Z', '2024-12-19T14:00:00Z', 'iOS config passed. ATS enforced.', NULL, '2024-12-08T09:00:00Z', '2024-12-19T16:00:00Z'),
('40000001-0000-0000-0000-000000000001', 'VT-40001', 'b4e1d6e9-8fa2-b3c4-6051-9c0d1e2f3a4b', 'config_review', 'critical', 'failed', 65, 'a7f4c9d2-1e3b-4c5d-9f8a-2b3c4d5e6f7a', '2025-01-10T08:00:00Z', '2025-01-10T08:00:00Z', '2025-01-12T11:30:00Z', '2025-01-12T12:00:00Z', 'Audit logging configuration incomplete.', 'Connection timeout to replica-2. Retry limit exceeded.', '2025-01-10T07:00:00Z', '2025-01-12T12:00:00Z'),
('40000002-0000-0000-0000-000000000002', 'VT-40002', 'b4e1d6e9-8fa2-b3c4-6051-9c0d1e2f3a4b', 'static_analysis', 'high', 'failed', 30, 'b8e5d0e3-2f4c-5d6e-0a9b-3c4d5e6f7a8b', '2025-01-05T09:00:00Z', '2025-01-05T09:00:00Z', '2025-01-08T14:00:00Z', '2025-01-08T15:00:00Z', '23 high-risk SQL patterns detected.', 'Parser error in migration file at line 147.', '2025-01-05T08:00:00Z', '2025-01-08T16:00:00Z'),
('40000003-0000-0000-0000-000000000003', 'VT-40003', 'ba473c4f-4f08-192a-c6b7-5c6d7e8f901a', 'penetration_test', 'critical', 'failed', 80, 'a7f4c9d2-1e3b-4c5d-9f8a-2b3c4d5e6f7a', '2024-12-28T08:00:00Z', '2024-12-28T08:00:00Z', '2025-01-05T10:00:00Z', '2025-01-05T11:00:00Z', 'XXE vulnerability and RCE via cluster/settings.', 'Scan engine crashed. Heap OOM error.', '2024-12-28T07:00:00Z', '2025-01-05T12:00:00Z'),
('40000004-0000-0000-0000-000000000004', 'VT-40004', 'ba473c4f-4f08-192a-c6b7-5c6d7e8f901a', 'dependency_check', 'high', 'failed', 55, 'b8e5d0e3-2f4c-5d6e-0a9b-3c4d5e6f7a8b', '2025-01-02T10:00:00Z', '2025-01-02T10:00:00Z', '2025-01-06T16:00:00Z', '2025-01-06T17:00:00Z', '3 known CVEs in ES v8.11. Patching required.', 'NVD download failed. Stale CVE database.', '2025-01-02T09:00:00Z', '2025-01-06T18:00:00Z'),
('40000005-0000-0000-0000-000000000005', 'VT-40005', 'c5f2e7fa-9ab3-c4d5-7162-0d1e2f3a4b5c', 'penetration_test', 'high', 'failed', 40, 'a7f4c9d2-1e3b-4c5d-9f8a-2b3c4d5e6f7a', '2024-12-20T09:00:00Z', '2024-12-20T09:00:00Z', '2024-12-28T14:00:00Z', '2024-12-28T15:00:00Z', 'Container escape via privileged pod.', 'K8s API server unresponsive. Scan aborted.', '2024-12-20T08:00:00Z', '2024-12-28T16:00:00Z'),
('40000006-0000-0000-0000-000000000006', 'VT-40006', 'f8251a2d-2de6-f708-a495-3a4b5c6d7e8f', 'static_analysis', 'normal', 'failed', 20, 'c9f6e1f4-3a5d-6e7f-1b0c-4d5e6f7a8b9c', '2025-01-07T09:00:00Z', '2025-01-07T09:00:00Z', '2025-01-10T11:00:00Z', '2025-01-10T12:00:00Z', '15 security smells including hardcoded API keys.', 'Gradle build failed. Signing config missing.', '2025-01-07T08:00:00Z', '2025-01-10T13:00:00Z'),
('40000007-0000-0000-0000-000000000007', 'VT-40007', 'f2c9b4c7-6d80-91a2-4e3f-7a8b9c0d1e2f', 'dynamic_analysis', 'high', 'failed', 50, 'b8e5d0e3-2f4c-5d6e-0a9b-3c4d5e6f7a8b', '2024-12-18T08:00:00Z', '2024-12-18T08:00:00Z', '2024-12-25T16:00:00Z', '2024-12-25T17:00:00Z', 'Reflected XSS in search component.', 'Infinite redirect loop on analytics route.', '2024-12-18T07:00:00Z', '2024-12-25T18:00:00Z'),
('40000008-0000-0000-0000-000000000008', 'VT-40008', 'e714091c-1cd5-e6f7-9384-2f3a4b5c6d7e', 'code_scan', 'normal', 'failed', 10, 'c9f6e1f4-3a5d-6e7f-1b0c-4d5e6f7a8b9c', '2025-01-08T10:00:00Z', '2025-01-08T10:00:00Z', '2025-01-11T14:00:00Z', '2025-01-11T15:00:00Z', '8 security issues from Bandit scan.', 'Package version conflict. Cannot resolve.', '2025-01-08T09:00:00Z', '2025-01-11T16:00:00Z'),
('40000009-0000-0000-0000-000000000009', 'VT-40009', 'a3d0c5d8-7e91-a2b3-5f40-8b9c0d1e2f3a', 'penetration_test', 'high', 'failed', 35, 'b8e5d0e3-2f4c-5d6e-0a9b-3c4d5e6f7a8b', '2024-12-25T09:00:00Z', '2024-12-25T09:00:00Z', '2025-01-05T11:00:00Z', '2025-01-05T12:00:00Z', 'Insecure data storage in UserDefaults.', 'Provisioning profile expired on test device.', '2024-12-25T08:00:00Z', '2025-01-05T13:00:00Z'),
('40000010-0000-0000-0000-000000000010', 'VT-40010', 'cb584d50-5f19-2a3b-d7c8-6d7e8f901a2b', 'static_analysis', 'normal', 'failed', 25, 'c9f6e1f4-3a5d-6e7f-1b0c-4d5e6f7a8b9c', '2025-01-06T09:00:00Z', '2025-01-06T09:00:00Z', '2025-01-09T16:00:00Z', '2025-01-09T17:00:00Z', 'Path traversal and unsafe deserialization.', 'Git clone failed. Access token expired.', '2025-01-06T08:00:00Z', '2025-01-09T18:00:00Z'),
('40000011-0000-0000-0000-000000000011', 'VT-40011', 'b4e1d6e9-8fa2-b3c4-6051-9c0d1e2f3a4b', 'audit_report', 'critical', 'failed', 70, 'a7f4c9d2-1e3b-4c5d-9f8a-2b3c4d5e6f7a', '2025-01-11T08:00:00Z', '2025-01-11T08:00:00Z', '2025-01-14T10:00:00Z', '2025-01-14T11:00:00Z', 'Excessive superuser privileges. Backup encryption not enabled.', 'psql connection dropped during analysis.', '2025-01-11T07:00:00Z', '2025-01-14T12:00:00Z'),
('40000012-0000-0000-0000-000000000012', 'VT-40012', 'ba473c4f-4f08-192a-c6b7-5c6d7e8f901a', 'static_analysis', 'high', 'failed', 45, 'a7f4c9d2-1e3b-4c5d-9f8a-2b3c4d5e6f7a', '2025-01-09T10:00:00Z', '2025-01-09T10:00:00Z', '2025-01-13T14:00:00Z', '2025-01-13T15:00:00Z', 'Unsafe reflection and missing input validation.', 'Cluster yellow status. Shard allocation failures.', '2025-01-09T09:00:00Z', '2025-01-13T16:00:00Z')
ON CONFLICT (id) DO NOTHING;

-- TASK LOGS
INSERT INTO task_logs (id, task_id, level, message, metadata, created_at) VALUES
('50000001-0000-0000-0000-000000000001', '20000001-0000-0000-0000-000000000001', 'info', 'Task initiated: Kubernetes NSA hardening validation', '{"stage": "init", "cluster": "eks-prod-01"}', '2025-01-14T08:00:00Z'),
('50000002-0000-0000-0000-000000000002', '20000001-0000-0000-0000-000000000001', 'info', 'Fetching current cluster configuration from EKS', '{"nodes": 6}', '2025-01-14T08:05:00Z'),
('50000003-0000-0000-0000-000000000003', '20000001-0000-0000-0000-000000000001', 'info', 'Checking Pod Security Standards enforcement', '{"namespace_count": 12}', '2025-01-14T08:15:00Z'),
('50000004-0000-0000-0000-000000000004', '20000001-0000-0000-0000-000000000001', 'warn', 'Namespace "legacy-apps" running without Pod Security Standards', '{"namespace": "legacy-apps", "policy": "privileged"}', '2025-01-14T08:20:00Z'),
('50000005-0000-0000-0000-000000000005', '20000001-0000-0000-0000-000000000001', 'info', 'Network policy validation in progress (45% complete)', '{"stage": "netpol", "progress": 45}', '2025-01-14T09:00:00Z'),
('50000006-0000-0000-0000-000000000006', '20000001-0000-0000-0000-000000000001', 'info', 'RBAC configuration analysis running', '{"roles": 24, "rolebindings": 38}', '2025-01-15T06:00:00Z'),
('50000007-0000-0000-0000-000000000007', '20000002-0000-0000-0000-000000000002', 'error', 'ALERT: Unauthorized access detected from IP 185.220.101.47', '{"ip": "185.220.101.47", "tor_exit": true}', '2025-01-15T07:00:00Z'),
('50000008-0000-0000-0000-000000000008', '20000002-0000-0000-0000-000000000002', 'warn', 'Multiple failed authentication attempts on _cluster/health', '{"attempts": 47}', '2025-01-15T07:05:00Z'),
('50000009-0000-0000-0000-000000000009', '20000002-0000-0000-0000-000000000002', 'info', 'Analyzing audit log patterns for last 72 hours', '{"log_entries": 2840000}', '2025-01-15T07:15:00Z'),
('50000010-0000-0000-0000-000000000010', '20000002-0000-0000-0000-000000000002', 'info', 'Correlation analysis 72% complete - found 3 attack patterns', '{"patterns": ["reconnaissance", "privilege_escalation", "data_access"]}', '2025-01-15T08:30:00Z'),
('50000011-0000-0000-0000-000000000011', '30000001-0000-0000-0000-000000000001', 'info', 'SonarQube scan initiated for auth-service', '{"scanner": "sonarqube-enterprise"}', '2024-12-28T09:00:00Z'),
('50000012-0000-0000-0000-000000000012', '30000001-0000-0000-0000-000000000001', 'info', 'Code coverage analysis: 94.2%', '{"coverage": 94.2}', '2024-12-28T09:30:00Z'),
('50000013-0000-0000-0000-000000000013', '30000001-0000-0000-0000-000000000001', 'success', 'Scan completed. Zero critical issues.', '{"critical": 0, "minor": 3}', '2025-01-08T14:30:00Z'),
('50000014-0000-0000-0000-000000000014', '30000002-0000-0000-0000-000000000002', 'info', 'Penetration test started by SecureFirst Consulting', '{"vendor": "SecureFirst"}', '2024-12-20T10:00:00Z'),
('50000015-0000-0000-0000-000000000015', '30000002-0000-0000-0000-000000000002', 'warn', 'Rate limiting test: 429 response verified', '{"threshold": 5}', '2024-12-22T14:00:00Z'),
('50000016-0000-0000-0000-000000000016', '30000002-0000-0000-0000-000000000002', 'success', 'All OWASP Top 10 categories verified secure', '{"pass": true}', '2025-01-05T16:00:00Z'),
('50000017-0000-0000-0000-000000000017', '40000001-0000-0000-0000-000000000001', 'info', 'PostgreSQL configuration review started', '{"version": "15.4"}', '2025-01-10T08:00:00Z'),
('50000018-0000-0000-0000-000000000018', '40000001-0000-0000-0000-000000000001', 'warn', 'log_connections is disabled on primary', '{}', '2025-01-10T09:00:00Z'),
('50000019-0000-0000-0000-000000000019', '40000001-0000-0000-0000-000000000001', 'warn', 'log_disconnections is disabled on primary', '{}', '2025-01-10T09:05:00Z'),
('50000020-0000-0000-0000-000000000020', '40000001-0000-0000-0000-000000000001', 'error', 'Connection timeout to replica-2', '{}', '2025-01-12T10:30:00Z'),
('50000021-0000-0000-0000-000000000021', '40000001-0000-0000-0000-000000000001', 'error', 'Task failed: Retry limit exceeded', '{}', '2025-01-12T11:30:00Z'),
('50000022-0000-0000-0000-000000000022', '40000003-0000-0000-0000-000000000003', 'error', 'CRITICAL: XXE vulnerability in _search API', '{"cvss": 9.1}', '2025-01-03T14:00:00Z'),
('50000023-0000-0000-0000-000000000023', '40000003-0000-0000-0000-000000000003', 'error', 'CRITICAL: _cluster/settings allows remote script execution', '{}', '2025-01-04T09:00:00Z'),
('50000024-0000-0000-0000-000000000024', '40000003-0000-0000-0000-000000000003', 'error', 'Scan engine crashed during recursive XML payload test', '{"error": "OOM"}', '2025-01-05T09:30:00Z'),
('50000025-0000-0000-0000-000000000025', '40000005-0000-0000-0000-000000000005', 'error', 'Container escape via privileged pod "debug-tools"', '{"pod": "debug-tools"}', '2024-12-22T10:00:00Z'),
('50000026-0000-0000-0000-000000000026', '40000005-0000-0000-0000-000000000005', 'warn', 'Service account has cluster-admin binding', '{"namespace": 8}', '2024-12-23T14:00:00Z'),
('50000027-0000-0000-0000-000000000027', '40000005-0000-0000-0000-000000000005', 'error', 'Scan aborted: K8s API server unresponsive', '{}', '2024-12-28T13:00:00Z'),
('50000028-0000-0000-0000-000000000028', '30000005-0000-0000-0000-000000000005', 'info', 'OWASP Dependency-Check scan started', '{}', '2025-01-03T10:00:00Z'),
('50000029-0000-0000-0000-000000000029', '30000005-0000-0000-0000-000000000005', 'warn', 'CVE-2024-1234 found in dev-dependency', '{"cvss": 3.2}', '2025-01-06T08:00:00Z'),
('50000030-0000-0000-0000-000000000030', '30000005-0000-0000-0000-000000000005', 'success', 'Scan complete. Production dependencies clean.', '{}', '2025-01-07T09:00:00Z'),
('50000031-0000-0000-0000-000000000031', '40000007-0000-0000-0000-000000000007', 'error', 'Reflected XSS in dashboard search component', '{"cvss": 6.8}', '2024-12-20T10:00:00Z'),
('50000032-0000-0000-0000-000000000032', '40000007-0000-0000-0000-000000000007', 'warn', 'Missing CSP header on API responses', '{}', '2024-12-22T14:00:00Z'),
('50000033-0000-0000-0000-000000000033', '40000007-0000-0000-0000-000000000007', 'error', 'Scanner encountered infinite redirect loop', '{}', '2024-12-25T15:00:00Z'),
('50000034-0000-0000-0000-000000000034', '30000009-0000-0000-0000-000000000009', 'info', 'CodeQL analysis started', '{"queries": "security-extended"}', '2024-12-15T08:00:00Z'),
('50000035-0000-0000-0000-000000000035', '30000009-0000-0000-0000-000000000009', 'success', 'CodeQL scan complete. All security queries passed.', '{}', '2024-12-22T16:00:00Z'),
('50000036-0000-0000-0000-000000000036', '10000001-0000-0000-0000-000000000001', 'info', 'Task queued: Dashboard static analysis', '{"queue_position": 1}', '2025-01-15T08:00:00Z'),
('50000037-0000-0000-0000-000000000037', '10000002-0000-0000-0000-000000000002', 'info', 'Task queued: iOS penetration test', '{"queue_position": 2}', '2025-01-15T09:00:00Z'),
('50000038-0000-0000-0000-000000000038', '10000003-0000-0000-0000-000000000003', 'info', 'Task queued: Android static analysis', '{"queue_position": 3}', '2025-01-14T16:00:00Z'),
('50000039-0000-0000-0000-000000000039', '30000003-0000-0000-0000-000000000003', 'info', 'PCI-DSS penetration test scope defined', '{}', '2024-11-15T08:00:00Z'),
('50000040-0000-0000-0000-000000000040', '30000003-0000-0000-0000-000000000003', 'success', 'PCI-DSS penetration test passed', '{}', '2024-11-30T14:00:00Z'),
('50000041-0000-0000-0000-000000000041', '40000004-0000-0000-0000-000000000004', 'error', 'CVE-2024-23450: RCE in scripting engine', '{"cvss": 8.1}', '2025-01-03T12:00:00Z'),
('50000042-0000-0000-0000-000000000042', '40000004-0000-0000-0000-000000000004', 'warn', 'CVE-2024-23451: Info disclosure via _cluster/state', '{"cvss": 7.5}', '2025-01-04T10:00:00Z'),
('50000043-0000-0000-0000-000000000043', '40000004-0000-0000-0000-000000000004', 'error', 'NVD database download failed - stale data', '{}', '2025-01-06T15:00:00Z'),
('50000044-0000-0000-0000-000000000044', '20000003-0000-0000-0000-000000000003', 'info', 'CIS benchmark check 30% complete', '{"passed": 18, "failed": 3}', '2025-01-14T10:00:00Z'),
('50000045-0000-0000-0000-000000000045', '20000004-0000-0000-0000-000000000004', 'info', 'PostgreSQL audit report compilation started', '{"findings": 12}', '2025-01-15T08:30:00Z')
ON CONFLICT (id) DO NOTHING;

-- ACTIVITY LOG
INSERT INTO activity_log (id, actor_id, action_type, entity_type, entity_id, description, metadata, created_at) VALUES
('60000001-0000-0000-0000-000000000001', 'a7f4c9d2-1e3b-4c5d-9f8a-2b3c4d5e6f7a', 'system_created', 'system', 'd0a7f2a5-4b6e-7f80-2c1d-5e6f7a8b9c0d', 'Created system: Auth Service API', '{}', '2024-11-15T09:00:00Z'),
('60000002-0000-0000-0000-000000000002', 'a7f4c9d2-1e3b-4c5d-9f8a-2b3c4d5e6f7a', 'system_created', 'system', 'e1b8a3b6-5c7f-8091-3d2e-6f7a8b9c0d1e', 'Created system: Payment Gateway', '{}', '2024-11-20T11:00:00Z'),
('60000003-0000-0000-0000-000000000003', 'a7f4c9d2-1e3b-4c5d-9f8a-2b3c4d5e6f7a', 'system_created', 'system', 'f2c9b4c7-6d80-91a2-4e3f-7a8b9c0d1e2f', 'Created system: User Dashboard Web App', '{}', '2024-12-01T08:30:00Z'),
('60000004-0000-0000-0000-000000000004', 'b8e5d0e3-2f4c-5d6e-0a9b-3c4d5e6f7a8b', 'system_created', 'system', 'a3d0c5d8-7e91-a2b3-5f40-8b9c0d1e2f3a', 'Created system: iOS Mobile App', '{}', '2024-12-05T13:00:00Z'),
('60000005-0000-0000-0000-000000000005', 'a7f4c9d2-1e3b-4c5d-9f8a-2b3c4d5e6f7a', 'system_created', 'system', 'b4e1d6e9-8fa2-b3c4-6051-9c0d1e2f3a4b', 'Created system: PostgreSQL Main DB', '{}', '2024-10-20T07:00:00Z'),
('60000006-0000-0000-0000-000000000006', 'a7f4c9d2-1e3b-4c5d-9f8a-2b3c4d5e6f7a', 'system_created', 'system', 'c5f2e7fa-9ab3-c4d5-7162-0d1e2f3a4b5c', 'Created system: Kubernetes Cluster', '{}', '2024-10-25T10:00:00Z'),
('60000007-0000-0000-0000-000000000007', 'b8e5d0e3-2f4c-5d6e-0a9b-3c4d5e6f7a8b', 'system_created', 'system', 'd603f80b-0bc4-d5e6-8273-1e2f3a4b5c6d', 'Created system: Crypto Library (libsecure)', '{}', '2024-09-15T06:00:00Z'),
('60000008-0000-0000-0000-000000000008', 'b8e5d0e3-2f4c-5d6e-0a9b-3c4d5e6f7a8b', 'evidence_uploaded', 'evidence', 'f1357e9a-6b20-4c8d-af12-3e5f7a9b1c2d', 'Uploaded: SonarQube scan report for Auth Service', '{"size": 2457800}', '2025-01-08T10:00:00Z'),
('60000009-0000-0000-0000-000000000009', 'a7f4c9d2-1e3b-4c5d-9f8a-2b3c4d5e6f7a', 'evidence_uploaded', 'evidence', 'e0246d89-5a19-3b7c-9e01-2d4e6f8a0b1c', 'Uploaded: Payment Gateway penetration test report', '{"size": 8451200}', '2024-11-28T09:00:00Z'),
('60000010-0000-0000-0000-000000000010', 'a7f4c9d2-1e3b-4c5d-9f8a-2b3c4d5e6f7a', 'task_created', 'task', '40000001-0000-0000-0000-000000000001', 'Created task VT-40001: PostgreSQL config review', '{"priority": "critical"}', '2025-01-10T07:00:00Z'),
('60000011-0000-0000-0000-000000000011', 'b8e5d0e3-2f4c-5d6e-0a9b-3c4d5e6f7a8b', 'task_completed', 'task', '30000001-0000-0000-0000-000000000001', 'Completed VT-30001: Auth Service static analysis passed', '{"score": 92}', '2025-01-09T14:30:00Z'),
('60000012-0000-0000-0000-000000000012', 'b8e5d0e3-2f4c-5d6e-0a9b-3c4d5e6f7a8b', 'task_completed', 'task', '30000002-0000-0000-0000-000000000002', 'Completed VT-30002: Auth Service pen test passed', '{}', '2025-01-05T16:00:00Z'),
('60000013-0000-0000-0000-000000000013', 'a7f4c9d2-1e3b-4c5d-9f8a-2b3c4d5e6f7a', 'task_failed', 'task', '40000003-0000-0000-0000-000000000003', 'Failed VT-40003: Critical XXE in Elasticsearch', '{"severity": "critical"}', '2025-01-05T10:00:00Z'),
('60000014-0000-0000-0000-000000000014', 'a7f4c9d2-1e3b-4c5d-9f8a-2b3c4d5e6f7a', 'threat_detected', 'system', 'ba473c4f-4f08-192a-c6b7-5c6d7e8f901a', 'THREAT ALERT: ES cluster compromised', '{"ip": "185.220.101.47"}', '2025-01-15T07:00:00Z'),
('60000015-0000-0000-0000-000000000015', 'a7f4c9d2-1e3b-4c5d-9f8a-2b3c4d5e6f7a', 'system_status_changed', 'system', 'b4e1d6e9-8fa2-b3c4-6051-9c0d1e2f3a4b', 'Status: PostgreSQL Main DB → threat', '{"score": 23}', '2025-01-12T12:00:00Z'),
('60000016-0000-0000-0000-000000000016', 'a7f4c9d2-1e3b-4c5d-9f8a-2b3c4d5e6f7a', 'user_login', 'user', 'a7f4c9d2-1e3b-4c5d-9f8a-2b3c4d5e6f7a', 'Admin login', '{"ip": "10.0.2.15"}', '2025-01-15T09:30:00Z'),
('60000017-0000-0000-0000-000000000017', 'b8e5d0e3-2f4c-5d6e-0a9b-3c4d5e6f7a8b', 'user_login', 'user', 'b8e5d0e3-2f4c-5d6e-0a9b-3c4d5e6f7a8b', 'Reviewer login', '{"ip": "10.0.2.23"}', '2025-01-14T16:45:00Z'),
('60000018-0000-0000-0000-000000000018', 'c9f6e1f4-3a5d-6e7f-1b0c-4d5e6f7a8b9c', 'user_login', 'user', 'c9f6e1f4-3a5d-6e7f-1b0c-4d5e6f7a8b9c', 'Viewer login', '{"ip": "10.0.2.31"}', '2025-01-13T11:20:00Z'),
('60000019-0000-0000-0000-000000000019', 'a7f4c9d2-1e3b-4c5d-9f8a-2b3c4d5e6f7a', 'task_created', 'task', '20000001-0000-0000-0000-000000000001', 'Created VT-20001: K8s NSA hardening review', '{}', '2025-01-14T07:30:00Z'),
('60000020-0000-0000-0000-000000000020', 'a7f4c9d2-1e3b-4c5d-9f8a-2b3c4d5e6f7a', 'system_status_changed', 'system', 'ba473c4f-4f08-192a-c6b7-5c6d7e8f901a', 'Status: ES Cluster → threat (intrusion)', '{}', '2025-01-15T07:30:00Z'),
('60000021-0000-0000-0000-000000000021', 'b8e5d0e3-2f4c-5d6e-0a9b-3c4d5e6f7a8b', 'evidence_uploaded', 'evidence', 'b7013a56-2706-0849-6b00-890a2b4c6d7e', 'Uploaded: libsecure dependency check', '{"size": 1893400}', '2025-01-06T10:00:00Z'),
('60000022-0000-0000-0000-000000000022', 'b8e5d0e3-2f4c-5d6e-0a9b-3c4d5e6f7a8b', 'task_completed', 'task', '30000005-0000-0000-0000-000000000005', 'Completed VT-30005: libsecure deps passed', '{}', '2025-01-07T09:00:00Z'),
('60000023-0000-0000-0000-000000000023', 'a7f4c9d2-1e3b-4c5d-9f8a-2b3c4d5e6f7a', 'system_status_changed', 'system', 'd0a7f2a5-4b6e-7f80-2c1d-5e6f7a8b9c0d', 'Status: Auth Service API → verified (92)', '{}', '2025-01-10T14:30:00Z'),
('60000024-0000-0000-0000-000000000024', 'a7f4c9d2-1e3b-4c5d-9f8a-2b3c4d5e6f7a', 'task_created', 'task', '10000001-0000-0000-0000-000000000001', 'Created VT-10001: Dashboard static analysis', '{}', '2025-01-15T08:00:00Z'),
('60000025-0000-0000-0000-000000000025', 'b8e5d0e3-2f4c-5d6e-0a9b-3c4d5e6f7a8b', 'evidence_uploaded', 'evidence', 'c8024b67-3807-195a-7c00-0b2c4d6e8f9a', 'Uploaded: K8s NSA hardening manifest', '{"size": 45120}', '2025-01-14T08:00:00Z')
ON CONFLICT (id) DO NOTHING;

-- VERIFICATION HISTORY
INSERT INTO verification_history (id, system_id, event_type, description, performed_by, metadata, created_at) VALUES
('70000001-0000-0000-0000-000000000001', 'd0a7f2a5-4b6e-7f80-2c1d-5e6f7a8b9c0d', 'scan_initiated', 'SonarQube scan initiated for Auth Service v2.4.1', 'b8e5d0e3-2f4c-5d6e-0a9b-3c4d5e6f7a8b', '{"scanner": "sonarqube"}', '2024-12-28T09:00:00Z'),
('70000002-0000-0000-0000-000000000002', 'd0a7f2a5-4b6e-7f80-2c1d-5e6f7a8b9c0d', 'scan_completed', 'Static analysis completed. Zero critical issues.', 'b8e5d0e3-2f4c-5d6e-0a9b-3c4d5e6f7a8b', '{"result": "pass"}', '2025-01-08T14:30:00Z'),
('70000003-0000-0000-0000-000000000003', 'd0a7f2a5-4b6e-7f80-2c1d-5e6f7a8b9c0d', 'review_completed', 'Auth Service review completed. Score: 92/100', 'b8e5d0e3-2f4c-5d6e-0a9b-3c4d5e6f7a8b', '{"score": 92}', '2025-01-10T14:30:00Z'),
('70000004-0000-0000-0000-000000000004', 'e1b8a3b6-5c7f-8091-3d2e-6f7a8b9c0d1e', 'scan_initiated', 'PCI-DSS pen test started by SecureFirst', 'a7f4c9d2-1e3b-4c5d-9f8a-2b3c4d5e6f7a', '{"vendor": "SecureFirst"}', '2024-11-15T08:00:00Z'),
('70000005-0000-0000-0000-000000000005', 'e1b8a3b6-5c7f-8091-3d2e-6f7a8b9c0d1e', 'scan_completed', 'PCI-DSS pen test completed. No critical findings.', 'a7f4c9d2-1e3b-4c5d-9f8a-2b3c4d5e6f7a', '{"result": "pass"}', '2024-11-30T14:00:00Z'),
('70000006-0000-0000-0000-000000000006', 'e1b8a3b6-5c7f-8091-3d2e-6f7a8b9c0d1e', 'review_completed', 'Payment Gateway review. Score: 88/100', 'a7f4c9d2-1e3b-4c5d-9f8a-2b3c4d5e6f7a', '{"score": 88}', '2025-01-12T10:15:00Z'),
('70000007-0000-0000-0000-000000000007', 'b4e1d6e9-8fa2-b3c4-6051-9c0d1e2f3a4b', 'scan_initiated', 'PostgreSQL audit config review started', 'a7f4c9d2-1e3b-4c5d-9f8a-2b3c4d5e6f7a', '{"type": "config_review"}', '2025-01-10T08:00:00Z'),
('70000008-0000-0000-0000-000000000008', 'b4e1d6e9-8fa2-b3c4-6051-9c0d1e2f3a4b', 'threat_detected', 'CRITICAL: Audit logging configuration incomplete', 'a7f4c9d2-1e3b-4c5d-9f8a-2b3c4d5e6f7a', '{"severity": "critical"}', '2025-01-12T11:00:00Z'),
('70000009-0000-0000-0000-000000000009', 'b4e1d6e9-8fa2-b3c4-6051-9c0d1e2f3a4b', 'threat_detected', 'CRITICAL: Excessive superuser privileges', 'a7f4c9d2-1e3b-4c5d-9f8a-2b3c4d5e6f7a', '{"severity": "critical"}', '2025-01-14T10:00:00Z'),
('70000010-0000-0000-0000-000000000010', 'ba473c4f-4f08-192a-c6b7-5c6d7e8f901a', 'scan_initiated', 'ES penetration test started', 'a7f4c9d2-1e3b-4c5d-9f8a-2b3c4d5e6f7a', '{"scanner": "burp-suite"}', '2024-12-28T08:00:00Z'),
('70000011-0000-0000-0000-000000000011', 'ba473c4f-4f08-192a-c6b7-5c6d7e8f901a', 'threat_detected', 'CRITICAL: XXE in _search API', 'a7f4c9d2-1e3b-4c5d-9f8a-2b3c4d5e6f7a', '{"cvss": 9.1}', '2025-01-03T14:00:00Z'),
('70000012-0000-0000-0000-000000000012', 'ba473c4f-4f08-192a-c6b7-5c6d7e8f901a', 'threat_detected', 'CRITICAL: RCE via script fields', 'a7f4c9d2-1e3b-4c5d-9f8a-2b3c4d5e6f7a', '{"cvss": 9.8}', '2025-01-04T09:00:00Z'),
('70000013-0000-0000-0000-000000000013', 'ba473c4f-4f08-192a-c6b7-5c6d7e8f901a', 'threat_detected', 'ALERT: Unauthorized access from Tor exit node', 'a7f4c9d2-1e3b-4c5d-9f8a-2b3c4d5e6f7a', '{"ip": "185.220.101.47"}', '2025-01-15T07:00:00Z'),
('70000014-0000-0000-0000-000000000014', 'c5f2e7fa-9ab3-c4d5-7162-0d1e2f3a4b5c', 'scan_initiated', 'K8s NSA hardening validation started', 'a7f4c9d2-1e3b-4c5d-9f8a-2b3c4d5e6f7a', '{"benchmark": "NSA-CISA"}', '2025-01-14T08:00:00Z'),
('70000015-0000-0000-0000-000000000015', 'c5f2e7fa-9ab3-c4d5-7162-0d1e2f3a4b5c', 'threat_detected', 'Container escape via privileged pod', 'a7f4c9d2-1e3b-4c5d-9f8a-2b3c4d5e6f7a', '{"pod": "debug-tools"}', '2024-12-22T10:00:00Z'),
('70000016-0000-0000-0000-000000000016', 'd603f80b-0bc4-d5e6-8273-1e2f3a4b5c6d', 'scan_completed', 'Coverity analysis completed. Zero defects.', 'b8e5d0e3-2f4c-5d6e-0a9b-3c4d5e6f7a8b', '{"defects": 0}', '2025-01-02T15:00:00Z'),
('70000017-0000-0000-0000-000000000017', 'd603f80b-0bc4-d5e6-8273-1e2f3a4b5c6d', 'review_completed', 'Crypto Library review. Score: 96/100', 'b8e5d0e3-2f4c-5d6e-0a9b-3c4d5e6f7a8b', '{"score": 96}', '2025-01-08T15:00:00Z'),
('70000018-0000-0000-0000-000000000018', 'a9362b3e-3ef7-0819-b5a6-4b5c6d7e8f90', 'review_completed', 'Redis review. Score: 85/100', 'b8e5d0e3-2f4c-5d6e-0a9b-3c4d5e6f7a8b', '{"score": 85}', '2025-01-11T10:00:00Z')
ON CONFLICT (id) DO NOTHING;
