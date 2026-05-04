-- CreateEnum
CREATE TYPE "user_role" AS ENUM ('admin', 'reviewer', 'viewer');
CREATE TYPE "system_type" AS ENUM ('api', 'web', 'mobile', 'database', 'infrastructure', 'library', 'other');
CREATE TYPE "system_status" AS ENUM ('verified', 'pending', 'threat', 'unknown');
CREATE TYPE "evidence_type" AS ENUM ('code_scan', 'audit_report', 'penetration_test', 'config_review', 'dependency_check', 'static_analysis', 'dynamic_analysis');
CREATE TYPE "evidence_status" AS ENUM ('pending', 'processing', 'verified', 'failed');
CREATE TYPE "evidence_priority" AS ENUM ('low', 'medium', 'high');
CREATE TYPE "history_event_type" AS ENUM ('scan_initiated', 'scan_completed', 'review_started', 'review_completed', 'threat_detected', 'resolved');
CREATE TYPE "task_type" AS ENUM ('code_scan', 'audit_report', 'penetration_test', 'config_review', 'dependency_check', 'static_analysis', 'dynamic_analysis');
CREATE TYPE "task_priority" AS ENUM ('low', 'normal', 'high', 'critical');
CREATE TYPE "task_status" AS ENUM ('pending', 'processing', 'completed', 'failed', 'cancelled');
CREATE TYPE "log_level" AS ENUM ('info', 'warn', 'error', 'success');

-- CreateTable users
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" VARCHAR(255) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "first_name" VARCHAR(100) NOT NULL,
    "last_name" VARCHAR(100) NOT NULL,
    "role" "user_role" NOT NULL DEFAULT 'viewer',
    "avatar_url" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_login" TIMESTAMPTZ,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "users_email_key" UNIQUE ("email")
);

-- CreateTable systems
CREATE TABLE "systems" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(255) NOT NULL,
    "version" VARCHAR(50),
    "description" TEXT,
    "type" "system_type" NOT NULL DEFAULT 'other',
    "status" "system_status" NOT NULL DEFAULT 'unknown',
    "verification_score" SMALLINT NOT NULL DEFAULT 0,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_by" UUID,
    "assigned_to" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "systems_pkey" PRIMARY KEY ("id")
);

-- CreateTable evidence_uploads
CREATE TABLE "evidence_uploads" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "system_id" UUID NOT NULL,
    "uploaded_by" UUID,
    "filename" VARCHAR(500) NOT NULL,
    "original_name" VARCHAR(500) NOT NULL,
    "file_path" TEXT NOT NULL,
    "file_size" BIGINT NOT NULL DEFAULT 0,
    "mime_type" VARCHAR(255),
    "evidence_type" "evidence_type" NOT NULL,
    "description" TEXT,
    "priority" "evidence_priority" NOT NULL DEFAULT 'medium',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "evidence_status" NOT NULL DEFAULT 'pending',
    "checksum" VARCHAR(64),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMPTZ,

    CONSTRAINT "evidence_uploads_pkey" PRIMARY KEY ("id")
);

-- CreateTable verification_history
CREATE TABLE "verification_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "system_id" UUID NOT NULL,
    "event_type" "history_event_type" NOT NULL,
    "description" TEXT,
    "performed_by" UUID,
    "metadata" JSONB DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable verification_tasks
CREATE TABLE "verification_tasks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "task_id" VARCHAR(20) NOT NULL,
    "system_id" UUID NOT NULL,
    "task_type" "task_type" NOT NULL,
    "priority" "task_priority" NOT NULL DEFAULT 'normal',
    "status" "task_status" NOT NULL DEFAULT 'pending',
    "progress" SMALLINT NOT NULL DEFAULT 0,
    "assigned_to" UUID,
    "created_by" UUID NOT NULL,
    "started_at" TIMESTAMPTZ,
    "completed_at" TIMESTAMPTZ,
    "estimated_completion" TIMESTAMPTZ,
    "result_summary" TEXT,
    "error_message" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_tasks_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "verification_tasks_task_id_key" UNIQUE ("task_id")
);

-- CreateTable task_logs
CREATE TABLE "task_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "task_id" UUID NOT NULL,
    "level" "log_level" NOT NULL DEFAULT 'info',
    "message" TEXT NOT NULL,
    "metadata" JSONB DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable activity_log
CREATE TABLE "activity_log" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "actor_id" UUID,
    "action_type" VARCHAR(100) NOT NULL,
    "entity_type" VARCHAR(100) NOT NULL,
    "entity_id" UUID,
    "description" TEXT,
    "metadata" JSONB DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_log_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "systems" ADD CONSTRAINT "systems_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "systems" ADD CONSTRAINT "systems_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_uploads" ADD CONSTRAINT "evidence_uploads_system_id_fkey" FOREIGN KEY ("system_id") REFERENCES "systems"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "evidence_uploads" ADD CONSTRAINT "evidence_uploads_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_history" ADD CONSTRAINT "verification_history_system_id_fkey" FOREIGN KEY ("system_id") REFERENCES "systems"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "verification_history" ADD CONSTRAINT "verification_history_performed_by_fkey" FOREIGN KEY ("performed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_tasks" ADD CONSTRAINT "verification_tasks_system_id_fkey" FOREIGN KEY ("system_id") REFERENCES "systems"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "verification_tasks" ADD CONSTRAINT "verification_tasks_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "verification_tasks" ADD CONSTRAINT "verification_tasks_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_logs" ADD CONSTRAINT "task_logs_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "verification_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_users_email" ON "users"("email");
