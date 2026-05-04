-- =============================================================================
-- No-Backdoor System Architecture — PostgreSQL Schema
-- =============================================================================
-- Description: Security verification platform tracking software systems,
--              evidence uploads, and verification tasks.
-- PostgreSQL: 14+
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enum Types
-- ---------------------------------------------------------------------------
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('admin', 'reviewer', 'viewer');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE system_type AS ENUM (
        'api', 'web', 'mobile', 'database', 'infrastructure', 'library', 'other'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE system_status AS ENUM (
        'verified', 'pending', 'threat', 'unknown'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE evidence_type AS ENUM (
        'code_scan', 'audit_report', 'penetration_test', 'config_review',
        'dependency_check', 'static_analysis', 'dynamic_analysis'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE evidence_status AS ENUM (
        'pending', 'processing', 'verified', 'failed'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE evidence_priority AS ENUM ('low', 'medium', 'high');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE history_event_type AS ENUM (
        'scan_initiated', 'scan_completed', 'review_started',
        'review_completed', 'threat_detected', 'resolved'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE task_type AS ENUM (
        'code_scan', 'audit_report', 'penetration_test', 'config_review',
        'dependency_check', 'static_analysis', 'dynamic_analysis'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE task_priority AS ENUM ('low', 'normal', 'high', 'critical');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE task_status AS ENUM (
        'pending', 'processing', 'completed', 'failed', 'cancelled'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE log_level AS ENUM ('info', 'warn', 'error', 'success');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- 1. users
-- ---------------------------------------------------------------------------
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

COMMENT ON TABLE users IS 'Platform users with authentication and role-based access';

-- ---------------------------------------------------------------------------
-- 2. systems (portfolio items)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS systems (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name                VARCHAR(255) NOT NULL,
    version             VARCHAR(50),
    description         TEXT,
    type                system_type NOT NULL DEFAULT 'other',
    status              system_status NOT NULL DEFAULT 'unknown',
    verification_score  SMALLINT NOT NULL DEFAULT 0,
    tags                TEXT[] DEFAULT '{}',
    created_by          UUID,
    assigned_to         UUID,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT systems_verification_score_range
        CHECK (verification_score >= 0 AND verification_score <= 100),
    CONSTRAINT systems_created_by_fk
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT systems_assigned_to_fk
        FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL
);

COMMENT ON TABLE systems IS 'Software systems under security verification';

-- ---------------------------------------------------------------------------
-- 3. evidence_uploads
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS evidence_uploads (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    system_id       UUID NOT NULL,
    uploaded_by     UUID,
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

    CONSTRAINT evidence_uploads_system_fk
        FOREIGN KEY (system_id) REFERENCES systems(id) ON DELETE CASCADE,
    CONSTRAINT evidence_uploads_user_fk
        FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT evidence_uploads_checksum_format
        CHECK (checksum IS NULL OR checksum ~ '^[A-Fa-f0-9]{64}$'),
    CONSTRAINT evidence_uploads_file_size_positive
        CHECK (file_size >= 0)
);

COMMENT ON TABLE evidence_uploads IS 'Evidence files uploaded for system verification';

-- ---------------------------------------------------------------------------
-- 4. verification_history (timeline events)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS verification_history (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    system_id       UUID NOT NULL,
    event_type      history_event_type NOT NULL,
    description     TEXT,
    performed_by    UUID,
    metadata        JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT verification_history_system_fk
        FOREIGN KEY (system_id) REFERENCES systems(id) ON DELETE CASCADE,
    CONSTRAINT verification_history_user_fk
        FOREIGN KEY (performed_by) REFERENCES users(id) ON DELETE SET NULL
);

COMMENT ON TABLE verification_history IS 'Timeline events tracking verification lifecycle';

-- ---------------------------------------------------------------------------
-- 5. verification_tasks (queue items)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS verification_tasks (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id                 VARCHAR(20) NOT NULL UNIQUE,
    system_id               UUID NOT NULL,
    task_type               task_type NOT NULL,
    priority                task_priority NOT NULL DEFAULT 'normal',
    status                  task_status NOT NULL DEFAULT 'pending',
    progress                SMALLINT NOT NULL DEFAULT 0,
    assigned_to             UUID,
    created_by              UUID NOT NULL,
    started_at              TIMESTAMPTZ,
    completed_at            TIMESTAMPTZ,
    estimated_completion    TIMESTAMPTZ,
    result_summary          TEXT,
    error_message           TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT verification_tasks_task_id_format
        CHECK (task_id ~ '^VT-[0-9]+$'),
    CONSTRAINT verification_tasks_progress_range
        CHECK (progress >= 0 AND progress <= 100),
    CONSTRAINT verification_tasks_system_fk
        FOREIGN KEY (system_id) REFERENCES systems(id) ON DELETE CASCADE,
    CONSTRAINT verification_tasks_assigned_fk
        FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT verification_tasks_created_fk
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
);

COMMENT ON TABLE verification_tasks IS 'Verification task queue items with progress tracking';

-- ---------------------------------------------------------------------------
-- 6. task_logs
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS task_logs (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id     UUID NOT NULL,
    level       log_level NOT NULL DEFAULT 'info',
    message     TEXT NOT NULL,
    metadata    JSONB DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT task_logs_task_fk
        FOREIGN KEY (task_id) REFERENCES verification_tasks(id) ON DELETE CASCADE
);

COMMENT ON TABLE task_logs IS 'Log entries for individual verification tasks';

-- ---------------------------------------------------------------------------
-- 7. activity_log (dashboard recent activity)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS activity_log (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    actor_id    UUID,
    action_type VARCHAR(100) NOT NULL,
    entity_type VARCHAR(100) NOT NULL,
    entity_id   UUID,
    description TEXT,
    metadata    JSONB DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT activity_log_actor_fk
        FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL
);

COMMENT ON TABLE activity_log IS 'General activity feed for dashboard display';

-- =============================================================================
-- INDEXES
-- =============================================================================

-- users indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at DESC);

-- systems indexes
CREATE INDEX IF NOT EXISTS idx_systems_status ON systems(status);
CREATE INDEX IF NOT EXISTS idx_systems_type ON systems(type);
CREATE INDEX IF NOT EXISTS idx_systems_created_by ON systems(created_by);
CREATE INDEX IF NOT EXISTS idx_systems_assigned_to ON systems(assigned_to);
CREATE INDEX IF NOT EXISTS idx_systems_created_at ON systems(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_systems_tags ON systems USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_systems_name ON systems(name);
CREATE INDEX IF NOT EXISTS idx_systems_verification_score ON systems(verification_score DESC);

-- evidence_uploads indexes
CREATE INDEX IF NOT EXISTS idx_evidence_system_id ON evidence_uploads(system_id);
CREATE INDEX IF NOT EXISTS idx_evidence_uploaded_by ON evidence_uploads(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_evidence_status ON evidence_uploads(status);
CREATE INDEX IF NOT EXISTS idx_evidence_type ON evidence_uploads(evidence_type);
CREATE INDEX IF NOT EXISTS idx_evidence_priority ON evidence_uploads(priority);
CREATE INDEX IF NOT EXISTS idx_evidence_created_at ON evidence_uploads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_evidence_tags ON evidence_uploads USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_evidence_checksum ON evidence_uploads(checksum);

-- verification_history indexes
CREATE INDEX IF NOT EXISTS idx_vh_system_id ON verification_history(system_id);
CREATE INDEX IF NOT EXISTS idx_vh_event_type ON verification_history(event_type);
CREATE INDEX IF NOT EXISTS idx_vh_created_at ON verification_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vh_performed_by ON verification_history(performed_by);

-- verification_tasks indexes
CREATE INDEX IF NOT EXISTS idx_vt_task_id ON verification_tasks(task_id);
CREATE INDEX IF NOT EXISTS idx_vt_system_id ON verification_tasks(system_id);
CREATE INDEX IF NOT EXISTS idx_vt_status ON verification_tasks(status);
CREATE INDEX IF NOT EXISTS idx_vt_priority ON verification_tasks(priority);
CREATE INDEX IF NOT EXISTS idx_vt_task_type ON verification_tasks(task_type);
CREATE INDEX IF NOT EXISTS idx_vt_assigned_to ON verification_tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_vt_created_at ON verification_tasks(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vt_status_priority ON verification_tasks(status, priority);
CREATE INDEX IF NOT EXISTS idx_vt_started_at ON verification_tasks(started_at DESC);

-- task_logs indexes
CREATE INDEX IF NOT EXISTS idx_tl_task_id ON task_logs(task_id);
CREATE INDEX IF NOT EXISTS idx_tl_level ON task_logs(level);
CREATE INDEX IF NOT EXISTS idx_tl_created_at ON task_logs(created_at DESC);

-- activity_log indexes
CREATE INDEX IF NOT EXISTS idx_al_actor_id ON activity_log(actor_id);
CREATE INDEX IF NOT EXISTS idx_al_action_type ON activity_log(action_type);
CREATE INDEX IF NOT EXISTS idx_al_entity ON activity_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_al_created_at ON activity_log(created_at DESC);

-- =============================================================================
-- FULL-TEXT SEARCH INDEXES
-- =============================================================================
ALTER TABLE systems ADD COLUMN IF NOT EXISTS search_vector tsvector
    GENERATED ALWAYS AS (
        setweight(to_tsvector('english', COALESCE(name, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(description, '')), 'B') ||
        setweight(to_tsvector('english', COALESCE(array_to_string(tags, ' '), '')), 'C')
    ) STORED;

CREATE INDEX IF NOT EXISTS idx_systems_search ON systems USING GIN(search_vector);

-- =============================================================================
-- TRIGGERS: auto-update updated_at
-- =============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
    CREATE TRIGGER trg_users_updated_at
        BEFORE UPDATE ON users
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TRIGGER trg_systems_updated_at
        BEFORE UPDATE ON systems
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TRIGGER trg_evidence_uploads_updated_at
        BEFORE UPDATE ON evidence_uploads
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TRIGGER trg_verification_tasks_updated_at
        BEFORE UPDATE ON verification_tasks
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =============================================================================
-- VIEWS
-- =============================================================================

-- Dashboard metrics summary view
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

-- System overview with evidence count
CREATE OR REPLACE VIEW v_system_overview AS
SELECT
    s.*,
    u1.email AS created_by_email,
    u1.first_name AS created_by_first_name,
    u1.last_name AS created_by_last_name,
    u2.email AS assigned_to_email,
    u2.first_name AS assigned_to_first_name,
    u2.last_name AS assigned_to_last_name,
    (SELECT COUNT(*) FROM evidence_uploads WHERE system_id = s.id) AS evidence_count,
    (SELECT COUNT(*) FROM verification_tasks WHERE system_id = s.id) AS task_count,
    (SELECT MAX(created_at) FROM verification_history WHERE system_id = s.id) AS last_verified_at
FROM systems s
LEFT JOIN users u1 ON s.created_by = u1.id
LEFT JOIN users u2 ON s.assigned_to = u2.id;

-- Task overview with system and user info
CREATE OR REPLACE VIEW v_task_overview AS
SELECT
    vt.*,
    s.name AS system_name,
    s.type AS system_type,
    s.status AS system_status,
    u1.email AS assigned_to_email,
    u1.first_name AS assigned_to_first_name,
    u1.last_name AS assigned_to_last_name,
    u2.email AS created_by_email,
    u2.first_name AS created_by_first_name,
    u2.last_name AS created_by_last_name,
    (SELECT COUNT(*) FROM task_logs WHERE task_id = vt.id) AS log_count
FROM verification_tasks vt
LEFT JOIN systems s ON vt.system_id = s.id
LEFT JOIN users u1 ON vt.assigned_to = u1.id
LEFT JOIN users u2 ON vt.created_by = u2.id;
