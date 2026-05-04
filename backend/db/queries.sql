-- =============================================================================
-- No-Backdoor System Architecture — Common Queries
-- =============================================================================
-- Description: Optimized, production-ready queries for dashboard,
--              API endpoints, and reporting.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. DASHBOARD METRICS SUMMARY
-- ---------------------------------------------------------------------------
-- Single-row aggregation of all key platform metrics.
-- Used by: Dashboard overview cards
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(*)::INT FROM systems) AS total_systems,
    (SELECT COUNT(*)::INT FROM systems WHERE status = 'verified') AS verified_count,
    (SELECT COUNT(*)::INT FROM systems WHERE status = 'pending') AS pending_count,
    (SELECT COUNT(*)::INT FROM systems WHERE status = 'threat') AS threat_count,
    (SELECT COUNT(*)::INT FROM systems WHERE status = 'unknown') AS unknown_count,
    (SELECT COUNT(*)::INT FROM evidence_uploads) AS total_evidence,
    (SELECT COUNT(*)::INT FROM verification_tasks WHERE status = 'pending') AS pending_tasks,
    (SELECT COUNT(*)::INT FROM verification_tasks WHERE status = 'processing') AS processing_tasks,
    (SELECT COUNT(*)::INT FROM verification_tasks WHERE status = 'completed') AS completed_tasks,
    (SELECT COUNT(*)::INT FROM verification_tasks WHERE status = 'failed') AS failed_tasks,
    (SELECT COUNT(*)::INT FROM users) AS total_users,
    (SELECT COALESCE(ROUND(AVG(verification_score)::NUMERIC, 1), 0) FROM systems) AS avg_verification_score,
    -- Additional calculated metrics
    (SELECT COUNT(*)::INT FROM evidence_uploads WHERE status = 'processing') AS processing_evidence,
    (SELECT COUNT(*)::INT FROM activity_log WHERE created_at > NOW() - INTERVAL '24 hours') AS activity_24h;


-- ---------------------------------------------------------------------------
-- 2. DASHBOARD METRICS (CTE version — more readable)
-- ---------------------------------------------------------------------------
WITH
    system_counts AS (
        SELECT
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE status = 'verified') AS verified,
            COUNT(*) FILTER (WHERE status = 'pending') AS pending,
            COUNT(*) FILTER (WHERE status = 'threat') AS threat,
            COUNT(*) FILTER (WHERE status = 'unknown') AS unknown
        FROM systems
    ),
    task_counts AS (
        SELECT
            COUNT(*) FILTER (WHERE status = 'pending') AS pending,
            COUNT(*) FILTER (WHERE status = 'processing') AS processing,
            COUNT(*) FILTER (WHERE status = 'completed') AS completed,
            COUNT(*) FILTER (WHERE status = 'failed') AS failed
        FROM verification_tasks
    ),
    evidence_counts AS (
        SELECT COUNT(*) AS total FROM evidence_uploads
    )
SELECT
    sc.total AS total_systems,
    sc.verified AS verified_count,
    sc.pending AS pending_count,
    sc.threat AS threat_count,
    sc.unknown AS unknown_count,
    tc.pending AS pending_tasks,
    tc.processing AS processing_tasks,
    tc.completed AS completed_tasks,
    tc.failed AS failed_tasks,
    ec.total AS total_evidence
FROM system_counts sc
CROSS JOIN task_counts tc
CROSS JOIN evidence_counts ec;