CREATE INDEX IF NOT EXISTS "idx_users_role" ON "users"("role");
CREATE INDEX IF NOT EXISTS "idx_users_created_at" ON "users"("created_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_systems_status" ON "systems"("status");
CREATE INDEX IF NOT EXISTS "idx_systems_type" ON "systems"("type");
CREATE INDEX IF NOT EXISTS "idx_systems_created_by" ON "systems"("created_by");
CREATE INDEX IF NOT EXISTS "idx_systems_assigned_to" ON "systems"("assigned_to");
CREATE INDEX IF NOT EXISTS "idx_systems_created_at" ON "systems"("created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_systems_tags" ON "systems" USING GIN("tags");
CREATE INDEX IF NOT EXISTS "idx_systems_name" ON "systems"("name");
CREATE INDEX IF NOT EXISTS "idx_systems_verification_score" ON "systems"("verification_score" DESC);

CREATE INDEX IF NOT EXISTS "idx_evidence_system_id" ON "evidence_uploads"("system_id");
CREATE INDEX IF NOT EXISTS "idx_evidence_uploaded_by" ON "evidence_uploads"("uploaded_by");
CREATE INDEX IF NOT EXISTS "idx_evidence_status" ON "evidence_uploads"("status");
CREATE INDEX IF NOT EXISTS "idx_evidence_type" ON "evidence_uploads"("evidence_type");
CREATE INDEX IF NOT EXISTS "idx_evidence_priority" ON "evidence_uploads"("priority");
CREATE INDEX IF NOT EXISTS "idx_evidence_created_at" ON "evidence_uploads"("created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_evidence_tags" ON "evidence_uploads" USING GIN("tags");
CREATE INDEX IF NOT EXISTS "idx_evidence_checksum" ON "evidence_uploads"("checksum");

CREATE INDEX IF NOT EXISTS "idx_vh_system_id" ON "verification_history"("system_id");
CREATE INDEX IF NOT EXISTS "idx_vh_event_type" ON "verification_history"("event_type");
CREATE INDEX IF NOT EXISTS "idx_vh_created_at" ON "verification_history"("created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_vh_performed_by" ON "verification_history"("performed_by");

CREATE INDEX IF NOT EXISTS "idx_vt_task_id" ON "verification_tasks"("task_id");
CREATE INDEX IF NOT EXISTS "idx_vt_system_id" ON "verification_tasks"("system_id");
CREATE INDEX IF NOT EXISTS "idx_vt_status" ON "verification_tasks"("status");
CREATE INDEX IF NOT EXISTS "idx_vt_priority" ON "verification_tasks"("priority");
CREATE INDEX IF NOT EXISTS "idx_vt_task_type" ON "verification_tasks"("task_type");
CREATE INDEX IF NOT EXISTS "idx_vt_assigned_to" ON "verification_tasks"("assigned_to");
CREATE INDEX IF NOT EXISTS "idx_vt_created_at" ON "verification_tasks"("created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_vt_status_priority" ON "verification_tasks"("status", "priority");
CREATE INDEX IF NOT EXISTS "idx_vt_started_at" ON "verification_tasks"("started_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_tl_task_id" ON "task_logs"("task_id");
CREATE INDEX IF NOT EXISTS "idx_tl_level" ON "task_logs"("level");
CREATE INDEX IF NOT EXISTS "idx_tl_created_at" ON "task_logs"("created_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_al_actor_id" ON "activity_log"("actor_id");
CREATE INDEX IF NOT EXISTS "idx_al_action_type" ON "activity_log"("action_type");
CREATE INDEX IF NOT EXISTS "idx_al_entity" ON "activity_log"("entity_type", "entity_id");
CREATE INDEX IF NOT EXISTS "idx_al_created_at" ON "activity_log"("created_at" DESC);

-- Full-text search on systems
ALTER TABLE "systems" ADD COLUMN IF NOT EXISTS "search_vector" tsvector
    GENERATED ALWAYS AS (
        setweight(to_tsvector('english', COALESCE(name, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(description, '')), 'B') ||
        setweight(to_tsvector('english', COALESCE(array_to_string(tags, ' '), '')), 'C')
    ) STORED;

CREATE INDEX IF NOT EXISTS "idx_systems_search" ON "systems" USING GIN("search_vector");

-- Auto-update updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON "users"
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_systems_updated_at
    BEFORE UPDATE ON "systems"
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_evidence_uploads_updated_at
    BEFORE UPDATE ON "evidence_uploads"
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_verification_tasks_updated_at
    BEFORE UPDATE ON "verification_tasks"
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