-- ---------------------------------------------------------------------------
-- 3. 30-DAY TREND DATA
-- ---------------------------------------------------------------------------
-- Daily aggregation of verification events for trend charts.
-- Parameters: $1 = start_date (e.g., '2025-01-01'), $2 = end_date
-- Used by: Dashboard trend chart, activity timeline
-- ---------------------------------------------------------------------------
WITH date_range AS (
    SELECT generate_series(
        DATE_TRUNC('day', NOW() - INTERVAL '30 days'),
        DATE_TRUNC('day', NOW()),
        INTERVAL '1 day'
    )::DATE AS day
)
SELECT
    dr.day AS date,
    COUNT(vh.id) FILTER (WHERE vh.event_type = 'scan_initiated') AS scans_initiated,
    COUNT(vh.id) FILTER (WHERE vh.event_type = 'scan_completed') AS scans_completed,
    COUNT(vh.id) FILTER (WHERE vh.event_type = 'review_completed') AS reviews_completed,
    COUNT(vh.id) FILTER (WHERE vh.event_type = 'threat_detected') AS threats_detected,
    COUNT(vh.id) FILTER (WHERE vh.event_type = 'resolved') AS resolved,
    COUNT(vh.id) AS total_events,
    COUNT(vt.id) FILTER (WHERE vt.status = 'completed') AS tasks_completed,
    COUNT(vt.id) FILTER (WHERE vt.status = 'failed') AS tasks_failed
FROM date_range dr
LEFT JOIN verification_history vh ON DATE(vh.created_at) = dr.day
LEFT JOIN verification_tasks vt ON DATE(vt.created_at) = dr.day
GROUP BY dr.day
ORDER BY dr.day;


-- ---------------------------------------------------------------------------
-- 4. SYSTEM STATUS DISTRIBUTION (Donut Chart Data)
-- ---------------------------------------------------------------------------
-- Used by: Dashboard status donut/pie chart
-- ---------------------------------------------------------------------------
SELECT
    status,
    COUNT(*)::INT AS count,
    ROUND(COUNT(*) * 100.0 / NULLIF(SUM(COUNT(*)) OVER (), 0), 1) AS percentage
FROM systems
GROUP BY status
ORDER BY count DESC;


-- ---------------------------------------------------------------------------
-- 5. SYSTEM TYPE DISTRIBUTION (Donut Chart Data)
-- ---------------------------------------------------------------------------
SELECT
    type,
    COUNT(*)::INT AS count,
    ROUND(COUNT(*) * 100.0 / NULLIF(SUM(COUNT(*)) OVER (), 0), 1) AS percentage
FROM systems
GROUP BY type
ORDER BY count DESC;


-- ---------------------------------------------------------------------------
-- 6. RECENT ACTIVITY FEED (with user info)
-- ---------------------------------------------------------------------------
-- Parameters: $1 = limit (default 20), $2 = offset (for pagination)
-- Used by: Dashboard activity feed sidebar
-- ---------------------------------------------------------------------------
SELECT
    al.id,
    al.actor_id,
    u.first_name AS actor_first_name,
    u.last_name AS actor_last_name,
    u.email AS actor_email,
    u.avatar_url AS actor_avatar,
    u.role AS actor_role,
    al.action_type,
    al.entity_type,
    al.entity_id,
    al.description,
    al.metadata,
    al.created_at,
    -- Human-readable time ago
    CASE
        WHEN al.created_at > NOW() - INTERVAL '1 minute' THEN 'just now'
        WHEN al.created_at > NOW() - INTERVAL '1 hour' THEN EXTRACT(MINUTE FROM NOW() - al.created_at)::INT || 'm ago'
        WHEN al.created_at > NOW() - INTERVAL '1 day' THEN EXTRACT(HOUR FROM NOW() - al.created_at)::INT || 'h ago'
        WHEN al.created_at > NOW() - INTERVAL '7 days' THEN EXTRACT(DAY FROM NOW() - al.created_at)::INT || 'd ago'
        ELSE TO_CHAR(al.created_at, 'Mon DD')
    END AS time_ago
FROM activity_log al
LEFT JOIN users u ON al.actor_id = u.id
ORDER BY al.created_at DESC
LIMIT 20 OFFSET 0;


-- ---------------------------------------------------------------------------
-- 7. PORTFOLIO SEARCH — Full-Text + Filterable + Sortable + Paginated
-- ---------------------------------------------------------------------------
-- Parameters:
--   $1 = search_query (optional, e.g., 'auth api')
--   $2 = filter_status (optional, e.g., 'verified')
--   $3 = filter_type (optional, e.g., 'api')
--   $4 = sort_column (optional, default 'created_at')
--   $5 = sort_direction (optional, 'ASC' or 'DESC')
--   $6 = page_size (optional, default 20)
--   $7 = page_offset (optional, default 0)
-- Used by: Portfolio/Systems listing page
-- ---------------------------------------------------------------------------

-- 7a. Main search query
SELECT
    s.id,
    s.name,
    s.version,
    s.description,
    s.type,
    s.status,
    s.verification_score,
    s.tags,
    s.created_at,
    s.updated_at,
    u.first_name AS assigned_first_name,
    u.last_name AS assigned_last_name,
    u.email AS assigned_email,
    (SELECT COUNT(*) FROM evidence_uploads WHERE system_id = s.id) AS evidence_count,
    (SELECT COUNT(*) FROM verification_tasks WHERE system_id = s.id) AS task_count,
    ts_rank(s.search_vector, plainto_tsquery('english', COALESCE('auth', ''))) AS search_rank
FROM systems s
LEFT JOIN users u ON s.assigned_to = u.id
WHERE
    -- Full-text search (when search term provided)
    (COALESCE('auth', '') = '' OR s.search_vector @@ plainto_tsquery('english', 'auth'))
    -- Status filter
    AND (COALESCE('verified', '') = '' OR s.status = 'verified'::system_status)
    -- Type filter
    AND (COALESCE('api', '') = '' OR s.type = 'api'::system_type)
ORDER BY
    -- Sorting: search rank desc when searching, otherwise by specified column
    CASE WHEN COALESCE('auth', '') <> '' THEN ts_rank(s.search_vector, plainto_tsquery('english', 'auth')) END DESC NULLS LAST,
    s.created_at DESC
LIMIT 20 OFFSET 0;

-- 7b. Count query for pagination metadata (run same WHERE clauses)
SELECT COUNT(*)::INT AS total
FROM systems s
WHERE
    (COALESCE('auth', '') = '' OR s.search_vector @@ plainto_tsquery('english', 'auth'))
    AND (COALESCE('verified', '') = '' OR s.status = 'verified'::system_status)
    AND (COALESCE('api', '') = '' OR s.type = 'api'::system_type);


-- ---------------------------------------------------------------------------
-- 8. QUEUE TASKS — Filtering + Pagination
-- ---------------------------------------------------------------------------
-- Parameters:
--   $1 = filter_status (optional: pending/processing/completed/failed/cancelled)
--   $2 = filter_priority (optional: low/normal/high/critical)
--   $3 = filter_task_type (optional)
--   $4 = filter_system_id (optional UUID)
--   $5 = sort_by (default: created_at)
--   $6 = page_size, $7 = offset
-- Used by: Verification queue page
-- ---------------------------------------------------------------------------

-- 8a. Main queue query
SELECT
    vt.id,
    vt.task_id,
    vt.system_id,
    s.name AS system_name,
    s.type AS system_type,
    vt.task_type,
    vt.priority,
    vt.status,
    vt.progress,
    vt.assigned_to,
    u.first_name AS assigned_first_name,
    u.last_name AS assigned_last_name,
    vt.created_by,
    cb.first_name AS created_by_first_name,
    cb.last_name AS created_by_last_name,
    vt.started_at,
    vt.completed_at,
    vt.estimated_completion,
    vt.result_summary,
    vt.error_message,
    vt.created_at,
    vt.updated_at,
    (SELECT COUNT(*) FROM task_logs WHERE task_id = vt.id) AS log_count
FROM verification_tasks vt
LEFT JOIN systems s ON vt.system_id = s.id
LEFT JOIN users u ON vt.assigned_to = u.id
LEFT JOIN users cb ON vt.created_by = cb.id
WHERE
    (COALESCE('pending', '') = '' OR vt.status = 'pending'::task_status)
    AND (COALESCE('', '') = '' OR vt.priority = ''::task_priority)
    AND (COALESCE('', '') = '' OR vt.task_type = ''::task_type)
    AND (COALESCE('', '') = '' OR vt.system_id = ''::UUID)
ORDER BY
    CASE WHEN vt.status = 'pending' THEN 1
         WHEN vt.status = 'processing' THEN 2
         WHEN vt.status = 'completed' THEN 3
         WHEN vt.status = 'failed' THEN 4
         ELSE 5 END,
    CASE WHEN vt.priority = 'critical' THEN 1
         WHEN vt.priority = 'high' THEN 2
         WHEN vt.priority = 'normal' THEN 3
         ELSE 4 END,
    vt.created_at DESC
LIMIT 20 OFFSET 0;

-- 8b. Count for pagination
SELECT COUNT(*)::INT AS total
FROM verification_tasks vt
WHERE
    (COALESCE('pending', '') = '' OR vt.status = 'pending'::task_status)
    AND (COALESCE('', '') = '' OR vt.priority = ''::task_priority)
    AND (COALESCE('', '') = '' OR vt.task_type = ''::task_type)
    AND (COALESCE('', '') = '' OR vt.system_id = ''::UUID);

-- 8c. Queue status summary (for filter tabs)
SELECT
    status,
    COUNT(*)::INT AS count
FROM verification_tasks
GROUP BY status
ORDER BY
    CASE status
        WHEN 'pending' THEN 1
        WHEN 'processing' THEN 2
        WHEN 'completed' THEN 3
        WHEN 'failed' THEN 4
        WHEN 'cancelled' THEN 5
    END;


-- ---------------------------------------------------------------------------
-- 9. TASK LOGS — For a specific task
-- ---------------------------------------------------------------------------
-- Parameters: $1 = task_uuid
-- Used by: Task detail modal/drawer
-- ---------------------------------------------------------------------------
SELECT
    tl.id,
    tl.task_id,
    tl.level,
    tl.message,
    tl.metadata,
    tl.created_at,
    CASE
        WHEN tl.created_at > NOW() - INTERVAL '1 hour' THEN EXTRACT(MINUTE FROM NOW() - tl.created_at)::INT || 'm ago'
        WHEN tl.created_at > NOW() - INTERVAL '1 day' THEN EXTRACT(HOUR FROM NOW() - tl.created_at)::INT || 'h ago'
        ELSE TO_CHAR(tl.created_at, 'Mon DD, HH24:MI')
    END AS time_ago
FROM task_logs tl
WHERE tl.task_id = '00000000-0000-0000-0000-000000000000'  -- $1
ORDER BY tl.created_at DESC;


-- ---------------------------------------------------------------------------
-- 10. EVIDENCE UPLOADS — With system info (joined)
-- ---------------------------------------------------------------------------
-- Parameters: $1 = system_id (optional filter), $2 = limit, $3 = offset
-- Used by: Evidence gallery page, system detail evidence tab
-- ---------------------------------------------------------------------------
SELECT
    eu.id,
    eu.system_id,
    s.name AS system_name,
    s.type AS system_type,
    s.status AS system_status,
    eu.uploaded_by,
    u.first_name AS uploaded_by_first_name,
    u.last_name AS uploaded_by_last_name,
    u.email AS uploaded_by_email,
    eu.filename,
    eu.original_name,
    eu.file_path,
    eu.file_size,
    eu.mime_type,
    eu.evidence_type,
    eu.description,
    eu.priority,
    eu.tags,
    eu.status,
    eu.checksum,
    eu.created_at,
    eu.updated_at,
    eu.processed_at,
    -- Human-readable file size
    CASE
        WHEN eu.file_size >= 1073741824 THEN ROUND(eu.file_size / 1073741824.0, 1) || ' GB'
        WHEN eu.file_size >= 1048576 THEN ROUND(eu.file_size / 1048576.0, 1) || ' MB'
        WHEN eu.file_size >= 1024 THEN ROUND(eu.file_size / 1024.0, 1) || ' KB'
        ELSE eu.file_size || ' B'
    END AS file_size_human
FROM evidence_uploads eu
LEFT JOIN systems s ON eu.system_id = s.id
LEFT JOIN users u ON eu.uploaded_by = u.id
WHERE (COALESCE('', '') = '' OR eu.system_id = ''::UUID)
ORDER BY eu.created_at DESC
LIMIT 20 OFFSET 0;


-- ---------------------------------------------------------------------------
-- 11. SYSTEM DETAIL — With history and evidence (aggregated)
-- ---------------------------------------------------------------------------
-- Parameters: $1 = system_id
-- Used by: System detail page
-- ---------------------------------------------------------------------------

-- 11a. System base info
SELECT
    s.*,
    cb.email AS created_by_email,
    cb.first_name AS created_by_first_name,
    cb.last_name AS created_by_last_name,
    asg.email AS assigned_to_email,
    asg.first_name AS assigned_to_first_name,
    asg.last_name AS assigned_to_last_name
FROM systems s
LEFT JOIN users cb ON s.created_by = cb.id
LEFT JOIN users asg ON s.assigned_to = asg.id
WHERE s.id = 'd0a7f2a5-4b6e-7f80-2c1d-5e6f7a8b9c0d';  -- $1

-- 11b. System verification history (timeline)
SELECT
    vh.id,
    vh.event_type,
    vh.description,
    vh.performed_by,
    u.first_name AS performed_by_first_name,
    u.last_name AS performed_by_last_name,
    vh.metadata,
    vh.created_at
FROM verification_history vh
LEFT JOIN users u ON vh.performed_by = u.id
WHERE vh.system_id = 'd0a7f2a5-4b6e-7f80-2c1d-5e6f7a8b9c0d'  -- $1
ORDER BY vh.created_at DESC;

-- 11c. System evidence uploads
SELECT
    eu.id,
    eu.filename,
    eu.original_name,
    eu.file_size,
    eu.evidence_type,
    eu.priority,
    eu.status,
    eu.created_at
FROM evidence_uploads eu
WHERE eu.system_id = 'd0a7f2a5-4b6e-7f80-2c1d-5e6f7a8b9c0d'  -- $1
ORDER BY eu.created_at DESC;

-- 11d. System verification tasks
SELECT
    vt.id,
    vt.task_id,
    vt.task_type,
    vt.priority,
    vt.status,
    vt.progress,
    vt.started_at,
    vt.completed_at,
    vt.created_at
FROM verification_tasks vt
WHERE vt.system_id = 'd0a7f2a5-4b6e-7f80-2c1d-5e6f7a8b9c0d'  -- $1
ORDER BY vt.created_at DESC;

-- 11e. Aggregated summary (single row)
SELECT
    s.*,
    cb.first_name AS created_by_first_name,
    cb.last_name AS created_by_last_name,
    asg.first_name AS assigned_to_first_name,
    asg.last_name AS assigned_to_last_name,
    (SELECT COUNT(*) FROM evidence_uploads WHERE system_id = s.id) AS evidence_count,
    (SELECT COUNT(*) FROM verification_tasks WHERE system_id = s.id) AS task_count,
    (SELECT COUNT(*) FROM verification_tasks WHERE system_id = s.id AND status = 'completed') AS completed_task_count,
    (SELECT COUNT(*) FROM verification_tasks WHERE system_id = s.id AND status = 'failed') AS failed_task_count,
    (SELECT MAX(created_at) FROM verification_history WHERE system_id = s.id) AS last_activity,
    (SELECT COUNT(*) FROM verification_history WHERE system_id = s.id) AS history_count
FROM systems s
LEFT JOIN users cb ON s.created_by = cb.id
LEFT JOIN users asg ON s.assigned_to = asg.id
WHERE s.id = 'd0a7f2a5-4b6e-7f80-2c1d-5e6f7a8b9c0d';  -- $1


-- ---------------------------------------------------------------------------
-- 12. VERIFICATION HISTORY — System timeline
-- ---------------------------------------------------------------------------
-- Parameters: $1 = system_id
-- Used by: System detail timeline tab
-- ---------------------------------------------------------------------------
SELECT
    vh.id,
    vh.system_id,
    s.name AS system_name,
    vh.event_type,
    vh.description,
    vh.performed_by,
    u.first_name AS performed_by_first_name,
    u.last_name AS performed_by_last_name,
    u.avatar_url AS performed_by_avatar,
    vh.metadata,
    vh.created_at,
    -- Timeline grouping
    DATE_TRUNC('day', vh.created_at) AS day_group
FROM verification_history vh
LEFT JOIN systems s ON vh.system_id = s.id
LEFT JOIN users u ON vh.performed_by = u.id
WHERE vh.system_id = 'd0a7f2a5-4b6e-7f80-2c1d-5e6f7a8b9c0d'  -- $1
ORDER BY vh.created_at DESC;


-- ---------------------------------------------------------------------------
-- 13. TOP PERFORMERS / MOST ACTIVE USERS
-- ---------------------------------------------------------------------------
-- Used by: Dashboard team overview
-- ---------------------------------------------------------------------------
SELECT
    u.id,
    u.first_name,
    u.last_name,
    u.email,
    u.role,
    u.avatar_url,
    (SELECT COUNT(*) FROM verification_tasks WHERE assigned_to = u.id AND status = 'completed') AS tasks_completed,
    (SELECT COUNT(*) FROM verification_history WHERE performed_by = u.id) AS history_events,
    (SELECT COUNT(*) FROM activity_log WHERE actor_id = u.id) AS activity_count,
    (SELECT MAX(created_at) FROM verification_tasks WHERE assigned_to = u.id AND status = 'completed') AS last_completed_task
FROM users u
ORDER BY tasks_completed DESC NULLS LAST;


-- ---------------------------------------------------------------------------
-- 14. SYSTEMS WITH OPEN THREATS (Alert View)
-- ---------------------------------------------------------------------------
-- Used by: Dashboard threat alerts section
-- ---------------------------------------------------------------------------
SELECT
    s.id,
    s.name,
    s.version,
    s.type,
    s.status,
    s.verification_score,
    s.tags,
    s.assigned_to,
    u.first_name AS assigned_first_name,
    u.last_name AS assigned_last_name,
    (SELECT COUNT(*) FROM verification_tasks WHERE system_id = s.id AND status = 'failed') AS failed_tasks,
    (SELECT MAX(created_at) FROM verification_history WHERE system_id = s.id AND event_type = 'threat_detected') AS last_threat_at,
    (SELECT description FROM verification_history WHERE system_id = s.id AND event_type = 'threat_detected' ORDER BY created_at DESC LIMIT 1) AS latest_threat_description
FROM systems s
LEFT JOIN users u ON s.assigned_to = u.id
WHERE s.status = 'threat'
ORDER BY s.verification_score ASC, s.updated_at DESC;


-- ---------------------------------------------------------------------------
-- 15. WEEKLY TASK COMPLETION STATS
-- ---------------------------------------------------------------------------
-- Used by: Dashboard performance chart
-- ---------------------------------------------------------------------------
SELECT
    DATE_TRUNC('week', completed_at)::DATE AS week_start,
    COUNT(*) FILTER (WHERE status = 'completed') AS completed,
    COUNT(*) FILTER (WHERE status = 'failed') AS failed,
    AVG(EXTRACT(EPOCH FROM (completed_at - started_at))/3600)::NUMERIC(10,1) AS avg_duration_hours
FROM verification_tasks
WHERE completed_at >= NOW() - INTERVAL '12 weeks'
GROUP BY DATE_TRUNC('week', completed_at)
ORDER BY week_start;


-- ---------------------------------------------------------------------------
-- 16. EVIDENCE PROCESSING QUEUE
-- ---------------------------------------------------------------------------
-- Used by: Evidence management page
-- ---------------------------------------------------------------------------
SELECT
    eu.id,
    eu.system_id,
    s.name AS system_name,
    eu.original_name,
    eu.evidence_type,
    eu.priority,
    eu.status,
    eu.file_size,
    eu.created_at,
    eu.processed_at,
    CASE
        WHEN eu.processed_at IS NOT NULL THEN EXTRACT(EPOCH FROM (eu.processed_at - eu.created_at))::INT
        ELSE EXTRACT(EPOCH FROM (NOW() - eu.created_at))::INT
    END AS processing_seconds,
    u.first_name AS uploaded_by_first_name,
    u.last_name AS uploaded_by_last_name
FROM evidence_uploads eu
LEFT JOIN systems s ON eu.system_id = s.id
LEFT JOIN users u ON eu.uploaded_by = u.id
WHERE eu.status IN ('pending', 'processing')
ORDER BY
    CASE eu.priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
    eu.created_at DESC;


-- ---------------------------------------------------------------------------
-- 17. TAG CLOUD / TAG ANALYTICS
-- ---------------------------------------------------------------------------
-- Used by: Portfolio filter sidebar, tag management
-- ---------------------------------------------------------------------------
SELECT
    tag,
    COUNT(*)::INT AS usage_count
FROM systems, UNNEST(tags) AS tag
GROUP BY tag
ORDER BY usage_count DESC
LIMIT 30;


-- ---------------------------------------------------------------------------
-- 18. USER DETAIL WITH ACTIVITY SUMMARY
-- ---------------------------------------------------------------------------
-- Parameters: $1 = user_id
-- Used by: User profile page
-- ---------------------------------------------------------------------------
SELECT
    u.*,
    (SELECT COUNT(*) FROM systems WHERE created_by = u.id) AS systems_created,
    (SELECT COUNT(*) FROM systems WHERE assigned_to = u.id) AS systems_assigned,
    (SELECT COUNT(*) FROM verification_tasks WHERE assigned_to = u.id AND status = 'completed') AS tasks_completed,
    (SELECT COUNT(*) FROM verification_tasks WHERE assigned_to = u.id AND status = 'pending') AS tasks_pending,
    (SELECT COUNT(*) FROM evidence_uploads WHERE uploaded_by = u.id) AS evidence_uploaded,
    (SELECT COUNT(*) FROM activity_log WHERE actor_id = u.id) AS activity_entries
FROM users u
WHERE u.id = 'a7f4c9d2-1e3b-4c5d-9f8a-2b3c4d5e6f7a';  -- $1


-- ---------------------------------------------------------------------------
-- 19. SEARCH EVIDENCE BY TAGS
-- ---------------------------------------------------------------------------
-- Parameters: $1 = tag name
-- Used by: Evidence tag filter
-- ---------------------------------------------------------------------------
SELECT
    eu.*,
    s.name AS system_name
FROM evidence_uploads eu
LEFT JOIN systems s ON eu.system_id = s.id
WHERE eu.tags @> ARRAY['auth']  -- $1
ORDER BY eu.created_at DESC;


-- ---------------------------------------------------------------------------
-- 20. DASHBOARD NOTIFICATIONS (Recent alerts)
-- ---------------------------------------------------------------------------
-- Used by: Top-bar notification bell
-- ---------------------------------------------------------------------------
SELECT
    al.id,
    al.action_type,
    al.description,
    al.created_at,
    CASE
        WHEN al.action_type LIKE '%threat%' THEN 'critical'
        WHEN al.action_type = 'task_failed' THEN 'warning'
        WHEN al.action_type = 'task_completed' THEN 'success'
        ELSE 'info'
    END AS severity,
    u.first_name AS actor_first_name,
    u.last_name AS actor_last_name
FROM activity_log al
LEFT JOIN users u ON al.actor_id = u.id
WHERE al.created_at > NOW() - INTERVAL '7 days'
ORDER BY al.created_at DESC
LIMIT 10;
